// Chỉ báo kỹ thuật cho biểu đồ chi tiết mã. Hàm thuần, test được bằng Node.

// EMA (trung bình động hàm mũ) chu kỳ n:
//   k = 2 / (n + 1)
//   EMA đầu tiên = trung bình cộng n giá đầu (SMA), đặt tại phần tử thứ n
//   EMA hôm nay = giá hôm nay × k + EMA hôm qua × (1 − k)
// Trả về mảng cùng độ dài; n − 1 phần tử đầu là null vì chưa đủ dữ liệu.
export function ema(values: number[], period: number): Array<number | null> {
  const result: Array<number | null> = new Array(values.length).fill(null);
  if (period < 1 || values.length < period) return result;
  const k = 2 / (period + 1);
  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  result[period - 1] = current;
  for (let index = period; index < values.length; index += 1) {
    current = values[index] * k + current * (1 - k);
    result[index] = current;
  }
  return result;
}
