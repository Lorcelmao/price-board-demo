import { describe, expect, it } from "vitest";
import {
  chartMinutes,
  computeIndex,
  isTradingMinute,
  mergeIndexHistory,
  mergeIndexTick,
  vnClock,
  type IndexSnapshot,
  type MemberQuote,
} from "./indexes";

const member = (ref: number, last: number | null, extra: Partial<MemberQuote> = {}): MemberQuote => ({
  ref, ceil: Math.round(ref * 1.07), floor: Math.round(ref * 0.93), last, totalVolume: 1000, totalValue: 1000 * ref, ...extra,
});

const snap = (time: string, value: number, volume = 0): IndexSnapshot => ({
  code: "VNI", value, ref: 1000, change: value - 1000, changePct: 0, volume, turnover: 0,
  up: 0, ceil: 0, flat: 0, down: 0, floor: 0, time,
});

describe("computeIndex", () => {
  it("giá trị = mốc × (1 + % bình quân), đếm tăng giảm trần sàn", () => {
    const result = computeIndex("VNI", 1000, [
      member(10_000, 10_700), // trần, +7%
      member(20_000, 19_000), // -5%
      member(30_000, 30_000), // đứng
      member(40_000, null), // chưa khớp: tính là đứng, không vào bình quân
    ], "10:00:00");
    expect(result.changePct).toBeCloseTo(0.67, 2);
    expect(result.value).toBeCloseTo(1006.67, 2);
    expect(result).toMatchObject({ up: 1, ceil: 1, down: 1, floor: 0, flat: 2, volume: 4000 });
  });

  it("chưa mã nào khớp thì bằng mốc", () => {
    expect(computeIndex("HNX", 250, [member(10_000, null)], "09:00:00").value).toBe(250);
  });
});

describe("giờ biểu đồ", () => {
  it("trục có đủ 361 phút từ 09:00 tới 15:00", () => {
    const minutes = chartMinutes();
    expect(minutes).toHaveLength(361);
    expect(minutes[0]).toBe("09:00");
    expect(minutes[360]).toBe("15:00");
  });

  it("giờ nghỉ trưa không phải phút giao dịch", () => {
    expect(isTradingMinute("11:30")).toBe(true);
    expect(isTradingMinute("12:00")).toBe(false);
    expect(isTradingMinute("13:00")).toBe(true);
    expect(isTradingMinute("15:01")).toBe(false);
  });

  it("vnClock đổi sang giờ Việt Nam, không theo múi giờ của máy", () => {
    expect(vnClock(Date.UTC(2026, 10, 17, 2, 5, 9))).toBe("09:05:09");
  });
});

describe("mergeIndexTick", () => {
  it("phút mới thì thêm điểm, cùng phút thì đổi giá trị và cộng khối lượng", () => {
    let points = mergeIndexTick([], snap("10:00:05", 1001), 50);
    points = mergeIndexTick(points, snap("10:00:40", 1002), 30);
    points = mergeIndexTick(points, snap("10:01:02", 1003), 10);
    expect(points).toEqual([
      { time: "10:00", value: 1002, volume: 80 },
      { time: "10:01", value: 1003, volume: 10 },
    ]);
  });

  it("ngoài giờ chỉ đổi giá trị điểm cuối", () => {
    const points = mergeIndexTick([{ time: "14:45", value: 1000, volume: 5 }], snap("16:30:00", 1004), 99);
    expect(points).toEqual([{ time: "14:45", value: 1004, volume: 5 }]);
  });

  it("tin cũ hơn điểm cuối thì bỏ qua", () => {
    const points = [{ time: "10:05", value: 1000, volume: 5 }];
    expect(mergeIndexTick(points, snap("10:03:00", 999), 1)).toBe(points);
  });
});

describe("mergeIndexHistory", () => {
  it("giữ lịch sử, thêm điểm trực tiếp mới hơn", () => {
    const history = [{ time: "09:01", value: 1, volume: 1 }, { time: "09:02", value: 2, volume: 1 }];
    const live = [{ time: "09:02", value: 9, volume: 9 }, { time: "09:03", value: 3, volume: 1 }];
    expect(mergeIndexHistory(history, live).map((point) => point.time)).toEqual(["09:01", "09:02", "09:03"]);
    expect(mergeIndexHistory(history, live)[1].value).toBe(2);
  });
});
