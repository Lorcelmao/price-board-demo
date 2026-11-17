import {
  HOSE_MAX_ORDER_QTY,
  LOT_SIZE,
  allowedOrderTypes,
  effectivePhase,
  isOnTick,
  tickSize,
  type Exchange,
  type OrderType,
  type SessionPhase,
  type Side,
} from "./market-rules";

export interface OrderDraft {
  symbol: string;
  side: Side;
  type: OrderType;
  price: number | null;
  quantity: number;
}

export interface OrderContext {
  exchange: Exchange;
  ceil: number;
  floor: number;
  phase: SessionPhase;
  buyingPower: number;
  sellableQty: number;
  isForeign: boolean;
  foreignRoom: number;
  feeRate: number;
}

export type OrderErrors = Partial<Record<"type" | "price" | "quantity" | "form", string>>;

const money = (value: number) => value.toLocaleString("en-US");

// Lệnh thị trường và ATO, ATC chưa biết giá khớp, nên giữ tiền theo giá trần cho an toàn.
export function holdPrice(draft: Pick<OrderDraft, "side" | "type" | "price">, ceil: number): number {
  return draft.type === "LO" && draft.price !== null ? draft.price : ceil;
}

export function orderCost(price: number, quantity: number, feeRate: number): number {
  return Math.ceil(price * quantity * (1 + feeRate));
}

export function maxBuyQuantity(buyingPower: number, price: number, feeRate: number): number {
  if (price <= 0 || buyingPower <= 0) return 0;
  const shares = Math.floor(buyingPower / (price * (1 + feeRate)));
  return Math.floor(shares / LOT_SIZE) * LOT_SIZE;
}

function validateQuantity(draft: OrderDraft, ctx: OrderContext): string | undefined {
  const { quantity, type } = draft;
  if (!Number.isInteger(quantity) || quantity <= 0) return "Khối lượng phải là số nguyên lớn hơn 0.";
  if (quantity < LOT_SIZE) {
    return type === "LO" ? undefined : "Lô lẻ (dưới 100 cổ phiếu) chỉ được đặt bằng lệnh LO.";
  }
  if (quantity % LOT_SIZE !== 0) {
    return "Khối lượng phải là bội số của 100. Phần lẻ dưới 100 cần tách thành một lệnh riêng.";
  }
  if (ctx.exchange === "HOSE" && quantity > HOSE_MAX_ORDER_QTY) {
    return `HOSE giới hạn tối đa ${money(HOSE_MAX_ORDER_QTY)} cổ phiếu mỗi lệnh.`;
  }
  return undefined;
}

function validatePrice(draft: OrderDraft, ctx: OrderContext): string | undefined {
  if (draft.type !== "LO") return undefined;
  const { price } = draft;
  if (price === null || !Number.isFinite(price) || price <= 0) return "Lệnh LO cần nhập giá.";
  if (price > ctx.ceil) return `Giá cao hơn giá trần ${money(ctx.ceil)}.`;
  if (price < ctx.floor) return `Giá thấp hơn giá sàn ${money(ctx.floor)}.`;
  if (!isOnTick(price, ctx.exchange)) {
    return `Sai bước giá. Ở mức giá này, giá phải chia hết cho ${tickSize(price, ctx.exchange)} đồng.`;
  }
  return undefined;
}

// Trả về lỗi theo từng ô để form hiện đúng chỗ. Không có lỗi nào nghĩa là lệnh hợp lệ.
export function validateOrder(draft: OrderDraft, ctx: OrderContext): OrderErrors {
  const errors: OrderErrors = {};
  if (effectivePhase(ctx.exchange, ctx.phase) === "CLOSED") {
    errors.form = "Thị trường đang đóng cửa, chưa thể đặt lệnh.";
    return errors;
  }

  if (!allowedOrderTypes(ctx.exchange, ctx.phase).includes(draft.type)) {
    errors.type = `Lệnh ${draft.type} không dùng được trên ${ctx.exchange} trong đợt này.`;
  }
  const priceError = validatePrice(draft, ctx);
  if (priceError) errors.price = priceError;
  const quantityError = validateQuantity(draft, ctx);
  if (quantityError) errors.quantity = quantityError;
  if (errors.price || errors.quantity) return errors;

  if (draft.side === "BUY") {
    const cost = orderCost(holdPrice(draft, ctx.ceil), draft.quantity, ctx.feeRate);
    if (cost > ctx.buyingPower) {
      errors.form = `Không đủ sức mua. Lệnh cần ${money(cost)} đồng, sức mua còn ${money(ctx.buyingPower)} đồng.`;
    }
    if (ctx.isForeign && draft.quantity > ctx.foreignRoom) {
      errors.quantity = `Vượt room nước ngoài. Room còn ${money(ctx.foreignRoom)} cổ phiếu.`;
    }
  } else if (draft.quantity > ctx.sellableQty) {
    errors.form = `Không đủ cổ phiếu khả dụng. Bạn chỉ bán được ${money(ctx.sellableQty)} cổ phiếu.`;
  }
  return errors;
}

export function hasErrors(errors: OrderErrors): boolean {
  return Object.keys(errors).length > 0;
}
