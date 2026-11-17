// Người dùng gõ giá theo nghìn đồng như trên bảng giá ("52.7"). Bên trong luôn dùng đồng (52700).
export function parsePriceInput(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return Number.NaN;
  // Làm tròn vì số thực có sai số: 2.01 * 1000 trong JavaScript ra 2009.9999999999998.
  return Math.round(value * 1000);
}

// Chấp nhận cả dạng có dấu phẩy ngăn cách ("1,000").
export function parseQuantityInput(text: string): number {
  const trimmed = text.trim().replace(/,/g, "");
  return trimmed === "" ? 0 : Number(trimmed);
}
