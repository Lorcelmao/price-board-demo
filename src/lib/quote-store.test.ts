import { describe, expect, it } from "vitest";
import { createQuoteStore } from "./quote-store-core";
import { emptyQuote } from "../../shared/protocol";

// Bộ lập lịch giả: ghi lại hàm flush nhưng không tự chạy, để test điều khiển thời điểm.
function manualScheduler() {
  const pending: Array<() => void> = [];
  return {
    schedule: (fn: () => void) => { pending.push(fn); },
    cancel: () => { pending.length = 0; },
    runAll: () => { const copy = pending.splice(0); copy.forEach((fn) => fn()); },
    get count() { return pending.length; },
  };
}

describe("quote store", () => {
  it("cập nhật mã A chỉ gọi bộ nghe của mã A", () => {
    const scheduler = manualScheduler();
    const store = createQuoteStore(scheduler);
    let aCalls = 0;
    let bCalls = 0;
    store.subscribeSymbol("A", () => { aCalls += 1; });
    store.subscribeSymbol("B", () => { bCalls += 1; });
    store.setQuote("A", { ...emptyQuote("A"), ref: 100 });
    scheduler.runAll();
    expect(aCalls).toBe(1);
    expect(bCalls).toBe(0);
  });

  it("nhiều lần cập nhật trong một khung hình chỉ báo một lần", () => {
    const scheduler = manualScheduler();
    const store = createQuoteStore(scheduler);
    let calls = 0;
    store.subscribeSymbol("A", () => { calls += 1; });
    store.setQuote("A", { ...emptyQuote("A"), ref: 100 });
    store.setQuote("A", { ...emptyQuote("A"), ref: 101 });
    store.setQuote("A", { ...emptyQuote("A"), ref: 102 });
    expect(scheduler.count).toBe(1);
    scheduler.runAll();
    expect(calls).toBe(1);
  });

  it("đổi trạng thái kết nối thì bộ nghe trạng thái được gọi", () => {
    const store = createQuoteStore(manualScheduler());
    const seen: string[] = [];
    store.subscribeStatus((status) => seen.push(status));
    store.setStatus("open");
    expect(seen).toEqual(["open"]);
    expect(store.getStatus()).toBe("open");
  });

  it("giữ nguyên đối tượng Quote cho đến khi có tin mới", () => {
    const scheduler = manualScheduler();
    const store = createQuoteStore(scheduler);
    const first = store.getQuote("A");
    expect(store.getQuote("A")).toBe(first);
    store.setQuote("A", { ...emptyQuote("A"), ref: 100 });
    scheduler.runAll();
    expect(store.getQuote("A").ref).toBe(100);
  });
});
