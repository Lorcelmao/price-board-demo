import type { Exchange, OrderType, Side } from "./market-rules";

export type OrderStatus = "New" | "PartiallyFilled" | "Filled" | "Rejected" | "Cancelled";

export interface Order {
  id: string;
  symbol: string;
  exchange: Exchange;
  side: Side;
  type: OrderType;
  price: number | null;
  quantity: number;
  filledQty: number;
  avgFillPrice: number;
  status: OrderStatus;
  rejectReason?: string;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface Fill {
  id: string;
  orderId: string;
  symbol: string;
  side: Side;
  price: number;
  quantity: number;
  time: number;
}

export interface OrderBookState {
  orders: Record<string, Order>;
  fills: Record<string, Fill[]>;
}

export const emptyOrderBook: OrderBookState = { orders: {}, fills: {} };

export const isOpenOrder = (order: Order) => order.status === "New" || order.status === "PartiallyFilled";

// Trạng thái kết thúc thì giữ nguyên. Lệnh đã huỷ dù khớp một phần vẫn là đã huỷ.
function statusFromFills(order: Order, filledQty: number): OrderStatus {
  if (order.status === "Cancelled" || order.status === "Rejected") return order.status;
  if (filledQty >= order.quantity) return "Filled";
  return filledQty > 0 ? "PartiallyFilled" : order.status;
}

function reconcile(order: Order, fills: Fill[]): Order {
  const qtyFromFills = fills.reduce((sum, fill) => sum + fill.quantity, 0);
  // Server có thể đã báo số khớp cao hơn số bản khớp client nhận được, ví dụ khi vừa kết nối lại.
  if (qtyFromFills < order.filledQty) return order;
  const value = fills.reduce((sum, fill) => sum + fill.price * fill.quantity, 0);
  return {
    ...order,
    filledQty: qtyFromFills,
    avgFillPrice: qtyFromFills === 0 ? 0 : value / qtyFromFills,
    status: statusFromFills(order, qtyFromFills),
  };
}

// Tin cũ đến muộn (version nhỏ hơn) bị bỏ qua để trạng thái không đi lùi.
export function mergeOrder(state: OrderBookState, incoming: Order): OrderBookState {
  const current = state.orders[incoming.id];
  if (current && incoming.version < current.version) return state;
  const merged = reconcile(incoming, state.fills[incoming.id] ?? []);
  return { ...state, orders: { ...state.orders, [incoming.id]: merged } };
}

// Cùng một bản khớp có thể đến hai lần khi kết nối lại, nên phải khử trùng theo id.
export function mergeFill(state: OrderBookState, fill: Fill): OrderBookState {
  const existing = state.fills[fill.orderId] ?? [];
  if (existing.some((item) => item.id === fill.id)) return state;
  const fills = [...existing, fill].sort((a, b) => a.time - b.time);
  const order = state.orders[fill.orderId];
  return {
    orders: order ? { ...state.orders, [order.id]: reconcile(order, fills) } : state.orders,
    fills: { ...state.fills, [fill.orderId]: fills },
  };
}
