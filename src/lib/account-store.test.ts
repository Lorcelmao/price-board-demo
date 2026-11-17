import { describe, expect, it } from "vitest";
import type { Fill, Order } from "../../shared/order-merge";
import { applyAccountMessage, createAccountState, mergeOrderList } from "./account-store";

const order = (patch: Partial<Order> = {}): Order => ({
  id: "ORD-1",
  symbol: "FPT",
  exchange: "HOSE",
  side: "BUY",
  type: "LO",
  price: 52_700,
  quantity: 1_000,
  filledQty: 0,
  avgFillPrice: 0,
  status: "New",
  version: 1,
  createdAt: 1,
  updatedAt: 1,
  ...patch,
});

const fill = (patch: Partial<Fill> = {}): Fill => ({
  id: "FILL-1",
  orderId: "ORD-1",
  symbol: "FPT",
  side: "BUY",
  price: 52_700,
  quantity: 300,
  time: 100,
  ...patch,
});

describe("applyAccountMessage: tin lệnh", () => {
  it("thêm lệnh mới vào sổ", () => {
    const state = applyAccountMessage(createAccountState(), { topic: "ACCOUNT|ORDER", order: order() });
    expect(state.book.orders["ORD-1"].quantity).toBe(1_000);
  });

  it("tin cũ (version nhỏ hơn) không ghi đè", () => {
    let state = applyAccountMessage(createAccountState(), {
      topic: "ACCOUNT|ORDER",
      order: order({ version: 3, filledQty: 500, status: "PartiallyFilled" }),
    });
    state = applyAccountMessage(state, { topic: "ACCOUNT|ORDER", order: order({ version: 2, filledQty: 0, status: "New" }) });
    expect(state.book.orders["ORD-1"].version).toBe(3);
    expect(state.book.orders["ORD-1"].filledQty).toBe(500);
  });
});

describe("applyAccountMessage: tin khớp", () => {
  it("cùng một bản khớp đến hai lần chỉ tính một lần", () => {
    let state = applyAccountMessage(createAccountState(), { topic: "ACCOUNT|ORDER", order: order() });
    state = applyAccountMessage(state, { topic: "ACCOUNT|FILL", fill: fill() });
    const afterFirst = state.book.orders["ORD-1"].filledQty;
    state = applyAccountMessage(state, { topic: "ACCOUNT|FILL", fill: fill() });
    expect(state.book.orders["ORD-1"].filledQty).toBe(afterFirst);
    expect(state.book.fills["ORD-1"]).toHaveLength(1);
  });

  it("bản khớp đến trước tin lệnh vẫn ra đúng KL khớp và giá khớp TB", () => {
    let state = applyAccountMessage(createAccountState(), { topic: "ACCOUNT|FILL", fill: fill() });
    state = applyAccountMessage(state, { topic: "ACCOUNT|ORDER", order: order() });
    const merged = state.book.orders["ORD-1"];
    expect(merged.filledQty).toBe(300);
    expect(merged.avgFillPrice).toBe(52_700);
    expect(merged.status).toBe("PartiallyFilled");
  });

  it("giá khớp trung bình tính trên nhiều bản khớp", () => {
    let state = applyAccountMessage(createAccountState(), { topic: "ACCOUNT|ORDER", order: order() });
    state = applyAccountMessage(state, { topic: "ACCOUNT|FILL", fill: fill({ id: "F1", quantity: 100, price: 50_000, time: 1 }) });
    state = applyAccountMessage(state, { topic: "ACCOUNT|FILL", fill: fill({ id: "F2", quantity: 300, price: 54_000, time: 2 }) });
    const merged = state.book.orders["ORD-1"];
    expect(merged.filledQty).toBe(400);
    expect(merged.avgFillPrice).toBeCloseTo((50_000 * 100 + 54_000 * 300) / 400, 6);
  });

  it("ghi lại lệnh vừa có khớp để sổ lệnh nháy dòng", () => {
    const state = applyAccountMessage(createAccountState(), { topic: "ACCOUNT|FILL", fill: fill() });
    expect(state.recentFillOrderId?.id).toBe("ORD-1");
    expect(typeof state.recentFillOrderId?.at).toBe("number");
  });

  it("khớp đủ khối lượng thì lệnh thành Filled", () => {
    let state = applyAccountMessage(createAccountState(), { topic: "ACCOUNT|ORDER", order: order({ quantity: 300 }) });
    state = applyAccountMessage(state, { topic: "ACCOUNT|FILL", fill: fill({ quantity: 300 }) });
    expect(state.book.orders["ORD-1"].status).toBe("Filled");
  });
});

describe("applyAccountMessage: tin khác", () => {
  it("tin lạ không đổi sổ", () => {
    const before = createAccountState();
    const after = applyAccountMessage(before, { topic: "SESSION", phase: "ATO" } as never);
    expect(after).toBe(before);
  });

  it("ACCOUNT|BALANCE đánh dấu cần tải lại số dư", () => {
    const state = applyAccountMessage(createAccountState(), { topic: "ACCOUNT|BALANCE" });
    expect(state.balanceDirty).toBe(true);
  });
});

describe("mergeOrderList: tải lại từ REST", () => {
  it("gộp danh sách lệnh và bản khớp, khử trùng bản khớp", () => {
    const state = mergeOrderList(createAccountState(), [order({ filledQty: 300, status: "PartiallyFilled" })], [fill()]);
    expect(state.book.orders["ORD-1"].filledQty).toBe(300);
    expect(state.book.fills["ORD-1"]).toHaveLength(1);
  });

  it("tải lại hai lần không làm trùng bản khớp", () => {
    const first = mergeOrderList(createAccountState(), [order()], [fill()]);
    const second = mergeOrderList(first, [order()], [fill()]);
    expect(second.book.fills["ORD-1"]).toHaveLength(1);
    expect(second.book.orders["ORD-1"].filledQty).toBe(300);
  });
});
