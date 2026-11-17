import { describe, expect, it } from "vitest";
import { emptyQuote } from "../../shared/protocol";
import type { BoardQuote } from "./quote-store-core";
import { contextFor, draftFromCell, type CellKind } from "./order-draft";

const quote = (patch: Partial<BoardQuote> = {}): BoardQuote => ({
  ...emptyQuote(patch.symbol ?? "FPT"),
  exchange: "HOSE",
  ref: 50_000,
  ceil: 53_500,
  floor: 46_500,
  last: 50_500,
  avgPrice: 50_200,
  bids: [[50_400, 1000], [50_300, 2000], [50_200, 3000]],
  asks: [[50_500, 1100], [50_600, 2100], [50_700, 3100]],
  ...patch,
});

describe("draftFromCell: chiều và giá theo ô bấm", () => {
  it("bấm Giá 1 dư bán mở Mua đúng giá đó", () => {
    const draft = draftFromCell({ kind: "ask", level: 0 }, quote());
    expect(draft).toEqual({ side: "BUY", type: "LO", price: 50_500, quantity: 100 });
  });

  it("bấm Giá 3 dư bán mở Mua đúng mức 3", () => {
    expect(draftFromCell({ kind: "ask", level: 2 }, quote())?.price).toBe(50_700);
  });

  it("bấm Giá 3 dư mua mở Bán đúng giá đó", () => {
    const draft = draftFromCell({ kind: "bid", level: 2 }, quote());
    expect(draft).toEqual({ side: "SELL", type: "LO", price: 50_200, quantity: 100 });
  });

  it("bấm Giá 1 dư mua mở Bán đúng giá đó", () => {
    expect(draftFromCell({ kind: "bid", level: 0 }, quote())?.price).toBe(50_400);
  });

  it("bấm Mã CK mở Mua theo giá khớp", () => {
    const draft = draftFromCell({ kind: "symbol" }, quote());
    expect(draft).toEqual({ side: "BUY", type: "LO", price: 50_500, quantity: 100 });
  });

  it("bấm Giá khớp mở Mua theo giá khớp", () => {
    expect(draftFromCell({ kind: "last" }, quote())?.price).toBe(50_500);
  });

  it("chưa có giá khớp thì Mã CK lấy TC", () => {
    expect(draftFromCell({ kind: "symbol" }, quote({ last: null }))?.price).toBe(50_000);
  });

  it("chưa có giá khớp thì Giá khớp lấy TC", () => {
    expect(draftFromCell({ kind: "last" }, quote({ last: null }))?.price).toBe(50_000);
  });

  it("ô giá trống thì không mở form", () => {
    const noBook = quote({ bids: [], asks: [] });
    expect(draftFromCell({ kind: "bid", level: 0 }, noBook)).toBeNull();
    expect(draftFromCell({ kind: "ask", level: 1 }, noBook)).toBeNull();
    expect(draftFromCell({ kind: "ask", level: 0 }, quote({ asks: [[50_500, 1000]] }))).not.toBeNull();
    expect(draftFromCell({ kind: "ask", level: 2 }, quote({ asks: [[50_500, 1000]] }))).toBeNull();
  });

  it("Mã CK và Giá khớp mà chưa có cả giá khớp lẫn TC thì không mở", () => {
    expect(draftFromCell({ kind: "symbol" }, quote({ last: null, ref: 0 }))).toBeNull();
    expect(draftFromCell({ kind: "last" }, quote({ last: null, ref: 0 }))).toBeNull();
  });

  it("Mã CK chưa có giá khớp thì dùng giá dự khớp nếu đang trong phiên ATO/ATC", () => {
    expect(draftFromCell({ kind: "symbol" }, quote({ last: null, expectedPrice: 51_000 }))?.price).toBe(51_000);
  });

  it("loại ô lạ không mở form", () => {
    expect(draftFromCell({ kind: "quantity" } as unknown as CellKind, quote())).toBeNull();
  });
});

describe("contextFor: ctx cho validateOrder", () => {
  it("sức mua và cổ phiếu khả dụng là vô cực", () => {
    const ctx = contextFor(quote(), "CONTINUOUS");
    expect(ctx.buyingPower).toBe(Number.POSITIVE_INFINITY);
    expect(ctx.sellableQty).toBe(Number.POSITIVE_INFINITY);
  });

  it("phí 0.0015, không phải nhà đầu tư nước ngoài, room 0", () => {
    const ctx = contextFor(quote(), "CONTINUOUS");
    expect(ctx.feeRate).toBe(0.0015);
    expect(ctx.isForeign).toBe(false);
    expect(ctx.foreignRoom).toBe(0);
  });

  it("lấy trần, sàn, sàn giao dịch và đợt từ tham số", () => {
    const ctx = contextFor(quote(), "ATC");
    expect(ctx.exchange).toBe("HOSE");
    expect(ctx.ceil).toBe(53_500);
    expect(ctx.floor).toBe(46_500);
    expect(ctx.phase).toBe("ATC");
  });

  it("đổi sàn theo mã", () => {
    expect(contextFor(quote({ exchange: "HNX" }), "CONTINUOUS").exchange).toBe("HNX");
  });

  it("có tài khoản thì dùng sức mua và cổ phiếu khả dụng thật", () => {
    const ctx = contextFor(quote(), "CONTINUOUS", {
      account: {
        accountNo: "DEMO000001", isForeign: false, feeRate: 0.0015, sellTaxRate: 0.001,
        cash: 200_000_000, holdFunds: 0, availableCash: 200_000_000,
        receivableT0: 0, receivableT1: 0, debt: 0, creditLimit: 100_000_000,
        buyingPower: 250_000_000,
      },
      positions: [{
        symbol: "FPT", exchange: "HOSE", totalQty: 1_200, availableQty: 1_000,
        holdQty: 0, pendingT0: 100, pendingT1: 100, avgCost: 49_800,
      }],
    });
    expect(ctx.buyingPower).toBe(250_000_000);
    expect(ctx.sellableQty).toBe(1_000);
    expect(ctx.feeRate).toBe(0.0015);
  });

  it("mã không có trong danh mục thì cổ phiếu khả dụng là 0", () => {
    const ctx = contextFor(quote({ symbol: "ACB" }), "CONTINUOUS", {
      account: {
        accountNo: "DEMO000001", isForeign: false, feeRate: 0.0015, sellTaxRate: 0.001,
        cash: 0, holdFunds: 0, availableCash: 0, receivableT0: 0, receivableT1: 0,
        debt: 0, creditLimit: 0, buyingPower: 0,
      },
      positions: [],
    });
    expect(ctx.sellableQty).toBe(0);
  });

  it("room lấy từ quote, isForeign lấy từ tài khoản", () => {
    const ctx = contextFor(quote({ room: 12_345 }), "CONTINUOUS", {
      account: {
        accountNo: "DEMO000001", isForeign: true, feeRate: 0.0015, sellTaxRate: 0.001,
        cash: 0, holdFunds: 0, availableCash: 0, receivableT0: 0, receivableT1: 0,
        debt: 0, creditLimit: 0, buyingPower: 0,
      },
      positions: [],
    });
    expect(ctx.foreignRoom).toBe(12_345);
    expect(ctx.isForeign).toBe(true);
  });
});
