import { describe, expect, it } from "vitest";
import { toIntradayCandle, toIntradayCandles, toTradeTick, toTradeTicks } from "./ysflex-history-map";

// Tin mẫu GIẢ, cùng cấu trúc dòng HIST_RES của /market (đã đối chiếu mẫu thật trong báo cáo 17/11).
const candle = (overrides: Record<string, unknown> = {}) => ({
  topic: "INTRADAY_1m|G1|FPT",
  data: { S: "FPT", O: 48100, H: 48200, L: 48000, C: 48150, V: 1000, TV: "1000", T: "09:16:00", ...overrides },
});

const trade = (seq: number, data: Record<string, unknown>) => ({ seq, data });

describe("toIntradayCandle", () => {
  it("đổi một nến 1 phút, time cắt còn HH:mm", () => {
    expect(toIntradayCandle(candle())).toEqual({
      time: "09:16",
      open: 48100,
      high: 48200,
      low: 48000,
      close: 48150,
      volume: 1000,
    });
  });

  it("thiếu V thì lấy TV, thiếu cả hai thì 0", () => {
    expect(toIntradayCandle(candle({ V: undefined, TV: "2500" }))?.volume).toBe(2500);
    expect(toIntradayCandle(candle({ V: undefined, TV: undefined }))?.volume).toBe(0);
  });

  it("bỏ dòng hỏng: thiếu giá hoặc sai giờ", () => {
    expect(toIntradayCandle(candle({ O: undefined }))).toBeNull();
    expect(toIntradayCandle(candle({ T: "25:00:00" }))).toBeNull();
    expect(toIntradayCandle(candle({ T: undefined }))).toBeNull();
    expect(toIntradayCandle(null)).toBeNull();
    expect(toIntradayCandle({ data: "không phải object" })).toBeNull();
  });
});

describe("toIntradayCandles", () => {
  it("sắp xếp theo giờ tăng dần và bỏ dòng hỏng", () => {
    const rows = [
      candle({ T: "09:17:00" }),
      candle({ T: "09:16:00", C: 48100 }),
      candle({ T: "09:18:00", O: undefined }),
    ];

    expect(toIntradayCandles(rows).map((item) => [item.time, item.close])).toEqual([
      ["09:16", 48100],
      ["09:17", 48150],
    ]);
  });

  it("đầu vào không phải mảng thì trả mảng rỗng", () => {
    expect(toIntradayCandles(null)).toEqual([]);
    expect(toIntradayCandles("")).toEqual([]);
  });
});

describe("toTradeTick", () => {
  it("đổi lệnh khớp, giữ giờ đủ giây và chiều chủ động", () => {
    expect(toTradeTick(trade(9, { t270: 48500, t271: 100, t54: "B", t60: "144500006" }))).toEqual({
      time: "14:45:00",
      price: 48500,
      volume: 100,
      side: "BUY",
      seq: 9,
    });
    expect(toTradeTick(trade(8, { t270: 48450, t271: 200, t54: "S", t60: "144459999" }))?.side).toBe("SELL");
  });

  it("thiếu t54 thì side null; t60 dạng HH:mm:ss vẫn đọc được", () => {
    expect(toTradeTick(trade(7, { t270: 48400, t271: 50, t60: "14:44:59" }))).toEqual({
      time: "14:44:59",
      price: 48400,
      volume: 50,
      side: null,
      seq: 7,
    });
  });

  it("bỏ dòng hỏng: thiếu seq, giá, KL hoặc giờ", () => {
    expect(toTradeTick(trade(5, { t270: 48500, t271: 100 }))).toBeNull();
    expect(toTradeTick({ data: { t270: 48500, t271: 100, t60: "144500006" } })).toBeNull();
    expect(toTradeTick(trade(6, { t270: 0, t271: 100, t60: "144500006" }))).toBeNull();
    expect(toTradeTick(trade(6, { t270: 48500, t271: 100, t60: "999999" }))).toBeNull();
    expect(toTradeTick(null)).toBeNull();
  });
});

describe("toTradeTicks", () => {
  it("mới nhất trước và bỏ dòng hỏng", () => {
    const ticks = toTradeTicks([
      trade(1, { t270: 48450, t271: 200, t54: "S", t60: "144459999" }),
      trade(3, { t270: 48550, t271: 50, t60: "144501000" }),
      trade(2, { t270: 48500, t271: 100, t54: "B", t60: "144500006" }),
      trade(2, { t270: null, t271: 0, t60: "144500006" }),
    ]);

    expect(ticks.map((tick) => [tick.seq, tick.side])).toEqual([
      [3, null],
      [2, "BUY"],
      [1, "SELL"],
    ]);
  });

  it("đầu vào không phải mảng thì trả mảng rỗng", () => {
    expect(toTradeTicks(undefined)).toEqual([]);
    expect(toTradeTicks({})).toEqual([]);
  });
});
