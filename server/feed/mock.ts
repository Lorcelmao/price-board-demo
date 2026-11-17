import type { FeedAdapter, FeedConnection, FeedEvents, FeedStatus } from "../../shared/feed";
import { CHART_INDEXES } from "../../shared/indexes";
import { applyMarketMessage, emptyQuote, type MarketWire, type Quote } from "../../shared/protocol";
import type { MarketIndexes } from "../market-indexes";
import type { MarketSimulator } from "../market-simulator";

// Nguồn mock dưới dạng adapter: đọc tin MarketWire của bộ giả lập, dựng Quote bằng applyMarketMessage
// rồi đưa cả Quote cho gateway (gateway tự lọc ra phần đổi). Chỉ số tính lại và gửi mỗi giây.
export function createMockFeed(
  market: MarketSimulator,
  indexes: MarketIndexes,
  options: { now?: () => number; indexIntervalMs?: number } = {},
): FeedAdapter {
  const now = options.now ?? Date.now;
  const quotes = new Map<string, Quote>();
  let connection: FeedConnection = "stopped";
  let messages = 0;
  let lastMessageAt: number | null = null;
  let unsubscribe: (() => void) | null = null;
  let indexTimer: ReturnType<typeof setInterval> | null = null;

  const toQuote = (message: MarketWire): Quote => {
    const next = applyMarketMessage(quotes.get(message.t55) ?? emptyQuote(message.t55), message);
    quotes.set(message.t55, next);
    return next;
  };

  return {
    name: "mock",
    start(events: FeedEvents) {
      if (unsubscribe) return;
      const receive = (message: MarketWire) => {
        messages += 1;
        lastMessageAt = now();
        events.quote(message.t55, toQuote(message));
      };
      // Ảnh chụp đầy đủ của mọi mã trước, rồi mới nghe tin mới.
      for (const symbol of market.symbols.keys()) market.snapshot(symbol).forEach(receive);
      unsubscribe = market.onMarket(receive);
      for (const snapshot of indexes.snapshots()) events.index(snapshot);
      for (const code of CHART_INDEXES) events.indexHistory(code, indexes.history(code) ?? []);
      indexTimer = setInterval(() => indexes.update().forEach((snapshot) => events.index(snapshot)), options.indexIntervalMs ?? 1000);
      connection = "open";
      events.connection(connection);
    },
    stop() {
      unsubscribe?.();
      unsubscribe = null;
      if (indexTimer) clearInterval(indexTimer);
      indexTimer = null;
      connection = "stopped";
    },
    status(): FeedStatus {
      return { feed: "mock", connection, lastMessageAt, messages, rejected: 0, reconnects: 0 };
    },
  };
}
