import { describe, expect, it } from "vitest";
import { calcLimits, isOnTick } from "../shared/market-rules";
import { dailyHistory, toWeekly, tradingDaysBefore } from "./candles";

const today = new Date(2026, 10, 17); // một ngày thứ Ba
const fpt = () => dailyHistory({ symbol: "FPT", exchange: "HOSE", ref: 52_700, today, days: 1250 });

describe("lịch sử nến ngày", () => {
  it("cùng mã ra cùng chuỗi, khác mã ra chuỗi khác", () => {
    expect(fpt()).toEqual(fpt());
    const hpg = dailyHistory({ symbol: "HPG", exchange: "HOSE", ref: 52_700, today, days: 1250 });
    expect(hpg).not.toEqual(fpt());
  });

  it("không có thứ Bảy, Chủ nhật, và ngày cuối là phiên liền trước hôm nay", () => {
    const candles = fpt();
    expect(candles).toHaveLength(1250);
    for (const { time } of candles) expect([0, 6]).not.toContain(new Date(`${time}T00:00:00`).getDay());
    expect(candles.at(-1)!.time).toBe("2026-11-16");
    expect(tradingDaysBefore(new Date(2026, 10, 16), 1)).toEqual(["2026-11-13"]); // thứ Hai lùi về thứ Sáu
  });

  it("đóng cửa ngày trước là tham chiếu ngày sau; giá trong biên độ và đúng bước giá", () => {
    for (const [symbol, exchange, ref] of [["FPT", "HOSE", 52_700], ["SHS", "HNX", 16_400], ["ACV", "UPCOM", 98_000]] as const) {
      const candles = dailyHistory({ symbol, exchange, ref, today, days: 400 });
      expect(candles.at(-1)!.close).toBe(ref);
      for (let i = 1; i < candles.length; i += 1) {
        const dayRef = candles[i - 1].close;
        const { ceil, floor } = calcLimits(dayRef, exchange);
        const { open, high, low, close, volume } = candles[i];
        for (const price of [open, high, low, close]) {
          expect(price).toBeGreaterThanOrEqual(floor);
          expect(price).toBeLessThanOrEqual(ceil);
          expect(isOnTick(price, exchange)).toBe(true);
        }
        expect(low).toBeLessThanOrEqual(Math.min(open, close));
        expect(high).toBeGreaterThanOrEqual(Math.max(open, close));
        expect(volume % 100).toBe(0);
        expect(volume).toBeGreaterThan(0);
      }
    }
  });
});

describe("gộp nến tuần", () => {
  it("open ngày đầu, close ngày cuối, high lớn nhất, low nhỏ nhất, cộng khối lượng", () => {
    const week = toWeekly([
      { time: "2026-11-09", open: 100, high: 110, low: 95, close: 105, volume: 1_000 }, // thứ Hai
      { time: "2026-11-11", open: 105, high: 120, low: 100, close: 118, volume: 2_000 },
      { time: "2026-11-13", open: 118, high: 119, low: 90, close: 92, volume: 500 }, // thứ Sáu
      { time: "2026-11-16", open: 92, high: 93, low: 91, close: 93, volume: 100 }, // thứ Hai tuần sau
    ]);
    expect(week).toEqual([
      { time: "2026-11-09", open: 100, high: 120, low: 90, close: 92, volume: 3_500 },
      { time: "2026-11-16", open: 92, high: 93, low: 91, close: 93, volume: 100 },
    ]);
  });
});
