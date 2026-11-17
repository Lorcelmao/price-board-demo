import { beforeEach, describe, expect, it } from "vitest";
import { Account } from "./account";
import { MarketSimulator, seededRandom } from "./market-simulator";
import { OrderEngine, type EngineEvent } from "./order-engine";

let market: MarketSimulator;
let account: Account;
let engine: OrderEngine;
let events: EngineEvent[];

const lo = (symbol: string, side: "BUY" | "SELL", price: number, quantity: number) => ({
  symbol,
  side,
  type: "LO" as const,
  price,
  quantity,
});

beforeEach(() => {
  market = new MarketSimulator(seededRandom(7));
  account = new Account();
  engine = new OrderEngine(market, account);
  events = [];
  engine.onEvent((event) => events.push(event));
});

describe("đặt lệnh", () => {
  it("lệnh sai bị từ chối kèm lý do, không giữ tiền", () => {
    const { order, errors } = engine.place(lo("FPT", "BUY", 1_000_000, 100));
    expect(order.status).toBe("Rejected");
    expect(errors?.price).toContain("giá trần");
    expect(engine.holdFunds()).toBe(0);
  });

  it("server vẫn chặn lệnh dù client bỏ qua kiểm tra", () => {
    const { order } = engine.place({ symbol: "FPT", side: "SELL", type: "LO", price: 52_000, quantity: 900_000 });
    expect(order.status).toBe("Rejected");
  });

  it("mua giá cao hơn giá bán tốt nhất thì khớp ngay, và mỗi mức giá là một bản khớp", () => {
    const state = market.get("HPG")!;
    const [firstAsk] = state.asks[0];
    const [secondAsk] = state.asks[1];
    state.asks = [[firstAsk, 100], [secondAsk, 500]];
    const { order } = engine.place(lo("HPG", "BUY", secondAsk, 300));
    expect(order.status).toBe("Filled");
    const fills = engine.fills.filter((fill) => fill.orderId === order.id);
    expect(fills.map((fill) => [fill.price, fill.quantity])).toEqual([[secondAsk, 200], [firstAsk, 100]]);
  });

  it("giao dịch do chính lệnh tạo ra không khớp ngược lại lệnh đó", () => {
    const state = market.get("HPG")!;
    const [firstAsk] = state.asks[0];
    state.asks = [[firstAsk, 100]];
    const { order } = engine.place(lo("HPG", "BUY", firstAsk, 300));
    expect(order.status).toBe("PartiallyFilled");
    expect(order.filledQty).toBe(100);
  });

  it("lệnh giá thấp chờ khớp và giữ tiền, huỷ thì trả lại tiền", () => {
    const state = market.get("HPG")!;
    const price = state.bids[5][0];
    const { order } = engine.place(lo("HPG", "BUY", price, 100));
    expect(order.status).toBe("New");
    expect(engine.holdFunds()).toBeGreaterThan(0);
    const { order: cancelled } = engine.cancel(order.id);
    expect(cancelled?.status).toBe("Cancelled");
    expect(engine.holdFunds()).toBe(0);
  });

  it("lệnh chờ được khớp một phần khi giá thị trường đi qua", () => {
    const state = market.get("HPG")!;
    const price = state.bids[0][0];
    const { order } = engine.place(lo("HPG", "BUY", price, 10_000));
    market.recordTrade("HPG", price, 300, "SELL");
    const current = engine.orders.get(order.id)!;
    expect(current.status).toBe("PartiallyFilled");
    expect(current.filledQty).toBe(300);
  });

  it("bán chờ làm giảm số cổ phiếu còn bán được", () => {
    const state = market.get("FPT")!;
    const price = state.asks[5][0];
    engine.place(lo("FPT", "SELL", price, 400));
    expect(engine.contextFor(state).sellableQty).toBe(600);
  });
});

describe("sửa lệnh", () => {
  it("không được sửa cả giá và khối lượng cùng lúc", () => {
    const state = market.get("HPG")!;
    const { order } = engine.place(lo("HPG", "BUY", state.bids[5][0], 100));
    const { error } = engine.modify(order.id, { price: state.bids[6][0], quantity: 200 });
    expect(error).toContain("không sửa cả hai");
  });

  it("sửa khối lượng thì tăng version để client biết tin nào mới hơn", () => {
    const state = market.get("HPG")!;
    const { order } = engine.place(lo("HPG", "BUY", state.bids[5][0], 100));
    const { order: changed } = engine.modify(order.id, { quantity: 200 });
    expect(changed?.quantity).toBe(200);
    expect(changed?.version).toBeGreaterThan(order.version);
  });

  it("sửa giá chạm giá đối ứng thì khớp ngay", () => {
    const state = market.get("HPG")!;
    const { order } = engine.place(lo("HPG", "BUY", state.bids[5][0], 100));
    const { order: changed } = engine.modify(order.id, { price: market.get("HPG")!.asks[0][0] });
    expect(changed?.status).toBe("Filled");
  });
});

describe("loại lệnh thị trường trên HNX", () => {
  it("MOK không đủ đối ứng thì huỷ toàn bộ", () => {
    const { order } = engine.place({ symbol: "SHS", side: "BUY", type: "MOK", price: null, quantity: 5_000_000 });
    // Sức mua không đủ nên bị chặn trước. Đổi sang lệnh nhỏ nhưng xoá sổ để kiểm tra đúng nhánh MOK.
    expect(order.status).toBe("Rejected");
    const state = market.get("SHS")!;
    state.asks = [[state.asks[0][0], 100]];
    const { order: small } = engine.place({ symbol: "SHS", side: "BUY", type: "MOK", price: null, quantity: 200 });
    expect(small.status).toBe("Cancelled");
    expect(small.filledQty).toBe(0);
  });

  it("MAK khớp được bao nhiêu thì khớp, phần còn lại huỷ", () => {
    const state = market.get("SHS")!;
    state.asks = [[state.asks[0][0], 100]];
    const { order } = engine.place({ symbol: "SHS", side: "BUY", type: "MAK", price: null, quantity: 300 });
    expect(order.status).toBe("Cancelled");
    expect(order.filledQty).toBe(100);
  });

  it("MTL phần còn lại thành LO cách mức khớp cuối một bước giá", () => {
    const state = market.get("SHS")!;
    const ask = state.asks[0][0];
    state.asks = [[ask, 100]];
    const { order } = engine.place({ symbol: "SHS", side: "BUY", type: "MTL", price: null, quantity: 300 });
    expect(order.type).toBe("LO");
    expect(order.price).toBe(ask + 100);
    expect(order.filledQty).toBe(100);
    expect(order.status).toBe("PartiallyFilled");
  });
});

describe("đợt khớp định kỳ", () => {
  it("lệnh ATO chỉ khớp khi hết đợt, trong đợt không được huỷ", () => {
    engine.setPhase("ATO");
    const { order } = engine.place({ symbol: "FPT", side: "BUY", type: "ATO", price: null, quantity: 100 });
    expect(order.status).toBe("New");
    expect(engine.cancel(order.id).error).toContain("định kỳ");
    engine.setPhase("CONTINUOUS");
    const current = engine.orders.get(order.id)!;
    expect(current.status).toBe("Filled");
    expect(current.avgFillPrice).toBe(market.get("FPT")!.last);
  });

  it("đóng cửa thì lệnh còn chờ hết hiệu lực", () => {
    const state = market.get("HPG")!;
    const { order } = engine.place(lo("HPG", "BUY", state.bids[5][0], 100));
    engine.setPhase("CLOSED");
    expect(engine.orders.get(order.id)!.status).toBe("Cancelled");
  });
});

describe("thanh toán", () => {
  it("mua khớp: cổ phiếu chờ về, chưa bán được đến khi qua hai ngày", () => {
    const state = market.get("VPB")!;
    engine.place(lo("VPB", "BUY", state.asks[0][0], 100));
    const holding = account.holding("VPB");
    expect(holding.pendingT0).toBe(100);
    expect(holding.available).toBe(0);
    engine.advanceDay();
    expect(holding.pendingT1).toBe(100);
    expect(holding.available).toBe(0);
    engine.advanceDay();
    expect(holding.available).toBe(100);
  });

  it("bán khớp: tiền trừ phí, thuế và về sau hai ngày", () => {
    const state = market.get("HPG")!;
    const [price] = state.bids[0];
    const cashBefore = account.cash;
    const receivableBefore = account.receivableT1;
    engine.place(lo("HPG", "SELL", price, 100));
    const value = price * 100;
    const net = value - Math.round(value * 0.0015) - Math.round(value * 0.001);
    expect(account.receivableT0).toBe(net);
    expect(account.cash).toBe(cashBefore);
    engine.advanceDay();
    expect(account.receivableT1).toBe(net);
    expect(account.cash).toBe(cashBefore + receivableBefore);
    engine.advanceDay();
    expect(account.cash).toBe(cashBefore + receivableBefore + net);
  });

  it("mua vượt tiền mặt thì phần thiếu thành nợ margin", () => {
    account.cash = 1_000_000;
    const state = market.get("HPG")!;
    engine.place(lo("HPG", "BUY", state.asks[0][0], 100));
    expect(account.cash).toBe(0);
    expect(account.debt).toBeGreaterThan(0);
  });
});

describe("tin đẩy", () => {
  it("mỗi lần khớp đẩy bản khớp rồi đến trạng thái lệnh", () => {
    const state = market.get("HPG")!;
    engine.place(lo("HPG", "BUY", state.asks[0][0], 100));
    const kinds = events.map((event) => event.kind);
    expect(kinds.indexOf("fill")).toBeGreaterThan(-1);
    expect(kinds[kinds.indexOf("fill") + 1]).toBe("order");
  });
});
