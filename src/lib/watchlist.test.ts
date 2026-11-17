import { describe, expect, it } from "vitest";
import {
  addSymbol,
  initialWatchlist,
  loadWatchlist,
  normalizeSymbol,
  removeSymbol,
  sanitizeWatchlist,
  saveWatchlist,
  watchlistKey,
  type StorageLike,
} from "./watchlist";

const KNOWN = ["ACB", "BID", "FPT", "SSI", "SHS", "PVS"];

const store = (entries: Record<string, string> = {}) => {
  const map = new Map(Object.entries(entries));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    dump: () => Object.fromEntries(map),
  } satisfies StorageLike & { dump: () => Record<string, string> };
};

describe("normalizeSymbol", () => {
  it("bỏ khoảng trắng hai đầu và đổi thành chữ hoa", () => {
    expect(normalizeSymbol(" fpt ")).toBe("FPT");
  });

  it("chuỗi rỗng thành chuỗi rỗng", () => {
    expect(normalizeSymbol("   ")).toBe("");
    expect(normalizeSymbol("")).toBe("");
  });
});

describe("addSymbol", () => {
  it("thêm được mã có trong danh sách", () => {
    const result = addSymbol([], "fpt", KNOWN);
    expect(result).toEqual({ list: ["FPT"], error: null });
  });

  it("mã không có trong danh sách báo lỗi", () => {
    const result = addSymbol([], "ZZZ", KNOWN);
    expect(result.list).toEqual([]);
    expect(result.error).toBe("Không có mã ZZZ");
  });

  it("mã trùng báo lỗi đã có", () => {
    const result = addSymbol(["FPT"], "FPT", KNOWN);
    expect(result.list).toEqual(["FPT"]);
    expect(result.error).toBe("FPT đã có trong danh mục");
  });

  it("đủ 30 mã thì báo lỗi giới hạn", () => {
    const full = Array.from({ length: 30 }, (_, i) => `X${i}`);
    const result = addSymbol(full, "FPT", [...KNOWN, ...full]);
    expect(result.list).toHaveLength(30);
    expect(result.error).toContain("30");
  });

  it("chuỗi rỗng thì không thêm, không báo lỗi", () => {
    expect(addSymbol(["FPT"], "  ", KNOWN)).toEqual({ list: ["FPT"], error: null });
  });

  it("không sửa mảng đầu vào", () => {
    const list = ["ACB"];
    addSymbol(list, "FPT", KNOWN);
    expect(list).toEqual(["ACB"]);
  });
});

describe("removeSymbol", () => {
  it("bỏ đúng mã", () => {
    expect(removeSymbol(["ACB", "FPT"], "FPT")).toEqual(["ACB"]);
  });

  it("mã không có thì trả nguyên mảng", () => {
    expect(removeSymbol(["ACB"], "FPT")).toEqual(["ACB"]);
  });
});

describe("sanitizeWatchlist", () => {
  it("bỏ mã lạ và mã trùng", () => {
    expect(sanitizeWatchlist(["FPT", "ZZZ", "FPT", "ACB"], KNOWN)).toEqual(["FPT", "ACB"]);
  });

  it("sai kiểu thì trả mảng rỗng", () => {
    expect(sanitizeWatchlist(null, KNOWN)).toEqual([]);
    expect(sanitizeWatchlist("hỏng", KNOWN)).toEqual([]);
    expect(sanitizeWatchlist([1, 2], KNOWN)).toEqual([]);
    expect(sanitizeWatchlist([], KNOWN)).toEqual([]);
  });

  it("cắt về tối đa 30 mã", () => {
    const many = Array.from({ length: 40 }, (_, i) => `X${i}`);
    expect(sanitizeWatchlist(many, [...many])).toHaveLength(30);
  });
});

describe("loadWatchlist / saveWatchlist", () => {
  it("khoá đúng theo từng nguồn", () => {
    expect(watchlistKey("mock")).toBe("price-board-demo:dm-quan-tam:v1:mock");
    expect(watchlistKey("ysflex")).toBe("price-board-demo:dm-quan-tam:v1:ysflex");
  });

  it("đọc lại đúng dữ liệu đã ghi", () => {
    const storage = store();
    saveWatchlist(storage, "mock", ["FPT", "ACB"]);
    expect(loadWatchlist(storage, "mock")).toEqual(["FPT", "ACB"]);
  });

  it("chưa có gì thì trả mảng rỗng", () => {
    expect(loadWatchlist(store(), "mock")).toEqual([]);
  });

  it("JSON hỏng hoặc sai kiểu thì trả mảng rỗng, không ném", () => {
    expect(() => loadWatchlist(store({ "price-board-demo:dm-quan-tam:v1:mock": "{hỏng" }), "mock")).not.toThrow();
    expect(loadWatchlist(store({ "price-board-demo:dm-quan-tam:v1:mock": "{hỏng" }), "mock")).toEqual([]);
    expect(loadWatchlist(store({ "price-board-demo:dm-quan-tam:v1:mock": JSON.stringify({ a: 1 }) }), "mock")).toEqual([]);
    expect(loadWatchlist(store({ "price-board-demo:dm-quan-tam:v1:mock": JSON.stringify([1, 2]) }), "mock")).toEqual([]);
  });

  it("storage ném lỗi thì trả mảng rỗng và không ném", () => {
    const broken: StorageLike = {
      getItem: () => { throw new Error("chặn"); },
      setItem: () => { throw new Error("chặn"); },
      removeItem: () => { throw new Error("chặn"); },
    };
    expect(() => loadWatchlist(broken, "mock")).not.toThrow();
    expect(loadWatchlist(broken, "mock")).toEqual([]);
    expect(() => saveWatchlist(broken, "mock", ["FPT"])).not.toThrow();
  });

  it("hai nguồn lưu riêng", () => {
    const storage = store();
    saveWatchlist(storage, "mock", ["FPT"]);
    saveWatchlist(storage, "ysflex", ["ACB"]);
    expect(loadWatchlist(storage, "mock")).toEqual(["FPT"]);
    expect(loadWatchlist(storage, "ysflex")).toEqual(["ACB"]);
  });
});

describe("initialWatchlist: danh mục lúc mở trang", () => {
  const VN30 = ["ACB", "BID", "FPT"];

  it("mock giữ mã ngoài nhóm VN30 (SHS, PNJ), chỉ bỏ trùng", () => {
    expect(initialWatchlist(["SHS", "FPT", "PNJ", "SHS"], "mock", VN30)).toEqual(["SHS", "FPT", "PNJ"]);
  });

  it("ysflex chỉ giữ mã trong 30 mã VN30", () => {
    expect(initialWatchlist(["SHS", "FPT"], "ysflex", VN30)).toEqual(["FPT"]);
  });

  it("dữ liệu sai kiểu thì trả mảng rỗng", () => {
    expect(initialWatchlist("hỏng", "mock", VN30)).toEqual([]);
    expect(initialWatchlist([1, "FPT"], "mock", VN30)).toEqual([]);
  });
});
