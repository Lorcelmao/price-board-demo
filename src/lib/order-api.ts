import type { Order } from "../../shared/order-merge";
import type { OrderDraft } from "../../shared/order-validation";
import type { SourceKey } from "./board-prefs";
import { authPost } from "./auth-fetch";

// Gửi lệnh tới mock server. Rào chắn an toàn: chỉ nguồn mock mới gọi mạng.
// Với ysflex hàm trả "forbidden" ngay, KHÔNG gọi fetch lần nào.
// Mọi đường dẫn là tương đối /api/..., đi qua proxy của Vite tới localhost:8790.

export type OrderResult =
  | { kind: "ok"; order: Order }
  | { kind: "rejected"; errors: Partial<Record<"type" | "price" | "quantity" | "form", string>>; order?: Order }
  | { kind: "conflict"; message: string }
  | { kind: "network"; message: string }
  | { kind: "forbidden"; message: string }
  // 401: phiên hết hạn; auth-fetch đã báo kho phiên, màn đăng nhập sẽ mở.
  | { kind: "unauthorized"; message: string };

const NETWORK_MESSAGE = "Không gửi được lệnh: mock server chưa chạy hoặc mất kết nối.";
const FORBIDDEN_MESSAGE = "Chỉ nguồn mock mới gửi được lệnh.";
const UNAUTHORIZED_MESSAGE = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";

interface PlaceResponse {
  order?: Order;
  errors?: Record<string, string>;
}

const isMock = (source: SourceKey): boolean => source === "mock";

// Phân loại phản hồi thành kết quả có kiểu, để giao diện hiện đúng chỗ.
async function call(path: string, body: unknown): Promise<OrderResult> {
  let status: number;
  let data: PlaceResponse & { error?: string };
  try {
    const response = await authPost<PlaceResponse & { error?: string }>(path, body);
    status = response.status;
    data = response.data;
  } catch {
    // fetch ném lỗi khi không kết nối được; không bao giờ để lọt ra ngoài.
    return { kind: "network", message: NETWORK_MESSAGE };
  }

  if (status >= 200 && status < 300 && data?.order) return { kind: "ok", order: data.order };
  if (status === 401) return { kind: "unauthorized", message: UNAUTHORIZED_MESSAGE };
  if (status === 409) {
    return { kind: "conflict", message: data?.error ?? "Không thực hiện được thao tác này.", ...(data?.order ? { order: data.order } : {}) };
  }
  if (status === 422) {
    const errors = data?.errors ?? {};
    return {
      kind: "rejected",
      errors: Object.keys(errors).length > 0 ? errors : { form: "Lệnh không hợp lệ." },
      order: data?.order,
    };
  }
  return { kind: "network", message: NETWORK_MESSAGE };
}

export async function placeOrder(source: SourceKey, draft: OrderDraft): Promise<OrderResult> {
  if (!isMock(source)) return { kind: "forbidden", message: FORBIDDEN_MESSAGE };
  return call("/orders", draft);
}

export async function cancelOrder(source: SourceKey, orderId: string): Promise<OrderResult> {
  if (!isMock(source)) return { kind: "forbidden", message: FORBIDDEN_MESSAGE };
  return call(`/orders/${encodeURIComponent(orderId)}/cancel`, {});
}

export async function modifyOrder(
  source: SourceKey,
  orderId: string,
  change: { price?: number; quantity?: number },
): Promise<OrderResult> {
  if (!isMock(source)) return { kind: "forbidden", message: FORBIDDEN_MESSAGE };
  return call(`/orders/${encodeURIComponent(orderId)}/modify`, change);
}
