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

export interface FeedAdapter {
  readonly name: FeedName;
  start(events: FeedEvents): void;
  stop(): void;
  status(): FeedStatus;
}
