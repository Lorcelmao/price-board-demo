export interface PositionMetrics {
  costValue: number;
  marketValue: number;
  profitLoss: number;
  profitLossPct: number;
}

// Mua thêm thì giá vốn là trung bình có trọng số. Bán bớt không đổi giá vốn.
export function averageCostAfterBuy(
  heldQty: number,
  avgCost: number,
  boughtQty: number,
  boughtPrice: number,
): number {
  const total = heldQty + boughtQty;
  return total === 0 ? 0 : Math.round((heldQty * avgCost + boughtQty * boughtPrice) / total);
}

export function positionMetrics(quantity: number, avgCost: number, marketPrice: number): PositionMetrics {
  const costValue = quantity * avgCost;
  const marketValue = quantity * marketPrice;
  const profitLoss = marketValue - costValue;
  const profitLossPct = costValue === 0 ? 0 : (profitLoss / costValue) * 100;
  return { costValue, marketValue, profitLoss, profitLossPct };
}

export function weightPct(value: number, total: number): number {
  return total === 0 ? 0 : (value / total) * 100;
}

export interface AssetInputs {
  cash: number;
  receivableT0: number;
  receivableT1: number;
  stockValue: number;
  debt: number;
}

export interface AssetSummary extends AssetInputs {
  receivable: number;
  totalAsset: number;
  nav: number;
  // NAV trên giá trị cổ phiếu. Không giữ cổ phiếu thì không có khái niệm ký quỹ.
  marginRatioPct: number | null;
}

export function summarizeAssets(inputs: AssetInputs): AssetSummary {
  const receivable = inputs.receivableT0 + inputs.receivableT1;
  const totalAsset = inputs.cash + receivable + inputs.stockValue;
  const nav = totalAsset - inputs.debt;
  const marginRatioPct = inputs.stockValue === 0 ? null : (nav / inputs.stockValue) * 100;
  return { ...inputs, receivable, totalAsset, nav, marginRatioPct };
}
