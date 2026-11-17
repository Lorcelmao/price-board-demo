// Bảng giá ghi giá theo nghìn đồng và khối lượng theo đơn vị 100 cổ phiếu: 52.70 là 52,700 đồng, 1,545 là 154,500 cổ phiếu.
// Ở đây dữ liệu gốc luôn là đồng và cổ phiếu, chỉ khi hiển thị mới đổi đơn vị.

export const formatPrice = (price: number | null | undefined): string =>
  price === null || price === undefined || price === 0 ? "" : (price / 1000).toFixed(2);

export const formatInteger = (value: number): string => Math.round(value).toLocaleString("en-US");

export const formatVolume = (volume: number): string => (volume === 0 ? "" : formatInteger(volume));

export const formatSigned = (value: number, digits = 2): string =>
  `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;

export const formatPct = (value: number): string => `${formatSigned(value)}%`;

export const formatMoney = (value: number): string => formatInteger(value);

export const formatTime = (time: number): string => new Date(time).toLocaleTimeString("vi-VN", { hour12: false });

export const formatDateTime = (time: number): string =>
  new Date(time).toLocaleString("vi-VN", { hour12: false, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Màu theo quy ước bảng giá Việt Nam: tím trần, xanh dương sàn, vàng tham chiếu, xanh lá tăng, đỏ giảm.
export function priceClass(price: number | null | undefined, ref: number, ceil: number, floor: number): string {
  if (price === null || price === undefined || price === 0 || ref === 0) return "";
  if (price >= ceil) return "px-ceil";
  if (price <= floor) return "px-floor";
  if (price === ref) return "px-ref";
  return price > ref ? "px-up" : "px-down";
}

export const profitClass = (value: number): string => (value > 0 ? "px-up" : value < 0 ? "px-down" : "px-ref");
