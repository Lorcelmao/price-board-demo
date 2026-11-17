// Hợp đồng giữa gateway và các nguồn giá (adapter). Mỗi nguồn đổ dữ liệu đã chuẩn hoá về cùng một kiểu:
// phần thay đổi của Quote, ảnh chụp chỉ số và lịch sử chỉ số trong ngày.
import type { IndexCode, IndexPoint, IndexSnapshot } from "./indexes";
import type { Quote } from "./protocol";

export type FeedName = "mock" | "ysflex";
export const FEED_NAMES: FeedName[] = ["mock", "ysflex"];
export const isFeedName = (value: unknown): value is FeedName => value === "mock" || value === "ysflex";

// Chỉ chứa trường có trong tin: trộn đè lên Quote đang có không làm mất trường khác.
export type QuotePatch = Partial<Quote>;

export type FeedConnection = "connecting" | "open" | "reconnecting" | "stopped";

export interface FeedEvents {
  quote(symbol: string, patch: QuotePatch): void;
  index(snapshot: IndexSnapshot): void;
  indexHistory(code: IndexCode, points: IndexPoint[]): void;
  connection(state: FeedConnection): void;
}

export interface FeedStatus {
  feed: FeedName;
  connection: FeedConnection;
  lastMessageAt: number | null;
  messages: number;
  rejected: number;
  reconnects: number;
}

// Một nến 1 phút trong ngày. time: "HH:mm" giờ Việt Nam.
export interface IntradayCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Một lệnh khớp. time: "HH:mm:ss" giờ Việt Nam; side: chiều chủ động, null nếu nguồn không có.
export interface TradeTick {
  time: string;
  price: number;
  volume: number;
  side: "BUY" | "SELL" | null;
  seq: number;
}

// Lịch sử theo mã mà một nguồn có thể cung cấp (năng lực tuỳ chọn của adapter).
export interface FeedHistory {
  intraday(symbol: string): Promise<IntradayCandle[]>;
  // Lệnh khớp mới nhất trước; fromSeq để lấy trang cũ hơn.
  trades(symbol: string, options?: { fromSeq?: number; size?: number }): Promise<TradeTick[]>;
}

export interface FeedAdapter {
  readonly name: FeedName;
  start(events: FeedEvents): void;
  stop(): void;
  status(): FeedStatus;
  // Chỉ nguồn có lịch sử theo mã mới có (hiện là Yuanta). Nguồn không có thì gateway trả 404.
  history?: FeedHistory;
}
