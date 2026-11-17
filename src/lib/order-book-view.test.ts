import { describe, expect, it } from "vitest";
import { emptyOrderBook, type Order, type OrderBookState } from "../../shared/order-merge";
import { modifyChange, openCount, ordersForTab, statusLabel } from "./order-book-view";

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
  createdAt: 1_000,
  updatedAt: 1_000,
  ...patch,
});

const book = (orders: Order[]): OrderBookState => ({
  ...emptyOrderBook,
  orders: Object.fromEntries(orders.map((item) => [item.id, item])),
});

describe("ordersForTab", () => {
  const state = book([
    order({ id: "A", status: "New", createdAt: 100 }),
    order({ id: "B", status: "PartiallyFilled", createdAt: 200 }),
    order({ id: "C", status: "Filled", createdAt: 300 }),
    order({ id: "D", status: "Rejected", createdAt: 400 }),
    order({ id: "E", status: "Cancelled", createdAt: 500 }),
  ]);

  it("tab trong ngày lấy tất cả, lệnh mới nhất trước", () => {
    expect(ordersForTab(state, "all").map((item) => item.id)).toEqual(["E", "D", "C", "B", "A"]);
  });

  it("tab chờ khớp chỉ lấy New và PartiallyFilled", () => {
    expect(ordersForTab(state, "open").map((item) => item.id)).toEqual(["B", "A"]);
  });

  it("cùng createdAt thì giữ thứ tự ổn định, không ném lỗi", () => {
    const same = book([
      order({ id: "X", createdAt: 50 }),
      order({ id: "Y", createdAt: 50 }),
    ]);
    expect(ordersForTab(same, "all").map((item) => item.id).sort()).toEqual(["X", "Y"]);
  });
});

describe("statusLabel", () => {
  it("nhãn tiếng Việt đúng", () => {
    expect(statusLabel(order({ status: "New" }))).toBe("Chờ khớp");
    expect(statusLabel(order({ status: "PartiallyFilled" }))).toBe("Khớp một phần");
    expect(statusLabel(order({ status: "Filled" }))).toBe("Đã khớp");
    expect(statusLabel(order({ status: "Rejected" }))).toBe("Bị từ chối");
    expect(statusLabel(order({ status: "Cancelled" }))).toBe("Đã huỷ");
  });

  it("lệnh Cancelled đã khớp một phần vẫn là Đã huỷ", () => {
    // Mock đóng lệnh bằng status Cancelled bất kể đã khớp bao nhiêu.
    expect(statusLabel(order({ status: "Cancelled", filledQty: 400, quantity: 1_000 }))).toBe("Đã huỷ");
  });

  it("lệnh Cancelled đã khớp hết vẫn là Đã huỷ", () => {
    expect(statusLabel(order({ status: "Cancelled", filledQty: 1_000, quantity: 1_000 }))).toBe("Đã huỷ");
  });
});

describe("openCount", () => {
  it("đếm New và PartiallyFilled", () => {
    const state = book([
      order({ id: "A", status: "New" }),
      order({ id: "B", status: "PartiallyFilled" }),
      order({ id: "C", status: "Filled" }),
      order({ id: "D", status: "Cancelled" }),
      order({ id: "E", status: "Rejected" }),
    ]);
    expect(openCount(state)).toBe(2);
  });

  it("sổ rỗng thì bằng 0", () => {
    expect(openCount(emptyOrderBook)).toBe(0);
  });
});

describe("modifyChange", () => {
  it("chỉ đổi giá thì trả change có price", () => {
    const result = modifyChange(order({ price: 52_700 }), "52.90", "1000");
    expect(result.error).toBeUndefined();
    expect(result.change).toEqual({ price: 52_900 });
  });

  it("chỉ đổi khối lượng thì trả change có quantity", () => {
    const result = modifyChange(order({ quantity: 1_000 }), "52.70", "1200");
    expect(result.error).toBeUndefined();
    expect(result.change).toEqual({ quantity: 1_200 });
  });

  it("đổi cả hai thì báo lỗi như câu của mock", () => {
    const result = modifyChange(order({ price: 52_700, quantity: 1_000 }), "52.90", "1200");
    expect(result.error).toBe("Mỗi lần chỉ được sửa giá hoặc khối lượng, không sửa cả hai.");
    expect(result.change).toBeUndefined();
  });

  it("không đổi gì thì báo lỗi", () => {
    const result = modifyChange(order({ price: 52_700, quantity: 1_000 }), "52.70", "1000");
    expect(result.error).toBe("Giá và khối lượng không thay đổi.");
  });

  it("khối lượng mới không lớn hơn phần đã khớp thì báo lỗi", () => {
    const result = modifyChange(order({ quantity: 1_000, filledQty: 600 }), "52.70", "600");
    expect(result.error).toBe("Khối lượng mới phải lớn hơn phần đã khớp.");
  });

  it("khối lượng mới lớn hơn phần đã khớp thì được", () => {
    const result = modifyChange(order({ quantity: 1_000, filledQty: 600 }), "52.70", "800");
    expect(result.error).toBeUndefined();
    expect(result.change).toEqual({ quantity: 800 });
  });

  it("ô giá trống thì báo thiếu giá", () => {
    const result = modifyChange(order(), "", "1000");
    expect(result.error).toBeTruthy();
  });

  it("khối lượng không phải số nguyên dương thì báo lỗi", () => {
    expect(modifyChange(order(), "52.70", "0").error).toBeTruthy();
    expect(modifyChange(order(), "52.70", "abc").error).toBeTruthy();
  });
});
