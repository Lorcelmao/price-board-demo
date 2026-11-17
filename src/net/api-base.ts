// Địa chỉ của server (gateway) khi giao diện và server chạy ở hai nơi khác nhau (ví dụ Vercel và Render).
// Để trống khi chạy trên máy: trình duyệt gọi cùng host, Vite chuyển /api và /ws sang server.
const API_BASE = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "");

export const apiUrl = (path: string): string => `${API_BASE}/api${path}`;

export const socketUrl = (): string => {
  if (API_BASE) return `${API_BASE.replace(/^http/, "ws")}/ws`;
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${location.host}/ws`;
};
