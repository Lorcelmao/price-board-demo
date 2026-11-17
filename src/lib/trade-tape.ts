// Danh sách các lần khớp gần nhất của mã đang mở trong popup (tab "Khớp lệnh").
// Mock không gửi tin từng lần khớp riêng, nên suy ra từ quote: Tổng KL tăng bao nhiêu
// thì có một lần khớp bấy nhiêu cổ phiếu, ở giá khớp mới nhất. Hàm thuần.

export interface Trade {
  time: number;
  price: number;
  volume: number;
}

export const TAPE_LIMIT = 50;

interface TapeQuote {
  last: number | null;
  totalVolume: number;
}

// Lần khớp mới nhất ở đầu danh sách. Tổng KL giảm (sang phiên mới, kết nối lại) thì không tính.
export function nextTape(tape: Trade[], previous: TapeQuote | null, quote: TapeQuote, now: number): Trade[] {
  if (!previous || quote.last === null) return tape;
  const volume = quote.totalVolume - previous.totalVolume;
  if (volume <= 0) return tape;
  return [{ time: now, price: quote.last, volume }, ...tape].slice(0, TAPE_LIMIT);
}

// Gộp khối lượng theo giờ (08h đến 16h) cho biểu đồ cột nhỏ ở tab "Khớp lệnh".
export function volumeByHour(buckets: Array<{ minute: string; volume: number }>): Array<{ hour: number; volume: number }> {
  const hours = Array.from({ length: 9 }, (_, index) => ({ hour: 8 + index, volume: 0 }));
  for (const { minute, volume } of buckets) {
    const hour = Number(minute.slice(0, 2));
    const slot = hours[hour - 8];
    if (slot) slot.volume += volume;
  }
  return hours;
}
