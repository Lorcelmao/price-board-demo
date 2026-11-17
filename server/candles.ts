import { calcLimits, tickSize, type Exchange } from "../shared/market-rules";
import type { CandleDto } from "../shared/protocol";
import { seededRandom } from "./market-simulator";

// Lịch sử nến ngày GIẢ cho mock server. Sinh lùi từ giá tham chiếu hôm nay, có seed theo mã
// nên mỗi lần chạy ra cùng một chuỗi. Không phải dữ liệu thị trường thật.
//
// Luật mỗi cây nến:
// - giá đóng cửa ngày trước là giá tham chiếu ngày sau (nên cây cuối nối liền phiên hôm nay);
// - mọi giá nằm trong biên độ của ngày đó và đúng bước giá;
// - low <= min(open, close) <= max(open, close) <= high; khối lượng là bội của 100.

const DAY_MS = 24 * 60 * 60 * 1000;

const seedOf = (symbol: string) => [...symbol].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261);

export const isoDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// Làm tròn về bước giá gần nhất, rồi kẹp trong [floor, ceil].
const onTick = (price: number, exchange: Exchange, floor: number, ceil: number) => {
  const tick = tickSize(price, exchange);
  const rounded = Math.round(price / tick) * tick;
  return Math.min(ceil, Math.max(floor, rounded));
};

export interface HistoryInput {
  symbol: string;
  exchange: Exchange;
  // Giá tham chiếu hôm nay = giá đóng cửa của phiên liền trước.
  ref: number;
  today: Date;
  days: number;
}

// Các ngày giao dịch trước hôm nay (bỏ thứ Bảy, Chủ nhật), cũ nhất trước.
export function tradingDaysBefore(today: Date, days: number): string[] {
  const result: string[] = [];
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  while (result.length < days) {
    cursor = new Date(cursor.getTime() - DAY_MS);
    const weekday = cursor.getDay();
    if (weekday !== 0 && weekday !== 6) result.push(isoDate(cursor));
  }
  return result.reverse();
}

export function dailyHistory({ symbol, exchange, ref, today, days }: HistoryInput): CandleDto[] {
  const random = seededRandom(seedOf(symbol));
  const dates = tradingDaysBefore(today, days);
  const candles: CandleDto[] = new Array(days);
  // Đi lùi: biết giá đóng cửa của ngày, sinh giá tham chiếu của chính ngày đó.
  let close = ref;
  const baseVolume = 300_000 + Math.floor(random() * 30) * 100_000;

  for (let index = days - 1; index >= 0; index -= 1) {
    // Biến động ngày khoảng ±2,5%, hiếm khi chạm trần sàn.
    const change = (random() + random() + random() - 1.5) * 0.034;
    let dayRef = onTick(close / (1 + change), exchange, 1_000, Number.MAX_SAFE_INTEGER);
    let { ceil, floor } = calcLimits(dayRef, exchange);
    if (close > ceil || close < floor) {
      dayRef = close;
      ({ ceil, floor } = calcLimits(dayRef, exchange));
    }
    const open = onTick(dayRef * (1 + (random() - 0.5) * 0.02), exchange, floor, ceil);
    const bodyHigh = Math.max(open, close);
    const bodyLow = Math.min(open, close);
    const high = onTick(bodyHigh * (1 + random() * 0.015), exchange, bodyHigh, ceil);
    const low = onTick(bodyLow * (1 - random() * 0.015), exchange, floor, bodyLow);
    const volume = Math.round((baseVolume * (0.4 + random() * 1.6)) / 100) * 100;
    candles[index] = { time: dates[index], open, high, low, close, volume };
    close = dayRef;
  }
  return candles;
}

// Gộp nến ngày thành nến tuần (tuần bắt đầu thứ Hai). time của nến tuần là ngày đầu tiên có giao dịch.
export function toWeekly(daily: CandleDto[]): CandleDto[] {
  const weeks: CandleDto[] = [];
  let currentKey = "";
  for (const candle of daily) {
    const date = new Date(`${candle.time}T00:00:00`);
    const monday = new Date(date.getTime() - ((date.getDay() + 6) % 7) * DAY_MS);
    const key = isoDate(monday);
    const last = weeks.at(-1);
    if (key !== currentKey || !last) {
      weeks.push({ ...candle });
      currentKey = key;
      continue;
    }
    last.high = Math.max(last.high, candle.high);
    last.low = Math.min(last.low, candle.low);
    last.close = candle.close;
    last.volume += candle.volume;
  }
  return weeks;
}
