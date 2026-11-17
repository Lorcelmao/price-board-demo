import type { OrderContext, OrderDraft } from "../../shared/order-validation";
import type { Exchange, SessionPhase } from "../../shared/market-rules";
import type { AccountDto, PositionDto } from "../../shared/protocol";
import type { BoardQuote } from "./quote-store-core";

// Dựng nháp lệnh từ ô được bấm đúp, và dựng ctx cho validateOrder.
// Hàm thuần: không đụng React, không gọi mạng, không gửi lệnh.

// Ô nào mở form. Khối lượng không nằm trong danh sách này nên bấm đúp vào đó không mở gì.
export interface CellKind {
  kind: "ask" | "bid" | "symbol" | "last" | "quantity";
  level?: 0 | 1 | 2;
}

export type DraftSeed = Pick<OrderDraft, "side" | "type" | "price" | "quantity">;

const FIRST_LOT = 100;

// Dư bán mở Mua (muốn mua ngay thì khớp người đang bán); dư mua mở Bán.
// Mã CK và Giá khớp mở Mua theo giá khớp; chưa có giá khớp thì theo giá dự khớp, rồi TC.
export function draftFromCell(cell: CellKind, quote: BoardQuote): DraftSeed | null {
  if (cell.kind === "ask") {
    const price = quote.asks[cell.level ?? 0]?.[0];
    if (!price) return null;
    return { side: "BUY", type: "LO", price, quantity: FIRST_LOT };
  }

  if (cell.kind === "bid") {
    const price = quote.bids[cell.level ?? 0]?.[0];
    if (!price) return null;
    return { side: "SELL", type: "LO", price, quantity: FIRST_LOT };
  }

  if (cell.kind === "symbol" || cell.kind === "last") {
    const price = quote.last || quote.expectedPrice || quote.ref;
    if (!price) return null;
    return { side: "BUY", type: "LO", price, quantity: FIRST_LOT };
  }

  return null;
}

export interface AccountSnapshot {
  account: AccountDto | null;
  positions: PositionDto[];
}

// Chưa đăng nhập (nguồn ysflex, hoặc mock chưa tải xong) thì không có sức mua, cổ phiếu khả dụng hay room.
// Dùng vô cực để phép kiểm đó luôn qua, và form nói rõ là chưa kiểm.
// Có tài khoản (nguồn mock) thì dùng sức mua và số cổ phiếu thật của tài khoản.
export function contextFor(
  quote: BoardQuote,
  phase: SessionPhase,
  account?: AccountSnapshot,
): OrderContext {
  const dto = account?.account ?? null;
  if (!dto) {
    return {
      exchange: quote.exchange as Exchange,
      ceil: quote.ceil,
      floor: quote.floor,
      phase,
      buyingPower: Number.POSITIVE_INFINITY,
      sellableQty: Number.POSITIVE_INFINITY,
      isForeign: false,
      foreignRoom: 0,
      feeRate: 0.0015,
    };
  }

  const position = account?.positions.find((item) => item.symbol === quote.symbol);
  return {
    exchange: quote.exchange as Exchange,
    ceil: quote.ceil,
    floor: quote.floor,
    phase,
    buyingPower: dto.buyingPower,
    sellableQty: position?.availableQty ?? 0,
    isForeign: dto.isForeign,
    foreignRoom: quote.room,
    feeRate: dto.feeRate,
  };
}
