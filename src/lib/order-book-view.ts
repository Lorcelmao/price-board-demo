import { isOpenOrder, type Order, type OrderBookState } from "../../shared/order-merge";
import { parsePriceInput, parseQuantityInput } from "./order-form-input";

// Logic hiển thị của sổ lệnh. Hàm thuần, test được bằng Node.

export type BookTab = "all" | "open";

// "Lệnh trong ngày" lấy tất cả; "Chờ khớp" chỉ lấy lệnh còn mở. Lệnh mới nhất ở trên.
export function ordersForTab(book: OrderBookState, tab: BookTab): Order[] {
  const orders = Object.values(book.orders);
  const filtered = tab === "open" ? orders.filter(isOpenOrder) : orders;
  // createdAt bằng nhau thì giữ thứ tự gốc, không phụ thuộc thứ tự duyệt Map.
  return filtered
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (b.item.createdAt - a.item.createdAt) || (a.index - b.index))
    .map((entry) => entry.item);
}

const STATUS_LABEL: Record<Order["status"], string> = {
  New: "Chờ khớp",
  PartiallyFilled: "Khớp một phần",
  Filled: "Đã khớp",
  Rejected: "Bị từ chối",
  Cancelled: "Đã huỷ",
};

// Lệnh đã huỷ vẫn là "Đã huỷ" dù đã khớp một phần hay khớp hết: trạng thái do server quyết định.
export const statusLabel = (order: Order): string => STATUS_LABEL[order.status] ?? order.status;

export const openCount = (book: OrderBookState): number => Object.values(book.orders).filter(isOpenOrder).length;

export interface ModifyChangeResult {
  change?: { price?: number; quantity?: number };
  error?: string;
}

// Dựng thay đổi cho POST /orders/<id>/modify. Luật của mock: mỗi lần chỉ đổi giá hoặc khối lượng,
// và khối lượng mới phải lớn hơn phần đã khớp. Câu lỗi giữ nguyên như server trả về.
export function modifyChange(order: Order, priceText: string, quantityText: string): ModifyChangeResult {
  const price = parsePriceInput(priceText);
  const quantity = parseQuantityInput(quantityText);

  if (price === null || Number.isNaN(price as number) || (price as number) <= 0) {
    return { error: "Lệnh LO cần nhập giá." };
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { error: "Khối lượng phải là số nguyên lớn hơn 0." };
  }

  const priceChanged = price !== order.price;
  const quantityChanged = quantity !== order.quantity;
  if (priceChanged && quantityChanged) {
    return { error: "Mỗi lần chỉ được sửa giá hoặc khối lượng, không sửa cả hai." };
  }
  if (!priceChanged && !quantityChanged) return { error: "Giá và khối lượng không thay đổi." };
  if (quantityChanged && quantity <= order.filledQty) {
    return { error: "Khối lượng mới phải lớn hơn phần đã khớp." };
  }

  return { change: priceChanged ? { price } : { quantity } };
}
