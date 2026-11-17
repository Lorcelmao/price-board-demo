import type { FeedName, QuotePatch } from "../../shared/feed";
import { emptyQuote, type Quote } from "../../shared/protocol";

// Cache giá đã chuẩn hoá của gateway, tách theo nguồn: nguồn -> mã -> Quote.
// apply() kiểm tra phần thay đổi, trộn vào Quote đang có và chỉ trả lại những trường thật sự đổi,
// để gateway không phát tin rỗng và client không vẽ lại vô ích.

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

// Trường số được phép null (chưa khớp, chưa có giá dự khớp).
const NULLABLE = new Set(["last", "expectedPrice"]);

// Kiểm tra một patch: số phải hữu hạn, sổ lệnh là các cặp [giá, khối lượng] hữu hạn.
export function validPatch(patch: QuotePatch): boolean {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (key === "bids" || key === "asks") {
      if (!Array.isArray(value)) return false;
      if (!value.every((level) => Array.isArray(level) && level.length === 2 && level.every(isFiniteNumber))) return false;
      continue;
    }
    if (key === "symbol" || key === "exchange") {
      if (typeof value !== "string") return false;
      continue;
    }
    if (value === null && NULLABLE.has(key)) continue;
    if (!isFiniteNumber(value)) return false;
  }
  return true;
}

const sameValue = (a: unknown, b: unknown): boolean =>
  Array.isArray(a) || Array.isArray(b) ? JSON.stringify(a) === JSON.stringify(b) : a === b;

// Một mã trong cache kèm thời điểm nhận giá và cờ "cũ": giá nạp lại từ store lúc khởi động là cũ
// cho tới khi nguồn gửi giá mới cho mã đó.
export interface CachedQuote {
  quote: Quote;
  asOf: number;
  stale: boolean;
}

export class QuoteCache {
  private readonly feeds = new Map<FeedName, Map<string, CachedQuote>>();
  private readonly rejectedCount = new Map<FeedName, number>();
  // Mã đã đổi từ lần ghi store gần nhất, để ghi theo lô.
  private readonly dirty = new Map<FeedName, Set<string>>();

  constructor(private readonly now: () => number = Date.now) {}

  // Trả về phần thật sự đổi; null nếu patch bị loại (sai kiểu) hoặc không đổi gì.
  apply(feed: FeedName, symbol: string, patch: QuotePatch): QuotePatch | null {
    if (typeof symbol !== "string" || symbol === "" || !validPatch(patch)) {
      this.rejectedCount.set(feed, this.rejected(feed) + 1);
      return null;
    }
    const quotes = this.quotesOf(feed);
    const current = quotes.get(symbol);
    const base = current?.quote ?? emptyQuote(symbol);
    const changed: QuotePatch = {};
    for (const [key, value] of Object.entries(patch) as Array<[keyof Quote, unknown]>) {
      if (value === undefined || key === "symbol") continue;
      if (!sameValue(base[key], value)) (changed as Record<string, unknown>)[key] = value;
    }
    // Nguồn xác nhận lại đúng giá đang có: hết cũ, nhưng không có gì để phát.
    if (Object.keys(changed).length === 0 && current) {
      if (current.stale) current.stale = false;
      current.asOf = this.now();
      return null;
    }
    quotes.set(symbol, { quote: { ...base, ...changed, symbol }, asOf: this.now(), stale: false });
    this.dirtyOf(feed).add(symbol);
    return changed;
  }

  // Nạp giá đã lưu (lúc khởi động), đánh dấu là cũ. Mã đã có giá mới trong cache thì giữ giá mới.
  loadStored(feed: FeedName, entries: Array<{ quote: Quote; asOf: number }>): number {
    const quotes = this.quotesOf(feed);
    let loaded = 0;
    for (const { quote, asOf } of entries) {
      if (!quote?.symbol || quotes.has(quote.symbol)) continue;
      quotes.set(quote.symbol, { quote, asOf, stale: true });
      loaded += 1;
    }
    return loaded;
  }

  get(feed: FeedName, symbol: string): Quote | undefined {
    return this.feeds.get(feed)?.get(symbol)?.quote;
  }

  entry(feed: FeedName, symbol: string): CachedQuote | undefined {
    return this.feeds.get(feed)?.get(symbol);
  }

  // Ảnh chụp các mã đã có giá; không truyền danh sách thì lấy mọi mã của nguồn.
  snapshot(feed: FeedName, symbols?: string[]): Quote[] {
    return this.entries(feed, symbols).map((entry) => entry.quote);
  }

  entries(feed: FeedName, symbols?: string[]): CachedQuote[] {
    const quotes = this.feeds.get(feed);
    if (!quotes) return [];
    if (!symbols) return [...quotes.values()];
    return symbols.map((symbol) => quotes.get(symbol)).filter((entry): entry is CachedQuote => entry !== undefined);
  }

  // Lấy và xoá danh sách mã đã đổi từ lần gọi trước (để ghi store theo lô).
  takeDirty(feed: FeedName): Array<{ quote: Quote; asOf: number }> {
    const symbols = this.dirty.get(feed);
    if (!symbols || symbols.size === 0) return [];
    const quotes = this.quotesOf(feed);
    const result = [...symbols].flatMap((symbol) => {
      const entry = quotes.get(symbol);
      return entry ? [{ quote: entry.quote, asOf: entry.asOf }] : [];
    });
    symbols.clear();
    return result;
  }

  rejected(feed: FeedName): number {
    return this.rejectedCount.get(feed) ?? 0;
  }

  private quotesOf(feed: FeedName): Map<string, CachedQuote> {
    const quotes = this.feeds.get(feed) ?? new Map<string, CachedQuote>();
    this.feeds.set(feed, quotes);
    return quotes;
  }

  private dirtyOf(feed: FeedName): Set<string> {
    const set = this.dirty.get(feed) ?? new Set<string>();
    this.dirty.set(feed, set);
    return set;
  }
}
