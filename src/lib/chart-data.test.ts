import { describe, expect, it } from "vitest";
import { changeFrom, DEFAULT_CHART_PREFS, liveLastCandle, rangeStart, sanitizePrefs } from "./chart-data";
import { ema } from "./indicators";

describe("ema", () => {
  it("tính đúng ví dụ tay: chu kỳ 3, k = 0,5", () => {
    // SMA 3 giá đầu = (10 + 11 + 12) / 3 = 11; tiếp: 13×0,5 + 11×0,5 = 12; 14×0,5 + 12×0,5 = 13.
    expect(ema([10, 11, 12, 13, 14], 3)).toEqual([null, null, 11, 12, 13]);
  });

  it("chuỗi ngắn hơn chu kỳ thì toàn null", () => {
    expect(ema([1, 2], 5)).toEqual([null, null]);
  });
});

describe("khoảng xem", () => {
  it("lùi đúng số tháng từ cây cuối, MAX thì không giới hạn", () => {
    expect(rangeStart("2026-11-17", "1M")).toBe("2026-10-17");
    expect(rangeStart("2026-11-17", "6M")).toBe("2026-05-17");
    expect(rangeStart("2026-11-17", "1Y")).toBe("2025-11-17");
    expect(rangeStart("2026-11-17", "5Y")).toBe("2021-11-17");
    expect(rangeStart("2026-11-17", "MAX")).toBeNull();
  });
});

describe("lựa chọn đã lưu", () => {
  it("giá trị lạ trả về mặc định, giá trị đúng được giữ", () => {
    expect(sanitizePrefs(null)).toEqual(DEFAULT_CHART_PREFS);
    expect(sanitizePrefs({ type: "renko", ema20: "có", scale: "log" })).toEqual({ ...DEFAULT_CHART_PREFS, scale: "log" });
  });
});

describe("cây nến cuối theo realtime", () => {
  const quote = { last: 53_100, ref: 52_700, open: 52_800, high: 53_300, low: 52_600, totalVolume: 900_000 };

  it("nến ngày: lấy đúng O/H/L/C và khối lượng của phiên", () => {
    const last = { time: "2026-11-17", open: 52_700, high: 52_900, low: 52_700, close: 52_800, volume: 100 };
    expect(liveLastCandle(last, quote, last)).toEqual({
      time: "2026-11-17", open: 52_800, high: 53_300, low: 52_600, close: 53_100, volume: 900_000,
    });
  });

  it("nến tuần: giữ open của tuần, mở rộng high/low, cộng khối lượng các ngày trước", () => {
    const today = { time: "2026-11-17", open: 52_700, high: 52_900, low: 52_700, close: 52_800, volume: 100_000 };
    const week = { time: "2026-11-16", open: 51_000, high: 53_000, low: 50_500, close: 52_800, volume: 2_100_000 };
    expect(liveLastCandle(week, quote, today)).toEqual({
      time: "2026-11-16", open: 51_000, high: 53_300, low: 50_500, close: 53_100, volume: 2_900_000,
    });
  });

  it("chưa có giá khớp thì đóng cửa theo giá tham chiếu", () => {
    const last = { time: "2026-11-17", open: 0, high: 0, low: 0, close: 0, volume: 0 };
    const result = liveLastCandle(last, { ...quote, last: null, open: 0, high: 0, low: 0, totalVolume: 0 }, last);
    expect(result).toMatchObject({ open: 52_700, high: 52_700, low: 52_700, close: 52_700 });
  });
});

describe("thay đổi so với cây trước", () => {
  it("tính giá và phần trăm", () => {
    const previous = { time: "a", open: 0, high: 0, low: 0, close: 50_000, volume: 0 };
    const current = { time: "b", open: 0, high: 0, low: 0, close: 51_000, volume: 0 };
    expect(changeFrom(previous, current)).toEqual({ change: 1_000, changePct: 2 });
    expect(changeFrom(undefined, current)).toEqual({ change: 0, changePct: 0 });
  });
});
