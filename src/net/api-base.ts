// Địa chỉ của mock server khi giao diện và server chạy ở hai nơi khác nhau (ví dụ Vercel và Render).
// Để trống khi chạy trên máy: trình duyệt gọi cùng host, Vite chuyển /api và /ws sang mock server.
const API_BASE = (import.meta.env.VITE_API_URL ?? "").trim().replace(/\/+$/, "");

// Bản deploy có server riêng. Bản này tắt nguồn YSFlex: trang công khai không kéo luồng giá của bên thứ ba.
export const REMOTE_API = API_BASE !== "";

export const apiUrl = (path: string): string => `${API_BASE}/api${path}`;

export const socketUrl = (): string => {
  if (REMOTE_API) return `${API_BASE.replace(/^http/, "ws")}/ws`;
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${location.host}/ws`;
};
