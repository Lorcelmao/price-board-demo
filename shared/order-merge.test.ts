import { describe, expect, it } from "vitest";
import { emptyOrderBook, mergeFill, mergeOrder, type Fill, type Order } from "./order-merge";

const order: Order = {
  id: "A",
  symbol: "FPT",
  exchange: "HOSE",
  side: "BUY",
  type: "LO",
  price: 52_000,
  quantity: 1_000,
  filledQty: 0,
  avgFillPrice: 0,
  status: "New",
  version: 1,
  createdAt: 1,
  updatedAt: 1,
};

const fill = (id: string, quantity: number, price: number, time: number): Fill => ({
  id,
  orderId: "A",
  symbol: "FPT",
  side: "BUY",
  price,
  quantity,
  time,
});

describe("merge bản khớp vào lệnh", () => {
  it("cộng dồn khối lượng và tính giá khớp trung bình", () => {
    let state = mergeOrder(emptyOrderBook, order);
    state = mergeFill(state, fill("f1", 300, 52_000, 10));
    expect(state.orders.A.status).toBe("PartiallyFilled");
    state = mergeFill(state, fill("f2", 700, 51_900, 20));
    expect(state.orders.A.status).toBe("Filled");
    expect(state.orders.A.filledQty).toBe(1_000);
    expect(state.orders.A.avgFillPrice).toBe(51_930);
  });

  it("nhận trùng một bản khớp thì không cộng hai lần", () => {
    let state = mergeOrder(emptyOrderBook, order);
    state = mergeFill(state, fill("f1", 300, 52_000, 10));
    const again = mergeFill(state, fill("f1", 300, 52_000, 10));
    expect(again).toBe(state);
    expect(again.orders.A.filledQty).toBe(300);
  });

  it("bản khớp đến trước tin lệnh vẫn không bị mất", () => {
    let state = mergeFill(emptyOrderBook, fill("f1", 300, 52_000, 10));
    state = mergeOrder(state, order);
    expect(state.orders.A.filledQty).toBe(300);
    expect(state.orders.A.status).toBe("PartiallyFilled");
  });
});

describe("merge trạng thái lệnh", () => {
  it("tin cũ đến muộn không làm trạng thái đi lùi", () => {
    const filled = { ...order, status: "Filled" as const, filledQty: 1_000, version: 3 };
    const state = mergeOrder(mergeOrder(emptyOrderBook, filled), { ...order, version: 2 });
    expect(state.orders.A.status).toBe("Filled");
  });

  it("lệnh đã huỷ một phần vẫn giữ trạng thái đã huỷ", () => {
    let state = mergeOrder(emptyOrderBook, order);
    state = mergeFill(state, fill("f1", 300, 52_000, 10));
    state = mergeOrder(state, { ...order, status: "Cancelled", filledQty: 300, avgFillPrice: 52_000, version: 3 });
    expect(state.orders.A.status).toBe("Cancelled");
    expect(state.orders.A.filledQty).toBe(300);
  });

  it("server báo đã khớp nhiều hơn số bản khớp đang có thì tin server", () => {
    const state = mergeOrder(emptyOrderBook, { ...order, status: "PartiallyFilled", filledQty: 500, avgFillPrice: 52_000, version: 2 });
    expect(state.orders.A.filledQty).toBe(500);
    expect(state.orders.A.status).toBe("PartiallyFilled");
  });
});
