// Định dạng tin nhắn của MOCK SERVER, do dự án tự đặt.
// Tên topic ST, SI, EP theo cách đặt tên thường gặp, tên trường tNNN lấy từ cột bảng giá thật.
// Đây KHÔNG phải định dạng KRXMDDS thật, vì không dùng tài liệu message nội bộ nào.

import type { Exchange, SessionPhase, Side } from "./market-rules";
import type { IndexSnapshot } from "./indexes";
import type { Fill, Order } from "./order-merge";

export const TOPIC = {
  ST: "KRXMDDS|ST|G1",
  SI: "KRXMDDS|SI|G1",
  EP: "KRXMDDS|EP|G1",
  MD: "KRXMDDS|MD|G1",
} as const;

export const ALL_MARKET_TOPICS = [TOPIC.ST, TOPIC.SI, TOPIC.EP, TOPIC.MD];

export type BookLevel = [price: number, volume: number];

export type ClientMessage =
  | { op: "sub"; symbols: string[] }
  | { op: "unsub"; symbols: string[] }
  // token: phiên đăng nhập; thiếu hoặc sai thì server trả AUTH expired và không gửi tin tài khoản.
  | { op: "subAccount"; token?: string }
  | { op: "unsubAccount" }
  | { op: "ping"; ts: number };

export interface StWire {
  topic: typeof TOPIC.ST;
  t55: string;
  exchange: Exchange;
  t260: number;
  t332: number;
  t333: number;
  room: number;
}

export interface SiWire {
  topic: typeof TOPIC.SI;
  t55: string;
  t31: number;
  t32: number;
  t391: number;
  t631: number;
  t266: number;
  t2661: number;
  t137: number;
  t397: number;
  t398: number;
  room: number;
  side: Side;
  time: number;
}

export interface EpWire {
  topic: typeof TOPIC.EP;
  t55: string;
  expectedPrice: number;
  expectedVolume: number;
}

export interface MdWire {
  topic: typeof TOPIC.MD;
  t55: string;
  bids: BookLevel[];
  asks: BookLevel[];
}

export type MarketWire = StWire | SiWire | EpWire | MdWire;

export type ServerMessage =
  | MarketWire
  | { op: "pong"; ts: number }
  | { topic: "SESSION"; phase: SessionPhase }
  // Chỉ số thị trường, gửi cho mọi kết nối mỗi giây.
  | { topic: "INDEX"; index: IndexSnapshot }
  | { topic: "ACCOUNT|ORDER"; order: Order }
  | { topic: "ACCOUNT|FILL"; fill: Fill }
  | { topic: "ACCOUNT|BALANCE" }
  // Phiên không còn hiệu lực (thiếu token, hết hạn, đăng xuất, hay đăng nhập ở nơi khác).
  | { topic: "AUTH"; status: "expired" };

// Trạng thái một mã sau khi đã đổi từ tên kỹ thuật sang tên có nghĩa.
export interface Quote {
  symbol: string;
  exchange: Exchange;
  ref: number;
  ceil: number;
  floor: number;
  last: number | null;
  lastVolume: number;
  totalVolume: number;
  avgPrice: number;
  high: number;
  low: number;
  open: number;
  foreignBuy: number;
  foreignSell: number;
  room: number;
  expectedPrice: number | null;
  bids: BookLevel[];
  asks: BookLevel[];
}

export function emptyQuote(symbol: string): Quote {
  return {
    symbol,
    exchange: "HOSE",
    ref: 0,
    ceil: 0,
    floor: 0,
    last: null,
    lastVolume: 0,
    totalVolume: 0,
    avgPrice: 0,
    high: 0,
    low: 0,
    open: 0,
    foreignBuy: 0,
    foreignSell: 0,
    room: 0,
    expectedPrice: null,
    bids: [],
    asks: [],
  };
}

// Tin thị trường chỉ mang một phần dữ liệu. Hàm này ghép phần đó vào trạng thái đang có.
export function applyMarketMessage(quote: Quote, message: MarketWire): Quote {
  switch (message.topic) {
    case TOPIC.ST:
      return {
        ...quote,
        exchange: message.exchange,
        ref: message.t260,
        ceil: message.t332,
        floor: message.t333,
        room: message.room,
      };
    case TOPIC.SI:
      return {
        ...quote,
        last: message.t31,
        lastVolume: message.t32,
        totalVolume: message.t391,
        avgPrice: message.t631,
        high: message.t266,
        low: message.t2661,
        open: message.t137,
        foreignBuy: message.t397,
        foreignSell: message.t398,
        room: message.room,
        // Đã có khớp thật thì giá dự kiến không còn ý nghĩa.
        expectedPrice: null,
      };
    case TOPIC.EP:
      return { ...quote, expectedPrice: message.expectedPrice };
    case TOPIC.MD:
      return { ...quote, bids: message.bids, asks: message.asks };
  }
}

// Giá dùng để định giá: ưu tiên giá khớp thật, nếu chưa có thì dùng dự khớp, rồi đến tham chiếu.
export const displayPrice = (quote: Quote): number => quote.expectedPrice ?? quote.last ?? quote.ref;

// Một cây nến. time là "YYYY-MM-DD" (đúng định dạng Lightweight Charts nhận cho dữ liệu ngày).
export interface CandleDto {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Thông tin doanh nghiệp GIẢ cho tab "Thông tin khác".
export interface CompanyDto {
  symbol: string;
  name: string;
  exchange: Exchange;
  sector: string;
  sharesOutstanding: number;
  marketCap: number;
  eps: number;
  pe: number;
  pb: number;
  foreignRoom: number;
}

export interface Instrument {
  symbol: string;
  name: string;
  exchange: Exchange;
  ref: number;
  ceil: number;
  floor: number;
}

export interface PositionDto {
  symbol: string;
  exchange: Exchange;
  totalQty: number;
  availableQty: number;
  holdQty: number;
  pendingT0: number;
  pendingT1: number;
  avgCost: number;
}

export interface AccountDto {
  accountNo: string;
  isForeign: boolean;
  feeRate: number;
  sellTaxRate: number;
  cash: number;
  holdFunds: number;
  availableCash: number;
  receivableT0: number;
  receivableT1: number;
  debt: number;
  creditLimit: number;
  buyingPower: number;
}

export interface CashEntry {
  id: string;
  time: number;
  type: "DEPOSIT" | "WITHDRAW" | "BUY" | "SELL" | "FEE" | "TAX" | "DIVIDEND";
  amount: number;
  note: string;
}

export interface CorporateAction {
  id: string;
  symbol: string;
  type: "CASH_DIVIDEND" | "BONUS_SHARES" | "RIGHTS";
  description: string;
  exDate: string;
  payDate: string;
  entitlement: string;
}

export interface IntradayBucket {
  minute: string;
  volume: number;
}

export interface ProfileLevel {
  price: number;
  volume: number;
}

export interface PlaceOrderResult {
  order: Order;
  errors?: Record<string, string>;
}

export const SESSION_LABEL: Record<SessionPhase, string> = {
  ATO: "ATO, khớp định kỳ mở cửa",
  CONTINUOUS: "Khớp liên tục",
  ATC: "ATC, khớp định kỳ đóng cửa",
  CLOSED: "Đóng cửa",
};
