// Quy tắc thị trường dùng chung cho cả server và giao diện.
// Nguồn và mức độ chắc chắn của từng quy tắc được ghi trong README.md.

export type Exchange = "HOSE" | "HNX" | "UPCOM";
export type Side = "BUY" | "SELL";
export type OrderType = "LO" | "ATO" | "ATC" | "MTL" | "MOK" | "MAK";
export type SessionPhase = "ATO" | "CONTINUOUS" | "ATC" | "CLOSED";

export const LOT_SIZE = 100;
export const HOSE_MAX_ORDER_QTY = 500_000;

const BAND_PERCENT: Record<Exchange, number> = { HOSE: 7, HNX: 10, UPCOM: 15 };

export function tickSize(price: number, exchange: Exchange): number {
  if (exchange !== "HOSE") return 100;
  if (price < 10_000) return 10;
  return price < 50_000 ? 50 : 100;
}

export function isOnTick(price: number, exchange: Exchange): boolean {
  return price % tickSize(price, exchange) === 0;
}

// Mức giá liền trên. Tại ranh giới 50,000 bước giá đổi, nên phải hỏi bước giá tại chính mức hiện tại.
export function priceAbove(price: number, exchange: Exchange): number {
  return price + tickSize(price, exchange);
}

// Mức giá liền dưới. Hỏi bước giá của price - 1 để 50,000 đi xuống 49,950 chứ không phải 49,900.
export function priceBelow(price: number, exchange: Exchange): number {
  return price - tickSize(price - 1, exchange);
}

export interface PriceLimits {
  ceil: number;
  floor: number;
}

export function calcLimits(ref: number, exchange: Exchange): PriceLimits {
  const pct = BAND_PERCENT[exchange];
  const rawCeil = (ref * (100 + pct)) / 100;
  const rawFloor = (ref * (100 - pct)) / 100;
  const ceilTick = tickSize(rawCeil, exchange);
  const floorTick = tickSize(rawFloor, exchange);
  // Trần làm tròn xuống, sàn làm tròn lên, để không vượt biên độ. 1e-9 chống sai số số thực.
  let ceil = Math.floor(rawCeil / ceilTick + 1e-9) * ceilTick;
  let floor = Math.ceil(rawFloor / floorTick - 1e-9) * floorTick;
  // Mã giá thấp: biên độ nhỏ hơn một bước giá thì vẫn phải có một bước để giao dịch.
  if (ceil <= ref) ceil = ref + ceilTick;
  if (floor >= ref) floor = ref - floorTick;
  return { ceil, floor };
}

// HNX không có ATO. UPCoM chỉ khớp liên tục. Server chỉ có một đồng hồ phiên chung
// nên mỗi sàn phải tự quy đổi về đợt thực tế của mình.
export function effectivePhase(exchange: Exchange, phase: SessionPhase): SessionPhase {
  if (exchange === "HNX" && phase === "ATO") return "CONTINUOUS";
  if (exchange === "UPCOM" && (phase === "ATO" || phase === "ATC")) return "CONTINUOUS";
  return phase;
}

const ALLOWED_ORDER_TYPES: Record<Exchange, Partial<Record<SessionPhase, OrderType[]>>> = {
  HOSE: { ATO: ["LO", "ATO"], CONTINUOUS: ["LO", "MTL"], ATC: ["LO", "ATC"] },
  HNX: { CONTINUOUS: ["LO", "MTL", "MOK", "MAK"], ATC: ["LO", "ATC"] },
  UPCOM: { CONTINUOUS: ["LO"] },
};

export function allowedOrderTypes(exchange: Exchange, phase: SessionPhase): OrderType[] {
  return ALLOWED_ORDER_TYPES[exchange][effectivePhase(exchange, phase)] ?? [];
}

export function canCancelOrModify(exchange: Exchange, phase: SessionPhase): boolean {
  return effectivePhase(exchange, phase) === "CONTINUOUS";
}
