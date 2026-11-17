import { canCancelOrModify, effectivePhase, priceAbove, priceBelow, type SessionPhase } from "../shared/market-rules";
import { isOpenOrder, type Fill, type Order } from "../shared/order-merge";
import {
  hasErrors,
  holdPrice,
  orderCost,
  validateOrder,
  type OrderContext,
  type OrderDraft,
  type OrderErrors,
} from "../shared/order-validation";
import type { Account } from "./account";
import type { MarketSimulator, SymbolState } from "./market-simulator";

export type EngineEvent =
  | { kind: "order"; order: Order }
  | { kind: "fill"; fill: Fill }
  | { kind: "balance" };

export interface ModifyRequest {
  price?: number;
  quantity?: number;
}

const AUCTION_MARKET_VOLUME = 1_000;

const firstError = (errors: OrderErrors) => Object.values(errors)[0] ?? "Lệnh không hợp lệ.";

// Mô phỏng sàn khớp lệnh và công ty chứng khoán
// Lệnh người dùng không xếp hàng cùng người khác: giá chạm đến là được khớp, theo khối lượng của giao dịch đó.
export class OrderEngine {
  readonly orders = new Map<string, Order>();
  readonly fills: Fill[] = [];
  // Server khởi động lại thì đếm lại từ 1. Nếu không có phần này, số hiệu mới sẽ trùng số hiệu cũ
  // mà trình duyệt còn giữ, và bản khớp của lệnh cũ bị ghép nhầm vào lệnh mới.
  private readonly runId = Date.now().toString(36).slice(-4);
  private seq = 0;
  private fillSeq = 0;
  // Lệnh đang quét sổ. Giao dịch do chính nó tạo ra không được khớp ngược lại nó lần nữa.
  private takerId: string | null = null;
  private listeners = new Set<(event: EngineEvent) => void>();

  constructor(
    private readonly market: MarketSimulator,
    private readonly account: Account,
  ) {
    market.onTrade((state) => this.matchRestingOrders(state));
  }

  onEvent(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  holdFunds(excludeOrderId?: string): number {
    let total = 0;
    for (const order of this.orders.values()) {
      if (order.side !== "BUY" || !isOpenOrder(order) || order.id === excludeOrderId) continue;
      const ceil = this.market.get(order.symbol)?.ceil ?? 0;
      total += orderCost(holdPrice(order, ceil), order.quantity - order.filledQty, this.account.feeRate);
    }
    return total;
  }

  holdQty(symbol: string, excludeOrderId?: string): number {
    let total = 0;
    for (const order of this.orders.values()) {
      if (order.side === "SELL" && order.symbol === symbol && isOpenOrder(order) && order.id !== excludeOrderId) {
        total += order.quantity - order.filledQty;
      }
    }
    return total;
  }

  contextFor(state: SymbolState, excludeOrderId?: string): OrderContext {
    return {
      exchange: state.exchange,
      ceil: state.ceil,
      floor: state.floor,
      phase: this.market.phase,
      buyingPower: this.account.buyingPower(this.holdFunds(excludeOrderId)),
      sellableQty: this.account.holding(state.symbol).available - this.holdQty(state.symbol, excludeOrderId),
      isForeign: this.account.isForeign,
      foreignRoom: state.room,
      feeRate: this.account.feeRate,
    };
  }

  // Luồng chuẩn: kiểm tra lại toàn bộ ở server, ghi nhận lệnh, rồi thử khớp ngay.
  place(draft: OrderDraft): { order: Order; errors?: OrderErrors } {
    const state = this.market.get(draft.symbol);
    const errors: OrderErrors = state
      ? validateOrder(draft, this.contextFor(state))
      : { form: `Không tìm thấy mã ${draft.symbol}.` };

    const now = Date.now();
    const order: Order = {
      id: `ORD-${this.runId}-${String(++this.seq).padStart(5, "0")}`,
      symbol: draft.symbol,
      exchange: state?.exchange ?? "HOSE",
      side: draft.side,
      type: draft.type,
      price: draft.type === "LO" ? draft.price : null,
      quantity: draft.quantity,
      filledQty: 0,
      avgFillPrice: 0,
      status: "New",
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.orders.set(order.id, order);

    if (hasErrors(errors) || !state) {
      order.status = "Rejected";
      order.rejectReason = firstError(errors);
      this.emit({ kind: "order", order: { ...order } });
      return { order: { ...order }, errors };
    }

    this.emit({ kind: "order", order: { ...order } });
    this.emit({ kind: "balance" });
    this.executeOnArrival(order, state);
    return { order: { ...order } };
  }

  cancel(orderId: string): { order?: Order; error?: string } {
    const order = this.orders.get(orderId);
    if (!order) return { error: "Không tìm thấy lệnh." };
    if (!isOpenOrder(order)) return { error: "Lệnh đã kết thúc, không thể huỷ." };
    if (!canCancelOrModify(order.exchange, this.market.phase)) {
      return { error: "Đang trong đợt khớp định kỳ hoặc đóng cửa, chưa được huỷ lệnh." };
    }
    this.closeOrder(order);
    return { order: { ...order } };
  }

  // Trên KRX mỗi lần sửa chỉ được đổi giá hoặc khối lượng, không đổi cả hai.
  modify(orderId: string, change: ModifyRequest): { order?: Order; error?: string } {
    const order = this.orders.get(orderId);
    if (!order) return { error: "Không tìm thấy lệnh." };
    if (!isOpenOrder(order)) return { error: "Lệnh đã kết thúc, không thể sửa." };
    if (!canCancelOrModify(order.exchange, this.market.phase)) {
      return { error: "Đang trong đợt khớp định kỳ hoặc đóng cửa, chưa được sửa lệnh." };
    }
    if (order.type !== "LO") return { error: "Bài tập này chỉ cho sửa lệnh LO." };
    const newPrice = change.price ?? order.price;
    const newQty = change.quantity ?? order.quantity;
    const priceChanged = newPrice !== order.price;
    const qtyChanged = newQty !== order.quantity;
    if (priceChanged && qtyChanged) return { error: "Mỗi lần chỉ được sửa giá hoặc khối lượng, không sửa cả hai." };
    if (!priceChanged && !qtyChanged) return { error: "Giá và khối lượng không thay đổi." };
    if (newQty <= order.filledQty) return { error: "Khối lượng mới phải lớn hơn phần đã khớp." };

    const state = this.market.get(order.symbol);
    if (!state) return { error: "Không tìm thấy mã." };
    // Kiểm tra trên tổng khối lượng mới, nên phải cộng lại phần đã khớp vào sức mua và sức bán.
    const context = this.contextFor(state, order.id);
    context.buyingPower += orderCost(newPrice ?? state.ceil, order.filledQty, this.account.feeRate);
    context.sellableQty += order.filledQty;
    const errors = validateOrder(
      { symbol: order.symbol, side: order.side, type: order.type, price: newPrice, quantity: newQty },
      context,
    );
    if (hasErrors(errors)) return { error: firstError(errors) };

    order.price = newPrice;
    order.quantity = newQty;
    this.touch(order);
    this.emit({ kind: "order", order: { ...order } });
    this.emit({ kind: "balance" });
    this.executeOnArrival(order, state);
    return { order: { ...order } };
  }

  // Chuyển đợt: rời đợt định kỳ thì chốt giá một lần, mọi lệnh đang gom được xử lý tại giá đó.
  setPhase(next: SessionPhase): void {
    const previous = this.market.phase;
    if (previous === next) return;
    if (previous === "ATO" || previous === "ATC") this.runAuction(previous);
    this.market.setPhase(next);
    if (next === "CLOSED") this.expireAll();
  }

  advanceDay(): void {
    this.expireAll();
    this.account.advanceDay();
    this.emit({ kind: "balance" });
  }

  private executeOnArrival(order: Order, state: SymbolState): void {
    const phase = effectivePhase(state.exchange, this.market.phase);
    if (phase !== "CONTINUOUS") return;

    if (order.type === "MOK" && this.availableAgainst(order, state) < order.quantity) {
      this.closeOrder(order);
      return;
    }
    const lastFillPrice = this.sweepBook(order, state);
    if (!isOpenOrder(order)) return;

    if (order.type === "MTL") {
      // MTL khớp được tới đâu, phần còn lại thành LO cách mức khớp cuối một bước giá.
      if (lastFillPrice === null) {
        this.closeOrder(order);
        return;
      }
      order.price =
        order.side === "BUY"
          ? Math.min(state.ceil, priceAbove(lastFillPrice, state.exchange))
          : Math.max(state.floor, priceBelow(lastFillPrice, state.exchange));
      order.type = "LO";
      this.touch(order);
      this.emit({ kind: "order", order: { ...order } });
    } else if (order.type === "MAK" || order.type === "MOK") {
      this.closeOrder(order);
    }
  }

  private crosses(order: Order, price: number): boolean {
    if (order.price === null) return true;
    return order.side === "BUY" ? price <= order.price : price >= order.price;
  }

  private availableAgainst(order: Order, state: SymbolState): number {
    const levels = order.side === "BUY" ? state.asks : state.bids;
    return levels.filter(([price]) => this.crosses(order, price)).reduce((sum, [, volume]) => sum + volume, 0);
  }

  // Quét các mức giá đối ứng từ tốt nhất trở đi. Mỗi mức tạo một bản khớp riêng.
  private sweepBook(order: Order, state: SymbolState): number | null {
    const levels = order.side === "BUY" ? [...state.asks] : [...state.bids];
    let lastPrice: number | null = null;
    let swept = 0;
    for (const [price, volume] of levels) {
      const remaining = order.quantity - order.filledQty;
      if (remaining <= 0 || !this.crosses(order, price)) break;
      const quantity = Math.min(remaining, volume);
      this.market.takeLiquidity(state.symbol, price, quantity);
      this.applyFill(order, price, quantity);
      lastPrice = price;
      swept += quantity;
    }
    if (lastPrice !== null) {
      this.takerId = order.id;
      this.market.recordTrade(state.symbol, lastPrice, swept, order.side);
      this.takerId = null;
    }
    return lastPrice;
  }

  private matchRestingOrders(state: SymbolState): void {
    if (state.last === null) return;
    for (const order of this.orders.values()) {
      if (order.id === this.takerId || order.symbol !== state.symbol) continue;
      if (!isOpenOrder(order) || order.type !== "LO" || !this.crosses(order, state.last)) continue;
      // Khớp tối đa bằng khối lượng giao dịch vừa xảy ra, nhờ đó thấy được trạng thái khớp một phần.
      const quantity = Math.min(order.quantity - order.filledQty, state.lastVolume);
      if (quantity > 0) this.applyFill(order, order.price ?? state.last, quantity);
    }
  }

  private runAuction(phase: "ATO" | "ATC"): void {
    for (const state of this.market.symbols.values()) {
      if (effectivePhase(state.exchange, phase) !== phase) continue;
      const pending = [...this.orders.values()].filter((order) => order.symbol === state.symbol && isOpenOrder(order));
      const auctionPrice = state.expected;
      const matched = pending.filter((order) => order.type === phase || this.crosses(order, auctionPrice));
      let volume = 0;
      for (const order of matched) {
        const quantity = order.quantity - order.filledQty;
        this.applyFill(order, auctionPrice, quantity);
        volume += quantity;
      }
      // Cộng thêm thanh khoản của người khác để mã nào cũng có giá mở hoặc đóng cửa.
      this.market.recordTrade(state.symbol, auctionPrice, volume + AUCTION_MARKET_VOLUME, "BUY");
    }
  }

  private applyFill(order: Order, price: number, quantity: number): void {
    const fill: Fill = {
      id: `FILL-${this.runId}-${String(++this.fillSeq).padStart(6, "0")}`,
      orderId: order.id,
      symbol: order.symbol,
      side: order.side,
      price,
      quantity,
      time: Date.now(),
    };
    this.fills.unshift(fill);
    const value = order.avgFillPrice * order.filledQty + price * quantity;
    order.filledQty += quantity;
    order.avgFillPrice = value / order.filledQty;
    order.status = order.filledQty >= order.quantity ? "Filled" : "PartiallyFilled";
    this.touch(order);
    if (order.side === "BUY") this.account.settleBuyFill(fill);
    else this.account.settleSellFill(fill);
    this.emit({ kind: "fill", fill });
    this.emit({ kind: "order", order: { ...order } });
    this.emit({ kind: "balance" });
  }

  private closeOrder(order: Order): void {
    order.status = "Cancelled";
    this.touch(order);
    this.emit({ kind: "order", order: { ...order } });
    this.emit({ kind: "balance" });
  }

  private expireAll(): void {
    for (const order of this.orders.values()) if (isOpenOrder(order)) this.closeOrder(order);
  }

  private touch(order: Order): void {
    order.version += 1;
    order.updatedAt = Date.now();
  }

  private emit(event: EngineEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
