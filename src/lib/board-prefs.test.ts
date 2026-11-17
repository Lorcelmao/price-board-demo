import { describe, expect, it } from "vitest";
import { emptyQuote } from "../../shared/protocol";
import type { BoardQuote } from "./quote-store-core";
import {
  DEFAULT_PREFS,
  loadPrefs,
  loadTabView,
  moveSymbol,
  nextSort,
  sanitizeOrder,
  savePrefs,
  saveTabView,
  sortSymbols,
  tabStorageKey,
  type SortState,
  type StorageLike,
} from "./board-prefs";

const quote = (symbol: string, patch: Partial<BoardQuote> = {}): BoardQuote => ({
  ...emptyQuote(symbol),
  ...patch,
});

const store = (entries: Record<string, string> = {}) => {
  const map = new Map(Object.entries(entries));
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    dump: () => Object.fromEntries(map),
  };
};

describe("nextSort: chu trình giảm dần, tăng dần, mặc định", () => {
  it("chưa xếp thì bắt đầu giảm dần", () => {
    expect(nextSort(null, "changePct")).toEqual({ columnId: "changePct", direction: "desc" });
  });

  it("giảm dần thành tăng dần", () => {
    const current: SortState = { columnId: "changePct", direction: "desc" };
    expect(nextSort(current, "changePct")).toEqual({ columnId: "changePct", direction: "asc" });
  });

  it("tăng dần thành không xếp", () => {
    const current: SortState = { columnId: "changePct", direction: "asc" };
    expect(nextSort(current, "changePct")).toBeNull();
  });

  it("bấm cột khác thì bắt đầu lại từ giảm dần", () => {
    const current: SortState = { columnId: "changePct", direction: "asc" };
    expect(nextSort(current, "totalVolume")).toEqual({ columnId: "totalVolume", direction: "desc" });
  });
});

describe("sortSymbols", () => {
  const quotes: Record<string, BoardQuote> = {
    AAA: quote("AAA", { last: 30, ref: 20 }),
    BBB: quote("BBB", { last: 10, ref: 20 }),
    CCC: quote("CCC", { last: null, ref: 20 }),
    DDD: quote("DDD", { last: 22, ref: 20 }),
  };
  const getQuote = (symbol: string) => quotes[symbol];
  const order = ["DDD", "BBB", "AAA", "CCC"];
  const percent = (q: BoardQuote) =>
    q.last === null || !q.ref ? null : ((q.last - q.ref) / q.ref) * 100;

  it("không xếp thì trả về đúng thứ tự đầu vào", () => {
    expect(sortSymbols(order, getQuote, null, { changePct: percent })).toEqual(order);
  });

  it("giảm dần theo số", () => {
    // AAA +50%, DDD +10%, BBB -50%, CCC trống.
    const sorted = sortSymbols(order, getQuote, { columnId: "changePct", direction: "desc" }, { changePct: percent });
    expect(sorted).toEqual(["AAA", "DDD", "BBB", "CCC"]);
  });

  it("tăng dần theo số", () => {
    const sorted = sortSymbols(order, getQuote, { columnId: "changePct", direction: "asc" }, { changePct: percent });
    expect(sorted).toEqual(["BBB", "DDD", "AAA", "CCC"]);
  });

  it("ô trống hoặc 0 nằm cuối ở cả hai chiều", () => {
    const asc = sortSymbols(order, getQuote, { columnId: "changePct", direction: "asc" }, { changePct: percent });
    const desc = sortSymbols(order, getQuote, { columnId: "changePct", direction: "desc" }, { changePct: percent });
    expect(asc[asc.length - 1]).toBe("CCC");
    expect(desc[desc.length - 1]).toBe("CCC");
  });

  it("Mã CK so theo chữ", () => {
    const sorted = sortSymbols(order, getQuote, { columnId: "symbol", direction: "asc" }, {
      symbol: (q) => q.symbol,
    });
    expect(sorted).toEqual(["AAA", "BBB", "CCC", "DDD"]);
  });

  it("hai giá trị bằng nhau giữ thứ tự mặc định", () => {
    const equal: Record<string, BoardQuote> = {
      X1: quote("X1", { last: 30, ref: 20 }),
      X2: quote("X2", { last: 30, ref: 20 }),
      X3: quote("X3", { last: 30, ref: 20 }),
    };
    const sorted = sortSymbols(["X3", "X1", "X2"], (s) => equal[s], { columnId: "changePct", direction: "desc" }, { changePct: percent });
    expect(sorted).toEqual(["X3", "X1", "X2"]);
  });

  it("cột không có hàm lấy giá trị thì giữ nguyên thứ tự", () => {
    expect(sortSymbols(order, getQuote, { columnId: "khongCo", direction: "desc" }, {})).toEqual(order);
  });
});

describe("moveSymbol", () => {
  const order = ["A", "B", "C", "D"];

  it("chuyển xuống một bậc", () => {
    expect(moveSymbol(order, "B", 2)).toEqual(["A", "C", "B", "D"]);
  });

  it("chuyển lên một bậc", () => {
    expect(moveSymbol(order, "C", 1)).toEqual(["A", "C", "B", "D"]);
  });

  it("chuyển về đầu và cuối", () => {
    expect(moveSymbol(order, "D", 0)).toEqual(["D", "A", "B", "C"]);
    expect(moveSymbol(order, "A", 3)).toEqual(["B", "C", "D", "A"]);
  });

  it("vị trí không hợp lệ thì trả nguyên mảng", () => {
    expect(moveSymbol(order, "A", 0)).toEqual(order);
    expect(moveSymbol(order, "A", -1)).toEqual(order);
    expect(moveSymbol(order, "A", 9)).toEqual(order);
    expect(moveSymbol(order, "KHONGCO", 2)).toEqual(order);
  });
});

describe("sanitizeOrder", () => {
  const symbols = ["A", "B", "C"];

  it("bỏ mã không còn", () => {
    expect(sanitizeOrder(["C", "Z", "A"], symbols)).toEqual(["C", "A", "B"]);
  });

  it("thêm mã mới vào cuối", () => {
    expect(sanitizeOrder(["C", "A"], symbols)).toEqual(["C", "A", "B"]);
  });

  it("mảng rỗng hoặc sai kiểu thì trả về danh sách gốc", () => {
    expect(sanitizeOrder([], symbols)).toEqual(symbols);
    expect(sanitizeOrder(null, symbols)).toEqual(symbols);
    expect(sanitizeOrder("hỏng" as unknown as string[], symbols)).toEqual(symbols);
    expect(sanitizeOrder([1, 2] as unknown as string[], symbols)).toEqual(symbols);
  });

  it("bỏ mã trùng", () => {
    expect(sanitizeOrder(["B", "B", "A"], symbols)).toEqual(["B", "A", "C"]);
  });
});

describe("loadPrefs / savePrefs", () => {
  it("khoá đúng theo từng nguồn", () => {
    const storage = store();
    savePrefs(storage, "mock", { ...DEFAULT_PREFS });
    expect(Object.keys(storage.dump())).toEqual(["price-board-demo:bang-gia:v1:mock"]);
    const other = store();
    savePrefs(other, "ysflex", { ...DEFAULT_PREFS });
    expect(Object.keys(other.dump())).toEqual(["price-board-demo:bang-gia:v1:ysflex"]);
  });

  it("đọc lại đúng dữ liệu đã ghi", () => {
    const storage = store();
    const prefs = {
      ...DEFAULT_PREFS,
      order: ["C", "A", "B"],
      sort: { columnId: "changePct", direction: "desc" as const },
      hidden: ["bid3v"],
      collapsed: true,
    };
    savePrefs(storage, "mock", prefs);
    expect(loadPrefs(storage, "mock")).toEqual(prefs);
  });

  it("chưa có gì thì trả mặc định", () => {
    expect(loadPrefs(store(), "mock")).toEqual(DEFAULT_PREFS);
  });

  it("JSON hỏng thì trả mặc định, không ném lỗi", () => {
    const storage = store({ "price-board-demo:bang-gia:v1:mock": "{hỏng" });
    expect(() => loadPrefs(storage, "mock")).not.toThrow();
    expect(loadPrefs(storage, "mock")).toEqual(DEFAULT_PREFS);
  });

  it("sai kiểu thì trả mặc định", () => {
    const storage = store({ "price-board-demo:bang-gia:v1:mock": JSON.stringify({ order: 5, hidden: "x", sort: 1, collapsed: "yes" }) });
    expect(loadPrefs(storage, "mock")).toEqual(DEFAULT_PREFS);
  });

  it("storage ném lỗi thì trả mặc định và không ném", () => {
    const broken: StorageLike = {
      getItem: () => { throw new Error("chặn"); },
      setItem: () => { throw new Error("chặn"); },
      removeItem: () => { throw new Error("chặn"); },
    };
    expect(() => loadPrefs(broken, "mock")).not.toThrow();
    expect(loadPrefs(broken, "mock")).toEqual(DEFAULT_PREFS);
    expect(() => savePrefs(broken, "mock", DEFAULT_PREFS)).not.toThrow();
  });

  it("lọc sort hỏng thành null", () => {
    const storage = store({ "price-board-demo:bang-gia:v1:mock": JSON.stringify({ sort: { columnId: "x", direction: "bậy" } }) });
    expect(loadPrefs(storage, "mock").sort).toBeNull();
  });
});

describe("tab đang mở", () => {
  it("mặc định là vn30", () => {
    expect(DEFAULT_PREFS.tab).toBe("vn30");
    expect(loadPrefs(store(), "mock").tab).toBe("vn30");
  });

  it("tab hợp lệ được giữ lại khi đọc", () => {
    const storage = store({ "price-board-demo:bang-gia:v1:mock": JSON.stringify({ tab: "hnx" }) });
    expect(loadPrefs(storage, "mock").tab).toBe("hnx");
  });

  it("tab lạ hoặc sai kiểu thì về vn30", () => {
    for (const bad of ["nhomnganh", 5, null, {}]) {
      const storage = store({ "price-board-demo:bang-gia:v1:mock": JSON.stringify({ tab: bad }) });
      expect(loadPrefs(storage, "mock").tab).toBe("vn30");
    }
  });

  it("khoá cũ không có tab vẫn đọc được các trường cũ", () => {
    const storage = store({
      "price-board-demo:bang-gia:v1:mock": JSON.stringify({
        order: ["C", "A"], sort: { columnId: "changePct", direction: "desc" }, hidden: ["bid3v"], collapsed: true,
      }),
    });
    const prefs = loadPrefs(storage, "mock");
    expect(prefs.order).toEqual(["C", "A"]);
    expect(prefs.sort).toEqual({ columnId: "changePct", direction: "desc" });
    expect(prefs.hidden).toEqual(["bid3v"]);
    expect(prefs.collapsed).toBe(true);
    expect(prefs.tab).toBe("vn30");
  });

  it("ghi rồi đọc lại giữ nguyên tab", () => {
    const storage = store();
    savePrefs(storage, "mock", { ...DEFAULT_PREFS, tab: "upcom" });
    expect(loadPrefs(storage, "mock").tab).toBe("upcom");
    expect(Object.keys(storage.dump())).toEqual(["price-board-demo:bang-gia:v1:mock"]);
  });
});

describe("thứ tự và cách xếp riêng của từng tab", () => {
  it("khoá đúng dạng <khoá chính>:tab:<tab>", () => {
    expect(tabStorageKey("mock", "hnx")).toBe("price-board-demo:bang-gia:v1:mock:tab:hnx");
    expect(tabStorageKey("ysflex", "watchlist")).toBe("price-board-demo:bang-gia:v1:ysflex:tab:watchlist");
  });

  it("chưa lưu gì thì trả rỗng", () => {
    expect(loadTabView(store(), "mock", "hnx")).toEqual({ order: [], sort: null });
  });

  it("ghi rồi đọc lại đúng", () => {
    const storage = store();
    saveTabView(storage, "mock", "hnx", { order: ["SHS", "PVS"], sort: { columnId: "changePct", direction: "asc" } });
    expect(loadTabView(storage, "mock", "hnx")).toEqual({
      order: ["SHS", "PVS"],
      sort: { columnId: "changePct", direction: "asc" },
    });
  });

  it("mỗi tab một khoá riêng, không đè lên khoá chính", () => {
    const storage = store();
    savePrefs(storage, "mock", { ...DEFAULT_PREFS, tab: "hnx", order: ["ACB"] });
    saveTabView(storage, "mock", "hnx", { order: ["SHS"], sort: null });
    expect(loadTabView(storage, "mock", "hnx").order).toEqual(["SHS"]);
    expect(loadPrefs(storage, "mock").order).toEqual(["ACB"]);
    expect(Object.keys(storage.dump()).sort()).toEqual([
      "price-board-demo:bang-gia:v1:mock",
      "price-board-demo:bang-gia:v1:mock:tab:hnx",
    ]);
  });

  it("dữ liệu hỏng hoặc storage ném lỗi thì trả rỗng, không ném", () => {
    expect(loadTabView(store({ "price-board-demo:bang-gia:v1:mock:tab:hnx": "{hỏng" }), "mock", "hnx")).toEqual({
      order: [], sort: null,
    });
    const broken = {
      getItem: () => { throw new Error("chặn"); },
      setItem: () => { throw new Error("chặn"); },
      removeItem: () => { throw new Error("chặn"); },
    };
    expect(() => loadTabView(broken, "mock", "hnx")).not.toThrow();
    expect(() => saveTabView(broken, "mock", "hnx", { order: ["A"], sort: null })).not.toThrow();
  });
});
