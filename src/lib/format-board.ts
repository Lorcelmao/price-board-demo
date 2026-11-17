// Định dạng số kiểu bảng giá chứng khoán.
// Dữ liệu gốc luôn là đồng và cổ phiếu; chỉ đổi đơn vị khi hiển thị.

// Khối lượng theo cách bảng giá thường hiển thị ("Khối lượng x100CP"):
// đổi cổ phiếu sang lô 100 cổ phiếu, rồi đặt dấu phẩy trước chữ số cuối, phần trước nhóm theo hàng nghìn.
// Dưới 10 lô thì hiện nguyên số. 0 thì để trống ô.
// Ví dụ: 128.900 cổ phiếu = 1.289 lô, hiện "128,9"; 1.311.900 cổ phiếu hiện "1,311,9"; 400 cổ phiếu hiện "4".
export function formatVolumeBoard(volume: number): string {
  if (!volume) return "";
  const lots = Math.round(volume / 100);
  if (lots < 10) return String(lots);
  const head = String(Math.floor(lots / 10)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${head},${lots % 10}`;
}

// +/-: đồng ÷ 1000, hai chữ số thập phân, có dấu + khi dương.
export function formatChange(change: number): string {
  const fixed = (change / 1000).toFixed(2);
  return change > 0 ? `+${fixed}` : fixed;
}

// %: hai chữ số thập phân kèm dấu %. Dấu trừ do chính số âm mang.
export function formatPercent(percent: number): string {
  return `${percent.toFixed(2)}%`;
}
