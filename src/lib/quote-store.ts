import { useSyncExternalStore } from "react";
import { createQuoteStore, type BoardQuote, type QuoteConnectionStatus, type Scheduler } from "./quote-store-core";

// Lập lịch gom theo khung hình. Tab ẩn thì requestAnimationFrame ngừng, nên luôn có hẹn giờ dự phòng.
const browserScheduler: Scheduler = (() => {
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule(fn) {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      frame = requestAnimationFrame(() => {
        clearTimeout(timer);
        fn();
      });
      timer = setTimeout(() => {
        cancelAnimationFrame(frame);
        fn();
      }, 250);
    },
    cancel() {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    },
  };
})();

export const quoteStore = createQuoteStore(browserScheduler);

export const getQuote = quoteStore.getQuote;
export const setQuote = quoteStore.setQuote;
export const setStatus = quoteStore.setStatus;

// Một dòng chỉ render lại khi đúng mã của nó có tin mới.
export function useQuote(symbol: string): BoardQuote {
  return useSyncExternalStore(
    (listener) => quoteStore.subscribeSymbol(symbol, listener),
    () => quoteStore.getQuote(symbol),
  );
}

export function useConnectionStatus(): QuoteConnectionStatus {
  return useSyncExternalStore(
    (listener) => quoteStore.subscribeStatus(listener),
    () => quoteStore.getStatus(),
  );
}
