import { useSyncExternalStore } from "react";
import { emptyOrderBook, mergeFill, mergeOrder, type Fill, type Order, type OrderBookState } from "../../shared/order-merge";
import type { AccountDto, PositionDto, ServerMessage } from "../../shared/protocol";
import type { SourceKey } from "./board-prefs";
import { authGet } from "./auth-fetch";
import { getSession } from "./session";
import { openCount } from "./order-book-view";

// Kho tài khoản của giao diện.
// Không import web/lib/account-store.ts hay web/lib/market-store.ts: hai file đó dùng một
// MarketClient khác và sẽ mở thêm kết nối. Kết nối dùng ở đây là kết nối mock đang có,
// truyền vào qua onAccountMessage / watchAccount của mock-source.ts.

export interface AccountState {
  book: OrderBookState;
  account: AccountDto | null;
  positions: PositionDto[];
  // Lệnh vừa có bản khớp, để sổ lệnh nháy dòng.
  recentFillOrderId: { id: string; at: number } | null;
  // Tin ACCOUNT|BALANCE đánh dấu cần tải lại số dư; hàm gom gọi REST một lần.
  balanceDirty: boolean;
}

export const createAccountState = (): AccountState => ({
  book: emptyOrderBook,
  account: null,
  positions: [],
  recentFillOrderId: null,
  balanceDirty: false,
});

// Phần gộp tin là hàm thuần, test được bằng Node.
export function applyAccountMessage(state: AccountState, message: ServerMessage): AccountState {
  if (!("topic" in message)) return state;

  if (message.topic === "ACCOUNT|ORDER") {
    return { ...state, book: mergeOrder(state.book, message.order) };
  }
  if (message.topic === "ACCOUNT|FILL") {
    return {
      ...state,
      book: mergeFill(state.book, message.fill),
      recentFillOrderId: { id: message.fill.orderId, at: Date.now() },
    };
  }
  if (message.topic === "ACCOUNT|BALANCE") {
    return { ...state, balanceDirty: true };
  }
  return state;
}

// Gộp kết quả REST vào sổ: bản khớp trước rồi lệnh, để lệnh có sẵn số khớp đã tính.
// mergeFill khử trùng theo id nên tải lại nhiều lần không cộng hai lần.
export function mergeOrderList(state: AccountState, orders: Order[], fills: Fill[]): AccountState {
  let book = state.book;
  for (const fill of fills) book = mergeFill(book, fill);
  for (const order of orders) book = mergeOrder(book, order);
  return { ...state, book };
}

// ---- Kho cho giao diện ----

let state: AccountState = createAccountState();
const listeners = new Set<() => void>();

const setState = (next: AccountState) => {
  if (next === state) return;
  state = next;
  listeners.forEach((listener) => listener());
};

export const getAccountState = (): AccountState => state;

// Chỉ dùng cho test và khi chuyển nguồn.
export const resetAccountState = (): void => setState(createAccountState());

export function onAccountMessage(message: ServerMessage): void {
  // Tin đến muộn sau khi đăng xuất thì bỏ qua, để kho không có lại dữ liệu của phiên cũ.
  if (!getSession()) return;
  const next = applyAccountMessage(state, message);
  setState(next);
  // Tin BALANCE tới liền nhau (mỗi bản khớp sinh một tin) nên gom trong 100ms thành một lần tải.
  if (message && "topic" in message && message.topic === "ACCOUNT|BALANCE") scheduleBalanceRefresh();
}

let balanceTimer: ReturnType<typeof setTimeout> | undefined;
const scheduleBalanceRefresh = () => {
  clearTimeout(balanceTimer);
  balanceTimer = setTimeout(() => void refreshBalances(), 100);
};

export async function refreshBalances(): Promise<void> {
  try {
    const [account, positions] = await Promise.all([
      authGet<AccountDto>("/account"),
      authGet<PositionDto[]>("/portfolio"),
    ]);
    // Đăng xuất trong lúc đang tải thì không ghi số của phiên cũ vào kho.
    if (!getSession()) return;
    setState({ ...state, account, positions, balanceDirty: false });
  } catch {
    // Mock server chưa chạy: giữ số cũ, không làm sập trang.
  }
}

export async function refreshOrders(): Promise<void> {
  try {
    const [orders, fills] = await Promise.all([
      authGet<Order[]>("/orders"),
      authGet<Fill[]>("/fills"),
    ]);
    if (!getSession()) return;
    // Bản khớp xếp cũ trước để thứ tự thời gian đúng khi gộp.
    setState(mergeOrderList(state, orders, [...fills].sort((a, b) => a.time - b.time)));
  } catch {
    /* như trên */
  }
}

// Phản hồi REST của lệnh vừa đặt được gộp ngay, không đợi tin đẩy.
export function applyOrderResponse(order: Order): void {
  setState({ ...state, book: mergeOrder(state.book, order) });
}

// Tải lại cả bốn REST. Gọi lúc mở trang và mỗi lần kết nối lại.
export async function loadAccount(source: SourceKey): Promise<void> {
  if (source !== "mock" || !getSession()) return;
  await Promise.all([refreshOrders(), refreshBalances()]);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useAccountState(): AccountState {
  return useSyncExternalStore(subscribe, () => state);
}

// Chỉ trả về một con số: component dùng hook này chỉ vẽ lại khi số lệnh đang chờ đổi,
// không vẽ lại theo từng lần khớp. App dùng nó cho nút "Sổ lệnh (n)" để bảng giá không bị kéo theo.
export function useOpenOrderCount(): number {
  return useSyncExternalStore(subscribe, () => openCount(state.book));
}

// Đọc lệnh mới nhất theo id, để hộp thoại sửa không giữ bản chụp cũ của lệnh.
export function useOrder(id: string): Order | undefined {
  return useSyncExternalStore(subscribe, () => state.book.orders[id]);
}
