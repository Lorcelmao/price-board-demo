import { emptyQuote, type Quote } from "../../shared/protocol";

export type QuoteConnectionStatus = "connecting" | "open" | "reconnecting";

// Quote của bảng giá: thêm giá trị giao dịch khối ngoại (đồng) mà luồng YSFlex có sẵn.
// Để chung trong kho để giao diện được báo khi số này đổi. Nguồn mock không có hai trường này.
export type BoardQuote = Quote & {
  foreignBuyValue?: number;
  foreignSellValue?: number;
};

export interface Scheduler {
  schedule(fn: () => void): void;
  cancel(): void;
}

// Kho dữ liệu của bảng giá, không phụ thuộc React để test được.
// Tin đến ghi vào Map ngay, nhưng chỉ báo cho bộ nghe một lần mỗi khung hình,
// và chỉ báo cho đúng những mã vừa đổi.
export interface QuoteStore {
  getQuote(symbol: string): BoardQuote;
  subscribeSymbol(symbol: string, listener: () => void): () => void;
  setQuote(symbol: string, quote: BoardQuote): void;
  getStatus(): QuoteConnectionStatus;
  subscribeStatus(listener: (status: QuoteConnectionStatus) => void): () => void;
  setStatus(status: QuoteConnectionStatus): void;
}

export function createQuoteStore(scheduler: Scheduler): QuoteStore {
  const quotes = new Map<string, BoardQuote>();
  const emptyFor = new Map<string, BoardQuote>();
  const symbolListeners = new Map<string, Set<() => void>>();
  const changed = new Set<string>();
  const statusListeners = new Set<(status: QuoteConnectionStatus) => void>();
  let status: QuoteConnectionStatus = "connecting";
  let scheduled = false;

  const flush = () => {
    scheduled = false;
    for (const symbol of changed) symbolListeners.get(symbol)?.forEach((listener) => listener());
    changed.clear();
  };

  const scheduleFlush = () => {
    if (scheduled) return;
    scheduled = true;
    scheduler.schedule(flush);
  };

  const getQuote = (symbol: string): BoardQuote => {
    const existing = quotes.get(symbol);
    if (existing) return existing;
    const fallback = emptyFor.get(symbol) ?? emptyQuote(symbol);
    emptyFor.set(symbol, fallback);
    return fallback;
  };

  return {
    getQuote,
    subscribeSymbol(symbol, listener) {
      let set = symbolListeners.get(symbol);
      if (!set) {
        set = new Set();
        symbolListeners.set(symbol, set);
      }
      set.add(listener);
      return () => set.delete(listener);
    },
    setQuote(symbol, quote) {
      quotes.set(symbol, quote);
      changed.add(symbol);
      scheduleFlush();
    },
    getStatus: () => status,
    subscribeStatus(listener) {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    setStatus(next) {
      status = next;
      statusListeners.forEach((listener) => listener(next));
    },
  };
}
