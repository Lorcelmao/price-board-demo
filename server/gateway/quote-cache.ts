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

export class QuoteCache {
  private readonly feeds = new Map<FeedName, Map<string, Quote>>();
  private readonly rejectedCount = new Map<FeedName, number>();

  // Trả về phần thật sự đổi; null nếu patch bị loại (sai kiểu) hoặc không đổi gì.
  apply(feed: FeedName, symbol: string, patch: QuotePatch): QuotePatch | null {
    if (typeof symbol !== "string" || symbol === "" || !validPatch(patch)) {
      this.rejectedCount.set(feed, this.rejected(feed) + 1);
      return null;
    }
    const quotes = this.feeds.get(feed) ?? new Map<string, Quote>();
    this.feeds.set(feed, quotes);
    const current = quotes.get(symbol) ?? emptyQuote(symbol);
    const changed: QuotePatch = {};
    for (const [key, value] of Object.entries(patch) as Array<[keyof Quote, unknown]>) {
      if (value === undefined || key === "symbol") continue;
      if (!sameValue(current[key], value)) (changed as Record<string, unknown>)[key] = value;
    }
    if (Object.keys(changed).length === 0 && quotes.has(symbol)) return null;
    quotes.set(symbol, { ...current, ...changed, symbol });
    return changed;
  }

  get(feed: FeedName, symbol: string): Quote | undefined {
    return this.feeds.get(feed)?.get(symbol);
  }

  // Ảnh chụp các mã đã có giá; không truyền danh sách thì lấy mọi mã của nguồn.
  snapshot(feed: FeedName, symbols?: string[]): Quote[] {
    const quotes = this.feeds.get(feed);
    if (!quotes) return [];
    if (!symbols) return [...quotes.values()];
    return symbols.map((symbol) => quotes.get(symbol)).filter((quote): quote is Quote => quote !== undefined);
  }

  rejected(feed: FeedName): number {
    return this.rejectedCount.get(feed) ?? 0;
  }
}
