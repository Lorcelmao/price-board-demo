import type { IntradayCandle, TradeTick } from "../../shared/feed";

// Đổi các dòng HIST_RES của /market thành kiểu dùng chung của gateway.
// Hàm thuần: không mở kết nối, không ném lỗi; dòng hỏng thì trả null và bị bỏ qua.
// Cách gọi đã thử thật: xem plans/reports/research-261117-1559-yuanta-candle-history.md.

type Raw = Record<string, unknown>;

const num = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

// Yuanta dùng hai kiểu giờ: "09:16:00" và "144500006" (HHmmssSSS).
const clockOf = (value: unknown, withSeconds: boolean): string | null => {
  const valid = (hours: number, minutes: number, seconds: number) =>
    hours <= 23 && minutes <= 59 && seconds <= 59;
  if (typeof value === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(value)) {
    const parts = value.split(":").map(Number);
    if (!valid(parts[0], parts[1], parts[2] ?? 0)) return null;
    if (!withSeconds) return value.slice(0, 5);
    return value.length === 5 ? `${value}:00` : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const digits = String(value).padStart(6, "0");
    if (!/^\d{6}/.test(digits)) return null;
    const hours = Number(digits.slice(0, 2));
    const minutes = Number(digits.slice(2, 4));
    const seconds = Number(digits.slice(4, 6));
    if (!valid(hours, minutes, seconds)) return null;
    const clock = `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4, 6)}`;
    return withSeconds ? clock : clock.slice(0, 5);
  }
  return null;
};

// Một nến 1 phút: { S, O, H, L, C, V, TV, T }.
export function toIntradayCandle(row: unknown): IntradayCandle | null {
  const data = (row as { data?: Raw } | null)?.data;
  if (!data || typeof data !== "object") return null;
  const time = clockOf(data.T, false);
  const open = num(data.O);
  const high = num(data.H);
  const low = num(data.L);
  const close = num(data.C);
  if (!time || open === undefined || high === undefined || low === undefined || close === undefined) return null;
  // Giá 0 nghĩa là dòng không có giao dịch thật, không dựng nến từ đó.
  if (open <= 0 || high <= 0 || low <= 0 || close <= 0) return null;
  return { time, open, high, low, close, volume: num(data.V) ?? num(data.TV) ?? 0 };
}

export function toIntradayCandles(rows: unknown): IntradayCandle[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map(toIntradayCandle)
    .filter((candle): candle is IntradayCandle => candle !== null)
    .sort((left, right) => left.time.localeCompare(right.time));
}

// Một lệnh khớp: { seq, data: { t270 giá, t271 KL, t54 "B"|"S", t60 giờ } }.
export function toTradeTick(row: unknown): TradeTick | null {
  const raw = row as { seq?: unknown; data?: Raw } | null;
  const data = raw?.data;
  if (!data || typeof data !== "object") return null;
  const seq = num(raw?.seq);
  const price = num(data.t270);
  const volume = num(data.t271);
  const time = clockOf(data.t60, true);
  if (seq === undefined || price === undefined || volume === undefined || !time) return null;
  // Lệnh khớp thật phải có giá và khối lượng dương.
  if (price <= 0 || volume <= 0) return null;
  const side = data.t54 === "B" ? "BUY" : data.t54 === "S" ? "SELL" : null;
  return { time, price, volume, side, seq };
}

// Lệnh khớp mới nhất trước, đúng hợp đồng FeedHistory.trades.
export function toTradeTicks(rows: unknown): TradeTick[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map(toTradeTick)
    .filter((tick): tick is TradeTick => tick !== null)
    .sort((left, right) => right.seq - left.seq);
}
