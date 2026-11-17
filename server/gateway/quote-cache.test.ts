import { describe, expect, it } from "vitest";
import { QuoteCache, validPatch } from "./quote-cache";

describe("QuoteCache", () => {
  it("lần đầu lưu cả patch, lần sau chỉ trả trường thật sự đổi", () => {
    const cache = new QuoteCache();
    expect(cache.apply("mock", "FPT", { ref: 52_700, last: 53_000 })).toEqual({ ref: 52_700, last: 53_000 });
    expect(cache.apply("mock", "FPT", { ref: 52_700, last: 53_100 })).toEqual({ last: 53_100 });
    expect(cache.get("mock", "FPT")).toMatchObject({ symbol: "FPT", ref: 52_700, last: 53_100 });
  });

  it("không đổi gì thì trả null", () => {
    const cache = new QuoteCache();
    cache.apply("mock", "FPT", { bids: [[53_000, 100]] });
    expect(cache.apply("mock", "FPT", { bids: [[53_000, 100]] })).toBeNull();
  });

  it("tách riêng từng nguồn", () => {
    const cache = new QuoteCache();
    cache.apply("mock", "FPT", { last: 1 });
    cache.apply("ysflex", "FPT", { last: 2 });
    expect(cache.get("mock", "FPT")?.last).toBe(1);
    expect(cache.get("ysflex", "FPT")?.last).toBe(2);
    expect(cache.snapshot("ysflex").map((quote) => quote.symbol)).toEqual(["FPT"]);
  });

  it("patch có số rác bị loại, đếm rejected, cache không đổi", () => {
    const cache = new QuoteCache();
    cache.apply("ysflex", "FPT", { last: 48_500 });
    expect(cache.apply("ysflex", "FPT", { last: Number.NaN })).toBeNull();
    expect(cache.apply("ysflex", "FPT", { bids: [[1, Infinity]] })).toBeNull();
    expect(cache.apply("ysflex", "", { last: 1 })).toBeNull();
    expect(cache.rejected("ysflex")).toBe(3);
    expect(cache.get("ysflex", "FPT")?.last).toBe(48_500);
  });

  it("snapshot theo danh sách mã bỏ qua mã chưa có giá", () => {
    const cache = new QuoteCache();
    cache.apply("mock", "VCB", { last: 1 });
    expect(cache.snapshot("mock", ["VCB", "ZZZ"]).map((quote) => quote.symbol)).toEqual(["VCB"]);
  });
});

describe("validPatch", () => {
  it("cho phép last và expectedPrice là null", () => {
    expect(validPatch({ last: null, expectedPrice: null })).toBe(true);
    expect(validPatch({ ref: null as unknown as number })).toBe(false);
  });
});
