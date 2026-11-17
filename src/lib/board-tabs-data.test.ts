import { describe, expect, it } from "vitest";
import type { Instrument } from "../../shared/protocol";
import { exchangeOf, instrumentsFromApi, symbolsForTab, tabEnabled } from "./board-tabs-data";

// Danh sách instruments viết tay, không gọi mạng: 5 HOSE, 3 HNX, 2 UPCOM.
const instruments: Instrument[] = [
  { symbol: "ACB", name: "ACB", exchange: "HOSE", ref: 24_450, ceil: 26_150, floor: 22_750 },
  { symbol: "FPT", name: "FPT", exchange: "HOSE", ref: 52_700, ceil: 56_300, floor: 49_050 },
  { symbol: "SSI", name: "SSI", exchange: "HOSE", ref: 34_100, ceil: 36_450, floor: 31_750 },
  { symbol: "VNM", name: "Vinamilk", exchange: "HOSE", ref: 58_900, ceil: 63_000, floor: 54_800 },
  { symbol: "MWG", name: "Thế Giới Di Động", exchange: "HOSE", ref: 71_200, ceil: 76_150, floor: 66_250 },
  { symbol: "PVS", name: "PTSC", exchange: "HNX", ref: 33_600, ceil: 36_950, floor: 30_250 },
  { symbol: "SHS", name: "SHS", exchange: "HNX", ref: 18_300, ceil: 20_100, floor: 16_500 },
  { symbol: "CEO", name: "C.E.O", exchange: "HNX", ref: 21_400, ceil: 23_500, floor: 19_300 },
  { symbol: "ACV", name: "ACV", exchange: "UPCOM", ref: 84_200, ceil: 96_800, floor: 71_600 },
  { symbol: "VEA", name: "VEAM", exchange: "UPCOM", ref: 41_300, ceil: 47_500, floor: 35_100 },
];

const VN30 = ["ACB", "FPT", "SSI"];

describe("symbolsForTab", () => {
  it("VN30 trả đúng danh sách VN30 của nguồn", () => {
    expect(symbolsForTab("vn30", "mock", instruments, [], VN30)).toEqual(VN30);
    expect(symbolsForTab("vn30", "ysflex", instruments, [], VN30)).toEqual(VN30);
  });

  it("HNX lọc đúng sàn và xếp theo bảng chữ cái", () => {
    expect(symbolsForTab("hnx", "mock", instruments, [], VN30)).toEqual(["CEO", "PVS", "SHS"]);
  });

  it("UPCOM lọc đúng sàn", () => {
    expect(symbolsForTab("upcom", "mock", instruments, [], VN30)).toEqual(["ACV", "VEA"]);
  });

  it("DM quan tâm trả đúng danh mục, giữ thứ tự người dùng thêm", () => {
    expect(symbolsForTab("watchlist", "mock", instruments, ["VNM", "ACB"], VN30)).toEqual(["VNM", "ACB"]);
  });

  it("với ysflex, HNX và UPCOM trả mảng rỗng", () => {
    expect(symbolsForTab("hnx", "ysflex", instruments, [], VN30)).toEqual([]);
    expect(symbolsForTab("upcom", "ysflex", instruments, [], VN30)).toEqual([]);
  });

  it("chưa có instruments thì HNX, UPCOM rỗng", () => {
    expect(symbolsForTab("hnx", "mock", [], [], VN30)).toEqual([]);
    expect(symbolsForTab("upcom", "mock", [], [], VN30)).toEqual([]);
  });
});

describe("exchangeOf", () => {
  it("ysflex luôn là HOSE", () => {
    expect(exchangeOf("PVS", "ysflex", instruments)).toBe("HOSE");
  });

  it("mock lấy sàn từ instruments", () => {
    expect(exchangeOf("PVS", "mock", instruments)).toBe("HNX");
    expect(exchangeOf("ACV", "mock", instruments)).toBe("UPCOM");
    expect(exchangeOf("FPT", "mock", instruments)).toBe("HOSE");
  });

  it("mã không có trong danh sách thì mặc định HOSE", () => {
    expect(exchangeOf("ZZZ", "mock", instruments)).toBe("HOSE");
  });
});

describe("tabEnabled", () => {
  it("VN30 và DM quan tâm bật với cả hai nguồn", () => {
    for (const source of ["mock", "ysflex"] as const) {
      expect(tabEnabled("vn30", source)).toBe(true);
      expect(tabEnabled("watchlist", source)).toBe(true);
    }
  });

  it("HNX và UPCOM chỉ bật với mock", () => {
    expect(tabEnabled("hnx", "mock")).toBe(true);
    expect(tabEnabled("upcom", "mock")).toBe(true);
    expect(tabEnabled("hnx", "ysflex")).toBe(false);
    expect(tabEnabled("upcom", "ysflex")).toBe(false);
  });
});

describe("instrumentsFromApi", () => {
  it("nhận mảng hợp lệ", () => {
    expect(instrumentsFromApi(instruments)).toHaveLength(10);
  });

  it("dữ liệu hỏng thì trả mảng rỗng", () => {
    expect(instrumentsFromApi(null)).toEqual([]);
    expect(instrumentsFromApi({})).toEqual([]);
    expect(instrumentsFromApi([{ symbol: 5 }])).toEqual([]);
  });

  it("bỏ phần tử thiếu trường bắt buộc", () => {
    const mixed = [{ symbol: "FPT", exchange: "HOSE" }, { symbol: "ACB" }] as unknown;
    const out = instrumentsFromApi(mixed);
    expect(out.map((item) => item.symbol)).toEqual(["FPT"]);
  });
});
