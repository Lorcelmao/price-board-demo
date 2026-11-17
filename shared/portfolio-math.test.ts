import { describe, expect, it } from "vitest";
import { averageCostAfterBuy, positionMetrics, summarizeAssets, weightPct } from "./portfolio-math";

describe("giá vốn", () => {
  it("mua thêm thì lấy trung bình có trọng số", () => {
    // (300 × 10,000 + 100 × 14,000) / 400 = 11,000
    expect(averageCostAfterBuy(300, 10_000, 100, 14_000)).toBe(11_000);
  });

  it("mua lần đầu thì giá vốn là giá mua", () => {
    expect(averageCostAfterBuy(0, 0, 200, 25_000)).toBe(25_000);
  });
});

describe("lãi lỗ", () => {
  it("tính đúng khi giá tăng", () => {
    const result = positionMetrics(1_000, 49_800, 52_700);
    expect(result.costValue).toBe(49_800_000);
    expect(result.marketValue).toBe(52_700_000);
    expect(result.profitLoss).toBe(2_900_000);
    expect(result.profitLossPct).toBeCloseTo(5.823, 2);
  });

  it("giá vốn bằng 0 thì không chia cho 0", () => {
    expect(positionMetrics(100, 0, 10_000).profitLossPct).toBe(0);
  });

  it("tỉ trọng khi tổng bằng 0 là 0", () => {
    expect(weightPct(10, 0)).toBe(0);
    expect(weightPct(25, 100)).toBe(25);
  });
});

describe("NAV", () => {
  it("tổng tài sản trừ nợ", () => {
    const result = summarizeAssets({
      cash: 10_000_000,
      receivableT0: 0,
      receivableT1: 0,
      stockValue: 50_000_000,
      debt: 20_000_000,
    });
    expect(result.totalAsset).toBe(60_000_000);
    expect(result.nav).toBe(40_000_000);
    expect(result.marginRatioPct).toBe(80);
  });

  it("không giữ cổ phiếu thì không có tỷ lệ ký quỹ", () => {
    const result = summarizeAssets({ cash: 5, receivableT0: 0, receivableT1: 0, stockValue: 0, debt: 0 });
    expect(result.marginRatioPct).toBeNull();
  });
});
