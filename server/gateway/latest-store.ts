import type { FeedName } from "../../shared/feed";
import type { Quote } from "../../shared/protocol";

// Nơi gateway giữ giá mới nhất của từng mã, để server khởi động lại (hay Render thức dậy) vẫn trả được giá ngay.
// Hai bản: MemoryStore (mặc định, dùng cho test và khi không có Redis) và RedisStore (redis-store.ts, khi có REDIS_URL).
// Quy ước chung: không bao giờ ném lỗi ra ngoài; lỗi thì đếm vào status().errors để gateway chạy tiếp.

export interface StoredQuote {
  quote: Quote;
  // Thời điểm (epoch ms) gateway nhận giá này từ nguồn.
  asOf: number;
}

export interface StoreStatus {
  kind: "memory" | "redis";
  connected: boolean;
  lastWriteAt: number | null;
  errors: number;
}

export interface LatestStore {
  load(feed: FeedName): Promise<StoredQuote[]>;
  // Ghi một lô (ghi đè theo mã). Lô rỗng thì không làm gì.
  save(feed: FeedName, entries: StoredQuote[]): Promise<void>;
  status(): StoreStatus;
  close(): Promise<void>;
}

// Bản trong bộ nhớ: mất khi server tắt. Dùng khi không có Redis và trong test.
export class MemoryStore implements LatestStore {
  private readonly feeds = new Map<FeedName, Map<string, StoredQuote>>();
  private lastWriteAt: number | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  async load(feed: FeedName): Promise<StoredQuote[]> {
    return [...(this.feeds.get(feed)?.values() ?? [])];
  }

  async save(feed: FeedName, entries: StoredQuote[]): Promise<void> {
    if (entries.length === 0) return;
    const quotes = this.feeds.get(feed) ?? new Map<string, StoredQuote>();
    this.feeds.set(feed, quotes);
    for (const entry of entries) quotes.set(entry.quote.symbol, entry);
    this.lastWriteAt = this.now();
  }

  status(): StoreStatus {
    return { kind: "memory", connected: true, lastWriteAt: this.lastWriteAt, errors: 0 };
  }

  async close(): Promise<void> {
    /* không có gì để đóng */
  }
}
