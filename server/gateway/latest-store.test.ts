import { describe, expect, it } from "vitest";
import { emptyQuote } from "../../shared/protocol";
import { MemoryStore } from "./latest-store";

const entry = (symbol: string, last: number, asOf = 1) => ({ quote: { ...emptyQuote(symbol), last }, asOf });

describe("MemoryStore", () => {
  it("ghi rồi đọc lại theo nguồn, mã sau ghi đè mã trước", async () => {
    const store = new MemoryStore(() => 42);
    await store.save("ysflex", [entry("FPT", 1), entry("VCB", 2)]);
    await store.save("ysflex", [entry("FPT", 3)]);
    const loaded = await store.load("ysflex");
    expect(loaded.map((item) => [item.quote.symbol, item.quote.last])).toEqual([["FPT", 3], ["VCB", 2]]);
    expect(await store.load("mock")).toEqual([]);
    expect(store.status()).toMatchObject({ kind: "memory", connected: true, lastWriteAt: 42, errors: 0 });
  });

  it("lô rỗng không tính là một lần ghi", async () => {
    const store = new MemoryStore(() => 7);
    await store.save("mock", []);
    expect(store.status().lastWriteAt).toBeNull();
  });
});
