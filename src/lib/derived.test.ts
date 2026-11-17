import { describe, expect, it } from "vitest";
import type { BoardQuote } from "./quote-store-core";
import { emptyQuote } from "../../shared/protocol";
import {
  countMovers,
  foreignTradeText,
  foreignTradeValue,
  sumTurnover,
  vn30Index,
} from "./derived";

// Quote rút gọn để test công thức; chỉ khai báo trường công thức dùng.
const quote = (patch: Partial<BoardQuote>): BoardQuote => ({ ...emptyQuote(patch.symbol ?? "X"), ...patch });

describe("foreignTradeValue: GT mua, GT bán khối ngoại (nghìn đồng)", () => {
  it("tính theo KL × giá TB ÷ 1000 khi nguồn không có sẵn giá trị", () => {
    // 1.000 cổ phiếu × 20.000 đồng = 20.000.000 đồng = 20.000 nghìn đồng.
    expect(foreignTradeValue(quote({ foreignBuy: 1000, avgPrice: 20_000 }), "buy")).toBe(20_000);
    expect(foreignTradeText(quote({ foreignBuy: 1000, avgPrice: 20_000 }), "buy")).toBe("20,000");
  });

  it("không dùng giá trị luồng chưa xác nhận nghĩa, luôn tính theo KL × giá TB", () => {
    const withStream = quote({ foreignBuy: 1000, avgPrice: 20_000, foreignBuyValue: 2_000_000_000 });
    expect(foreignTradeValue(withStream, "buy")).toBe(20_000);
  });

  it("bên bán dùng đúng KL của bên bán", () => {
    const q = quote({ foreignSell: 500, avgPrice: 10_000, foreignSellValue: 7_000_000 });
    expect(foreignTradeValue(q, "sell")).toBe(5_000);
  });

  it("nguồn ysflex không có KL khối ngoại thì để trống, kể cả khi luồng có giá trị", () => {
    const q = quote({ avgPrice: 20_000, foreignBuyValue: 2_333_468_841, foreignSellValue: 988_985_433 });
    expect(foreignTradeText(q, "buy")).toBe("");
    expect(foreignTradeText(q, "sell")).toBe("");
  });

  it("không có dữ liệu thì trả 0 và chuỗi rỗng", () => {
    expect(foreignTradeValue(quote({}), "buy")).toBe(0);
    expect(foreignTradeText(quote({}), "buy")).toBe("");
    expect(foreignTradeText(quote({ foreignBuy: 0, avgPrice: 20_000 }), "buy")).toBe("");
  });

  it("giá trị âm từ luồng không ảnh hưởng kết quả", () => {
    // Luồng YSFlex có mã trả giá trị âm (ví dụ -21.742.696), dấu hiệu trường này không phải GT gộp.
    const q = quote({ foreignBuy: 100, avgPrice: 20_000, foreignBuyValue: -21_742_696 });
    expect(foreignTradeValue(q, "buy")).toBe(2_000);
  });
});

describe("sumTurnover: Tổng GTGD (tỷ VNĐ)", () => {
  it("một mã: KL × giá TB ÷ 1 tỷ", () => {
    // 1.000.000 × 20.000 = 20 tỷ.
    expect(sumTurnover([quote({ totalVolume: 1_000_000, avgPrice: 20_000 })])).toBe(20);
  });

  it("cộng nhiều mã", () => {
    // 20 tỷ + 5 tỷ = 25 tỷ.
    const quotes = [
      quote({ totalVolume: 1_000_000, avgPrice: 20_000 }),
      quote({ totalVolume: 500_000, avgPrice: 10_000 }),
    ];
    expect(sumTurnover(quotes)).toBe(25);
  });

  it("làm tròn về số nguyên tỷ", () => {
    // 1.260.000 cổ phiếu × 20.000 đồng = 25,2 tỷ -> 25.
    expect(sumTurnover([quote({ totalVolume: 1_260_000, avgPrice: 20_000 })])).toBe(25);
  });
});

describe("vn30Index: chỉ số VN30 giả lập", () => {
  it("nhân 1817.05 với trung bình cộng % thay đổi", () => {
    const quotes = [
      quote({ symbol: "A", ref: 100, last: 101 }), // +1%
      quote({ symbol: "B", ref: 200, last: 199 }), // -0.5%
    ];
    // Trung bình 0.25% -> 1817.05 × 1.0025 = 1821.592625.
    const index = vn30Index(quotes);
    expect(index.value).toBeCloseTo(1821.5926, 3);
    expect(index.change).toBeCloseTo(4.5426, 3);
    expect(index.changePct).toBeCloseTo(0.25, 6);
  });

  it("bỏ qua mã chưa có giá khớp hoặc chưa có TC", () => {
    const quotes = [
      quote({ symbol: "A", ref: 100, last: 101 }),
      quote({ symbol: "B", ref: 0, last: 5 }),
      quote({ symbol: "C", ref: 100, last: null }),
    ];
    expect(vn30Index(quotes).changePct).toBeCloseTo(1, 6);
  });

  it("không có mã nào có giá thì đứng ở số gốc", () => {
    const index = vn30Index([]);
    expect(index.value).toBe(1817.05);
    expect(index.change).toBe(0);
    expect(index.changePct).toBe(0);
  });
});

describe("countMovers: số mã tăng, đứng, giảm", () => {
  it("đếm theo giá khớp so với TC", () => {
    const quotes = [
      quote({ symbol: "A", ref: 100, last: 101 }),
      quote({ symbol: "B", ref: 100, last: 100 }),
      quote({ symbol: "C", ref: 100, last: 99 }),
      quote({ symbol: "D", ref: 100, last: 98 }),
    ];
    expect(countMovers(quotes)).toEqual({ up: 1, flat: 1, down: 2 });
  });

  it("bỏ qua mã thiếu giá hoặc thiếu TC", () => {
    const quotes = [
      quote({ symbol: "A", ref: 100, last: 101 }),
      quote({ symbol: "B", ref: 0, last: 50 }),
      quote({ symbol: "C", ref: 100, last: null }),
    ];
    expect(countMovers(quotes)).toEqual({ up: 1, flat: 0, down: 0 });
  });
});
