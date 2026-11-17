import { useSyncExternalStore } from "react";
import { apiUrl } from "../net/api-base";

// Phiên đăng nhập bản gọn: một token lưu trong sessionStorage
// (theo tab: đóng tab là mất), không có refresh token. Chỉ dùng với nguồn mock.

export interface SessionInfo {
  token: string;
  accountId: string;
  displayName: string;
  expiresAt: number;
}

export interface SessionState {
  session: SessionInfo | null;
  // true khi phiên vừa mất hiệu lực (hết hạn, bị đăng nhập nơi khác, server khởi động lại),
  // để màn đăng nhập nói rõ lý do. Đăng xuất chủ động thì false.
  expired: boolean;
}

export const SESSION_KEY = "price-board-demo:phien:v1";

const storage = (): Storage | null => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const read = (): SessionInfo | null => {
  try {
    const raw = storage()?.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SessionInfo>;
    if (typeof value.token !== "string" || typeof value.accountId !== "string") return null;
    return value as SessionInfo;
  } catch {
    return null;
  }
};

const write = (session: SessionInfo | null) => {
  try {
    if (session) storage()?.setItem(SESSION_KEY, JSON.stringify(session));
    else storage()?.removeItem(SESSION_KEY);
  } catch {
    /* sessionStorage bị chặn: phiên chỉ sống trong bộ nhớ của trang. */
  }
};

let state: SessionState = { session: read(), expired: false };
const listeners = new Set<() => void>();

const setState = (next: SessionState) => {
  state = next;
  write(next.session);
  listeners.forEach((listener) => listener());
};

export const getSession = (): SessionInfo | null => state.session;
export const getSessionState = (): SessionState => state;

export const onSessionChange = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useSession = (): SessionState => useSyncExternalStore(onSessionChange, () => state);

export type LoginOutcome = { ok: true } | { ok: false; error: string };

export async function login(username: string, password: string): Promise<LoginOutcome> {
  try {
    const response = await fetch(apiUrl("/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json();
    if (!response.ok) return { ok: false, error: data?.error ?? "Đăng nhập không thành công." };
    setState({ session: data as SessionInfo, expired: false });
    return { ok: true };
  } catch {
    return { ok: false, error: "Không kết nối được mock server." };
  }
}

export async function logout(): Promise<void> {
  const token = state.session?.token;
  setState({ session: null, expired: false });
  if (!token) return;
  try {
    await fetch(apiUrl("/logout"), { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  } catch {
    /* Server không trả lời thì phía trang vẫn coi như đã đăng xuất. */
  }
}

// Phiên mất hiệu lực (401 hoặc tin AUTH expired). Không gọi lại request nào, nên không thể lặp.
export function expire(): void {
  if (!state.session) return;
  setState({ session: null, expired: true });
}

// Lúc mở trang: token trong sessionStorage có thể đã chết (server khởi động lại, hết 8 giờ).
export async function checkSession(): Promise<void> {
  const token = state.session?.token;
  if (!token) return;
  try {
    const response = await fetch(apiUrl("/me"), { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 401) expire();
  } catch {
    /* Mock chưa chạy: giữ phiên, lần gọi sau sẽ biết. */
  }
}

// Chỉ dùng cho test.
export function resetSessionForTest(): void {
  state = { session: read(), expired: false };
}
