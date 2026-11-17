import { describe, expect, it } from "vitest";
import {
  allowedOrderTypes,
  calcLimits,
  canCancelOrModify,
  effectivePhase,
  isOnTick,
  priceAbove,
  priceBelow,
  tickSize,
} from "./market-rules";

describe("bước giá", () => {
  it("HOSE có ba bậc, HNX và UPCoM cố định 100 đồng", () => {
    expect(tickSize(9_990, "HOSE")).toBe(10);
    expect(tickSize(10_000, "HOSE")).toBe(50);
    expect(tickSize(49_950, "HOSE")).toBe(50);
    expect(tickSize(50_000, "HOSE")).toBe(100);
    expect(tickSize(9_000, "HNX")).toBe(100);
    expect(tickSize(120_000, "UPCOM")).toBe(100);
  });

  it("đi qua ranh giới bước giá vẫn ra đúng mức", () => {
    expect(priceAbove(49_950, "HOSE")).toBe(50_000);
    expect(priceBelow(50_000, "HOSE")).toBe(49_950);
    expect(priceAbove(9_990, "HOSE")).toBe(10_000);
    expect(priceBelow(10_000, "HOSE")).toBe(9_990);
  });

  it("nhận ra giá sai bước", () => {
    expect(isOnTick(52_700, "HOSE")).toBe(true);
    expect(isOnTick(52_750, "HOSE")).toBe(false);
    expect(isOnTick(28_350, "HOSE")).toBe(true);
    expect(isOnTick(28_370, "HOSE")).toBe(false);
  });
});

describe("giá trần và sàn", () => {
  it("khớp số thật đã đọc trên bảng giá: FPT tham chiếu 52.70", () => {
    expect(calcLimits(52_700, "HOSE")).toEqual({ ceil: 56_300, floor: 49_050 });
  });

  it("biên độ khác nhau theo sàn", () => {
    expect(calcLimits(20_000, "HNX")).toEqual({ ceil: 22_000, floor: 18_000 });
    expect(calcLimits(20_000, "UPCOM")).toEqual({ ceil: 23_000, floor: 17_000 });
  });

  it("mã giá thấp vẫn có ít nhất một bước để giao dịch", () => {
    const { ceil, floor } = calcLimits(1_000, "HNX");
    expect(ceil).toBeGreaterThan(1_000);
    expect(floor).toBeLessThan(1_000);
  });
});

describe("loại lệnh theo sàn và đợt", () => {
  it("HOSE đổi loại lệnh theo đợt", () => {
    expect(allowedOrderTypes("HOSE", "ATO")).toEqual(["LO", "ATO"]);
    expect(allowedOrderTypes("HOSE", "CONTINUOUS")).toEqual(["LO", "MTL"]);
    expect(allowedOrderTypes("HOSE", "ATC")).toEqual(["LO", "ATC"]);
    expect(allowedOrderTypes("HOSE", "CLOSED")).toEqual([]);
  });

  it("HNX không có ATO, UPCoM chỉ có LO và khớp liên tục", () => {
    expect(effectivePhase("HNX", "ATO")).toBe("CONTINUOUS");
    expect(allowedOrderTypes("HNX", "CONTINUOUS")).toEqual(["LO", "MTL", "MOK", "MAK"]);
    expect(effectivePhase("UPCOM", "ATC")).toBe("CONTINUOUS");
    expect(allowedOrderTypes("UPCOM", "ATC")).toEqual(["LO"]);
  });

  it("chỉ được huỷ, sửa trong đợt khớp liên tục", () => {
    expect(canCancelOrModify("HOSE", "CONTINUOUS")).toBe(true);
    expect(canCancelOrModify("HOSE", "ATO")).toBe(false);
    expect(canCancelOrModify("HOSE", "ATC")).toBe(false);
    expect(canCancelOrModify("HNX", "ATO")).toBe(true);
  });
});
