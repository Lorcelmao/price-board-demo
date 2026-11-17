import { expire, getSession } from "./session";

// Lời gọi API tài khoản: tự gắn token, gặp 401 thì báo phiên hết hạn.
// Thay cho apiGet/apiPost của web/lib/api.ts (hai hàm đó không gắn header).

const headers = (json: boolean): Record<string, string> => {
  const result: Record<string, string> = json ? { "Content-Type": "application/json" } : {};
  const token = getSession()?.token;
  if (token) result.Authorization = `Bearer ${token}`;
  return result;
};

export async function authGet<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`, { headers: headers(false) });
  if (response.status === 401) expire();
  if (!response.ok) throw new Error(`Không tải được ${path} (${response.status})`);
  return (await response.json()) as T;
}

// Trả về cả mã HTTP vì lệnh bị từ chối (422, 409) vẫn có nội dung cần đọc.
export async function authPost<T>(path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const response = await fetch(`/api${path}`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify(body ?? {}),
  });
  if (response.status === 401) expire();
  return { status: response.status, data: (await response.json()) as T };
}
