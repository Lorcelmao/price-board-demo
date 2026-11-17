import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authGet } from "./auth-fetch";
import { expire, getSessionState, login, logout, resetSessionForTest, SESSION_KEY } from "./session";

// sessionStorage giả cho Node.
function installStorage(throwing = false) {
  const data = new Map<string, string>();
  const fake = {
    getItem: (key: string) => { if (throwing) throw new Error("blocked"); return data.get(key) ?? null; },
    setItem: (key: string, value: string) => { if (throwing) throw new Error("blocked"); data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
  vi.stubGlobal("window", { sessionStorage: fake });
  return data;
}

const okLogin = { token: "t-1", accountId: "DEMO000001", displayName: "Demo", expiresAt: 9e15 };

function installFetch(handler: (url: string, init?: RequestInit) => { status: number; body?: unknown }) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const { status, body } = handler(url, init);
    return { status, ok: status >= 200 && status < 300, json: async () => body ?? {} } as Response;
  });
  return calls;
}

beforeEach(() => {
  installStorage();
  resetSessionForTest();
});
afterEach(() => vi.unstubAllGlobals());

describe("phiên đăng nhập", () => {
  it("đăng nhập đúng lưu phiên vào sessionStorage", async () => {
    const data = installStorage();
    resetSessionForTest();
    installFetch(() => ({ status: 200, body: okLogin }));
    expect(await login("demo", "demo123")).toEqual({ ok: true });
    expect(getSessionState().session?.token).toBe("t-1");
    expect(JSON.parse(data.get(SESSION_KEY)!).token).toBe("t-1");
  });

  it("đọc lại phiên đã lưu khi nạp lại trang", () => {
    const data = installStorage();
    data.set(SESSION_KEY, JSON.stringify(okLogin));
    resetSessionForTest();
    expect(getSessionState().session?.accountId).toBe("DEMO000001");
  });

  it("sai mật khẩu trả câu lỗi của server, không lưu gì", async () => {
    installFetch(() => ({ status: 401, body: { error: "Sai tên đăng nhập hoặc mật khẩu." } }));
    expect(await login("demo", "x")).toEqual({ ok: false, error: "Sai tên đăng nhập hoặc mật khẩu." });
    expect(getSessionState().session).toBeNull();
  });

  it("sessionStorage bị chặn vẫn đăng nhập được trong bộ nhớ", async () => {
    installStorage(true);
    resetSessionForTest();
    installFetch(() => ({ status: 200, body: okLogin }));
    expect(await login("demo", "demo123")).toEqual({ ok: true });
    expect(getSessionState().session?.token).toBe("t-1");
  });

  it("đăng xuất xoá phiên, không đánh dấu hết hạn, có gửi token lên server", async () => {
    const calls = installFetch(() => ({ status: 200, body: okLogin }));
    await login("demo", "demo123");
    await logout();
    expect(getSessionState()).toEqual({ session: null, expired: false });
    const last = calls.at(-1)!;
    expect(last.url).toBe("/api/logout");
    expect((last.init?.headers as Record<string, string>).Authorization).toBe("Bearer t-1");
  });

  it("expire xoá phiên và đánh dấu hết hạn", async () => {
    installFetch(() => ({ status: 200, body: okLogin }));
    await login("demo", "demo123");
    expire();
    expect(getSessionState()).toEqual({ session: null, expired: true });
  });

  it("authGet gắn token, gặp 401 thì phiên hết hạn và không gọi lại", async () => {
    const calls = installFetch((url) => (url === "/api/login" ? { status: 200, body: okLogin } : { status: 401 }));
    await login("demo", "demo123");
    await expect(authGet("/orders")).rejects.toThrow();
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe("Bearer t-1");
    expect(calls).toHaveLength(2);
    expect(getSessionState().expired).toBe(true);
  });
});
