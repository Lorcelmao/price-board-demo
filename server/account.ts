import { averageCostAfterBuy } from "../shared/portfolio-math";
import type { AccountDto, CashEntry, CorporateAction } from "../shared/protocol";
import type { Fill } from "../shared/order-merge";

// Giả định cho bản demo: phí thật tuỳ từng công ty chứng khoán. Thuế bán 0.1% theo quy định hiện hành.
const FEE_RATE = 0.0015;
const SELL_TAX_RATE = 0.001;
const DAY = 86_400_000;
const money = (value: number) => value.toLocaleString("en-US");

export interface Holding {
  symbol: string;
  available: number;
  pendingT0: number;
  pendingT1: number;
  avgCost: number;
}

let entrySeq = 0;
const entryId = () => `cash-${++entrySeq}`;

export class Account {
  readonly accountNo = "DEMO000001";
  isForeign = false;
  cash = 200_000_000;
  debt = 0;
  creditLimit = 100_000_000;
  // Tiền bán chờ về: khớp hôm nay là T0, sang ngày là T1, đến T2 thì đã vào tiền mặt nên không còn ô chờ.
  receivableT0 = 0;
  receivableT1 = 4_506_705;
  readonly holdings = new Map<string, Holding>();
  readonly cashHistory: CashEntry[] = [];

  constructor() {
    const seed: Array<[string, number, number, number]> = [
      ["FPT", 1_000, 100, 49_800],
      ["HPG", 3_000, 0, 23_150],
      ["VCB", 500, 0, 58_200],
      ["SSI", 1_200, 200, 35_400],
      ["MWG", 300, 0, 64_500],
    ];
    for (const [symbol, available, pendingT1, avgCost] of seed) {
      this.holdings.set(symbol, { symbol, available, pendingT0: 0, pendingT1, avgCost });
    }
    const now = Date.now();
    this.addEntry("DEPOSIT", 300_000_000, "Nộp tiền vào tài khoản", now - 12 * DAY);
    this.addEntry("WITHDRAW", -20_000_000, "Rút tiền về ngân hàng", now - 6 * DAY);
    this.addEntry("DIVIDEND", 1_200_000, "Cổ tức tiền mặt VCB", now - 3 * DAY);
    this.addEntry("SELL", 4_518_000, "Bán 100 ACB, tiền chờ về", now - DAY);
    this.addEntry("FEE", -6_777, "Phí bán 0.15%", now - DAY);
    this.addEntry("TAX", -4_518, "Thuế bán 0.1%", now - DAY);
  }

  get feeRate(): number {
    return FEE_RATE;
  }

  holding(symbol: string): Holding {
    let holding = this.holdings.get(symbol);
    if (!holding) {
      holding = { symbol, available: 0, pendingT0: 0, pendingT1: 0, avgCost: 0 };
      this.holdings.set(symbol, holding);
    }
    return holding;
  }

  buyingPower(holdFunds: number): number {
    return Math.max(0, this.cash + Math.max(0, this.creditLimit - this.debt) - holdFunds);
  }

  // Bài tập trừ tiền ngay khi khớp cho dễ theo dõi. Thực tế tiền mua được thanh toán vào T+2.
  settleBuyFill(fill: Fill): void {
    const value = fill.price * fill.quantity;
    const fee = Math.round(value * FEE_RATE);
    const pay = value + fee;
    const fromCash = Math.min(this.cash, pay);
    this.cash -= fromCash;
    this.debt += pay - fromCash;
    const holding = this.holding(fill.symbol);
    const heldQty = holding.available + holding.pendingT0 + holding.pendingT1;
    holding.avgCost = averageCostAfterBuy(heldQty, holding.avgCost, fill.quantity, fill.price);
    holding.pendingT0 += fill.quantity;
    this.addEntry("BUY", -value, `Mua ${fill.quantity} ${fill.symbol} giá ${fill.price}`, fill.time);
    this.addEntry("FEE", -fee, `Phí mua ${fill.symbol} 0.15%`, fill.time);
  }

  settleSellFill(fill: Fill): void {
    const value = fill.price * fill.quantity;
    const fee = Math.round(value * FEE_RATE);
    const tax = Math.round(value * SELL_TAX_RATE);
    this.holding(fill.symbol).available -= fill.quantity;
    this.receivableT0 += value - fee - tax;
    this.addEntry("SELL", value, `Bán ${fill.quantity} ${fill.symbol} giá ${fill.price}, tiền về T+2`, fill.time);
    this.addEntry("FEE", -fee, `Phí bán ${fill.symbol} 0.15%`, fill.time);
    this.addEntry("TAX", -tax, `Thuế bán ${fill.symbol} 0.1%`, fill.time);
  }

  // Sang ngày giao dịch mới: T0 thành T1. T1 thành T2, tức đến hạn, nên vào hẳn tiền mặt và cổ phiếu khả dụng.
  advanceDay(): void {
    this.settleCash(this.receivableT1);
    this.receivableT1 = this.receivableT0;
    this.receivableT0 = 0;
    for (const holding of this.holdings.values()) {
      holding.available += holding.pendingT1;
      holding.pendingT1 = holding.pendingT0;
      holding.pendingT0 = 0;
    }
  }

  toDto(holdFunds: number): AccountDto {
    return {
      accountNo: this.accountNo,
      isForeign: this.isForeign,
      feeRate: FEE_RATE,
      sellTaxRate: SELL_TAX_RATE,
      cash: this.cash,
      holdFunds,
      availableCash: Math.max(0, this.cash - holdFunds),
      receivableT0: this.receivableT0,
      receivableT1: this.receivableT1,
      debt: this.debt,
      creditLimit: this.creditLimit,
      buyingPower: this.buyingPower(holdFunds),
    };
  }

  corporateActions(): CorporateAction[] {
    return [
      {
        id: "ca-1",
        symbol: "VCB",
        type: "CASH_DIVIDEND",
        description: "Cổ tức tiền mặt 12%, tức 1,200 đồng mỗi cổ phiếu",
        exDate: "2026-11-12",
        payDate: "2026-12-05",
        entitlement: `${money(this.totalQty("VCB"))} cp × 1,200 = ${money(this.totalQty("VCB") * 1_200)} đồng`,
      },
      {
        id: "ca-2",
        symbol: "FPT",
        type: "BONUS_SHARES",
        description: "Cổ phiếu thưởng tỷ lệ 20:3",
        exDate: "2026-11-18",
        payDate: "2026-12-20",
        entitlement: `${money(this.totalQty("FPT"))} cp × 3/20 = ${money(Math.floor((this.totalQty("FPT") * 3) / 20))} cổ phiếu`,
      },
      {
        id: "ca-3",
        symbol: "SSI",
        type: "RIGHTS",
        description: "Quyền mua cổ phiếu tỷ lệ 5:1, giá 15,000 đồng",
        exDate: "2026-11-25",
        payDate: "2026-12-15",
        entitlement: `${money(this.totalQty("SSI"))} cp × 1/5 = ${money(Math.floor(this.totalQty("SSI") / 5))} quyền mua`,
      },
    ];
  }

  private totalQty(symbol: string): number {
    const { available, pendingT0, pendingT1 } = this.holding(symbol);
    return available + pendingT0 + pendingT1;
  }

  private settleCash(amount: number): void {
    const toDebt = Math.min(this.debt, amount);
    this.debt -= toDebt;
    this.cash += amount - toDebt;
  }

  private addEntry(type: CashEntry["type"], amount: number, note: string, time: number): void {
    this.cashHistory.unshift({ id: entryId(), time, type, amount, note });
  }
}
