import { describe, expect, it } from "vitest";
import { hasErrors, holdPrice, maxBuyQuantity, orderCost, validateOrder, type OrderContext, type OrderDraft } from "./order-validation";

const context: OrderContext = {
  exchange: "HOSE",
  ceil: 56_300,
  floor: 49_050,
  phase: "CONTINUOUS",
  buyingPower: 50_000_000,
  sellableQty: 1_000,
  isForeign: false,
  foreignRoom: 0,
  feeRate: 0.0015,
};

const buy: OrderDraft = { symbol: "FPT", side: "BUY", type: "LO", price: 52_000, quantity: 100 };

describe("validateOrder", () => {
  it("lệnh đúng thì không có lỗi", () => {
    expect(hasErrors(validateOrder(buy, context))).toBe(false);
  });

  it.each([
    [{ price: 56_400 }, "price", "cao hơn giá trần"],
    [{ price: 49_000 }, "price", "thấp hơn giá sàn"],
    [{ price: 52_050 }, "price", "Sai bước giá"],
    [{ price: null }, "price", "cần nhập giá"],
    [{ quantity: 150 }, "quantity", "bội số của 100"],
    [{ quantity: 0 }, "quantity", "lớn hơn 0"],
    [{ quantity: 10.5 }, "quantity", "số nguyên"],
    [{ quantity: 600_000 }, "quantity", "tối đa 500,000"],
    [{ type: "MOK" as const, price: null }, "type", "không dùng được"],
    [{ type: "MTL" as const, price: null, quantity: 50 }, "quantity", "Lô lẻ"],
  ])("%j báo lỗi ở ô %s", (change, field, text) => {
    const errors = validateOrder({ ...buy, ...change }, context);
    expect(errors[field as keyof typeof errors]).toContain(text);
  });

  it("lô lẻ đặt bằng LO là hợp lệ", () => {
    expect(hasErrors(validateOrder({ ...buy, quantity: 25 }, context))).toBe(false);
  });

  it("thiếu sức mua, kể cả phần phí", () => {
    const exact = { ...context, buyingPower: 52_000 * 100 };
    expect(validateOrder(buy, exact).form).toContain("Không đủ sức mua");
    const enough = { ...context, buyingPower: orderCost(52_000, 100, 0.0015) };
    expect(hasErrors(validateOrder(buy, enough))).toBe(false);
  });

  it("lệnh thị trường giữ tiền theo giá trần", () => {
    expect(holdPrice({ side: "BUY", type: "MTL", price: null }, 56_300)).toBe(56_300);
    const tight = { ...context, buyingPower: 5_400_000 };
    expect(validateOrder({ ...buy, type: "MTL", price: null }, tight).form).toContain("Không đủ sức mua");
    expect(hasErrors(validateOrder(buy, tight))).toBe(false);
  });

  it("bán vượt số cổ phiếu khả dụng", () => {
    const errors = validateOrder({ ...buy, side: "SELL", quantity: 1_100 }, context);
    expect(errors.form).toContain("bán được 1,000");
  });

  it("nhà đầu tư nước ngoài bị chặn bởi room, nhà đầu tư trong nước thì không", () => {
    expect(validateOrder(buy, { ...context, isForeign: true, foreignRoom: 0 }).quantity).toContain("room");
    expect(hasErrors(validateOrder(buy, { ...context, isForeign: false, foreignRoom: 0 }))).toBe(false);
  });

  it("đóng cửa thì không đặt được lệnh nào", () => {
    expect(validateOrder(buy, { ...context, phase: "CLOSED" }).form).toContain("đóng cửa");
  });
});

describe("maxBuyQuantity", () => {
  it("làm tròn xuống bội số 100 sau khi tính phí", () => {
    // 30,000,000 / (51,900 × 1.0015) ≈ 577 cổ phiếu, làm tròn xuống 500.
    expect(maxBuyQuantity(30_000_000, 51_900, 0.0015)).toBe(500);
  });

  it("không đủ tiền thì trả về 0", () => {
    expect(maxBuyQuantity(100_000, 51_900, 0.0015)).toBe(0);
    expect(maxBuyQuantity(0, 51_900, 0.0015)).toBe(0);
  });
});
