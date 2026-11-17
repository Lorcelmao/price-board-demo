import { describe, expect, it } from "vitest";
import { AuthStore, SESSION_TTL_MS } from "./auth";
import { MOCK_USERS } from "./mock-users";

const user = MOCK_USERS[0];

const store = (start = 1_000) => {
  let now = start;
  const auth = new AuthStore(() => now);
  return { auth, advance: (ms: number) => { now += ms; } };
};

describe("AuthStore", () => {
  it("đăng nhập đúng trả token và thông tin tài khoản", () => {
    const { auth } = store();
    const result = auth.login(user.username, user.password);
    expect(result).not.toBeNull();
    expect(result?.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(result?.accountId).toBe(user.accountId);
    expect(auth.verify(result!.token)?.accountId).toBe(user.accountId);
  });

  it("sai mật khẩu hoặc sai tên đăng nhập trả null", () => {
    const { auth } = store();
    expect(auth.login(user.username, "sai")).toBeNull();
    expect(auth.login("khong-co", user.password)).toBeNull();
  });

  it("token lạ hoặc thiếu không hợp lệ", () => {
    const { auth } = store();
    expect(auth.verify("khong-phai-token")).toBeNull();
    expect(auth.verify(undefined)).toBeNull();
  });

  it("token hết hạn sau 8 giờ", () => {
    const { auth, advance } = store();
    const { token } = auth.login(user.username, user.password)!;
    advance(SESSION_TTL_MS - 1);
    expect(auth.verify(token)).not.toBeNull();
    advance(1);
    expect(auth.verify(token)).toBeNull();
  });

  it("đăng nhập lần hai thay token cũ và báo token bị thay", () => {
    const { auth } = store();
    const first = auth.login(user.username, user.password)!;
    const second = auth.login(user.username, user.password)!;
    expect(second.token).not.toBe(first.token);
    expect(second.replacedToken).toBe(first.token);
    expect(auth.verify(first.token)).toBeNull();
    expect(auth.verify(second.token)).not.toBeNull();
  });

  it("đăng xuất làm token hết hiệu lực", () => {
    const { auth } = store();
    const { token } = auth.login(user.username, user.password)!;
    expect(auth.logout(token)).toBe(true);
    expect(auth.verify(token)).toBeNull();
    expect(auth.logout(token)).toBe(false);
  });
});
