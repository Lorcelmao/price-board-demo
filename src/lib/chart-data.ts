import type { IntradayCandle } from "../../shared/feed";
import type { CandleDto } from "../../shared/protocol";

// Dữ liệu cho biểu đồ chi tiết mã. Hàm thuần.

export type ChartType = "candle" | "hollow" | "line" | "area" | "bar";
export type Timeframe = "1D" | "1W";
export type ChartRange = "1M" | "6M" | "1Y" | "5Y" | "MAX";
export type ScaleMode = "normal" | "log" | "percent";

export interface ChartPrefs {
  type: ChartType;
  timeframe: Timeframe;
  range: ChartRange;
  ema5: boolean;
  ema20: boolean;
  volume: boolean;
  scale: ScaleMode;
}

export const DEFAULT_CHART_PREFS: ChartPrefs = {
  type: "candle",
  timeframe: "1D",
  range: "6M",
  ema5: true,
  ema20: true,
  volume: true,
  scale: "normal",
};

export const CHART_PREFS_KEY = "price-board-demo:bieu-do:v1";

// Một cây nến để vẽ: nến ngày dùng ngày "YYYY-MM-DD", nến 1 phút dùng mốc giây (UTCTimestamp).
export type ChartCandle = Omit<CandleDto, "time"> & { time: string | number };

// Nến 1 phút "HH:mm" (giờ Việt Nam) thành mốc giây của thư viện biểu đồ. Coi giờ Việt Nam như UTC
// trên một ngày cố định, để trục giờ hiện đúng giờ Việt Nam ở mọi múi giờ của máy xem.
export const minuteTime = (minute: string): number =>
  Date.UTC(2000, 0, 1, Number(minute.slice(0, 2)), Number(minute.slice(3, 5))) / 1000;

// Giờ "HH:mm" của một mốc giây do minuteTime tạo ra (nhãn thời gian ở con trỏ của nến 1 phút).
export const minuteLabel = (time: number): string => new Date(time * 1000).toISOString().slice(11, 16);

// Bảng tra vị trí cây nến theo thời gian, dùng khi rê chuột. Thời gian nến ngày là chuỗi, nến 1 phút là số,
// còn thư viện trả về đúng kiểu đã nạp; đổi cả hai về chuỗi để tra trúng với mọi kiểu.
export function candleIndex(candles: ChartCandle[]): (time: unknown) => number | undefined {
  const positions = new Map(candles.map((candle, position) => [String(candle.time), position]));
  return (time) => (time === undefined || time === null ? undefined : positions.get(String(time)));
}

export const intradayToChart = (candles: IntradayCandle[]): ChartCandle[] =>
  candles.map(({ time, open, high, low, close, volume }) => ({ time: minuteTime(time), open, high, low, close, volume }));

// Cây nến 1 phút cuối theo giá realtime: giữ open và khối lượng, mở rộng high/low, close bằng giá đang khớp.
// Khối lượng của phút đang chạy chỉ cập nhật khi tải lại lịch sử (mỗi phút).
export function liveIntradayLast(last: ChartCandle, quote: { last: number | null }): ChartCandle {
  const close = quote.last;
  if (!close) return last;
  return { ...last, high: Math.max(last.high, close), low: Math.min(last.low, close), close };
}

const MONTHS: Record<Exclude<ChartRange, "MAX">, number> = { "1M": 1, "6M": 6, "1Y": 12, "5Y": 60 };

// Đọc lựa chọn đã lưu, bỏ qua giá trị lạ để đổi phiên bản không làm hỏng biểu đồ.
export function sanitizePrefs(raw: unknown): ChartPrefs {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<ChartPrefs>;
  const pick = <T extends string>(item: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(item as T) ? (item as T) : fallback;
  const flag = (item: unknown, fallback: boolean) => (typeof item === "boolean" ? item : fallback);
  return {
    type: pick(value.type, ["candle", "hollow", "line", "area", "bar"], DEFAULT_CHART_PREFS.type),
    timeframe: pick(value.timeframe, ["1D", "1W"], DEFAULT_CHART_PREFS.timeframe),
    range: pick(value.range, ["1M", "6M", "1Y", "5Y", "MAX"], DEFAULT_CHART_PREFS.range),
    ema5: flag(value.ema5, DEFAULT_CHART_PREFS.ema5),
    ema20: flag(value.ema20, DEFAULT_CHART_PREFS.ema20),
    volume: flag(value.volume, DEFAULT_CHART_PREFS.volume),
    scale: pick(value.scale, ["normal", "log", "percent"], DEFAULT_CHART_PREFS.scale),
  };
}

// Ngày bắt đầu của khoảng xem, tính lùi từ cây cuối. "MAX" thì null (xem hết).
export function rangeStart(lastTime: string, range: ChartRange): string | null {
  if (range === "MAX") return null;
  const [year, month, day] = lastTime.split("-").map(Number);
  const start = new Date(year, month - 1 - MONTHS[range], day);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const d = String(start.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export interface LiveQuote {
  last: number | null;
  ref: number;
  open: number;
  high: number;
  low: number;
  totalVolume: number;
}

// Cập nhật cây nến cuối (phiên hôm nay) theo quote realtime. Với nến tuần, cây cuối là tuần hiện tại:
// giữ open của tuần, mở rộng high/low, close bằng giá đang khớp, khối lượng = các ngày trước + hôm nay.
// `todayBase` là cây nến hôm nay lúc tải dữ liệu, để biết phần khối lượng của các ngày trước trong tuần.
export function liveLastCandle(last: ChartCandle, quote: LiveQuote, todayBase: ChartCandle | null): ChartCandle {
  const close = quote.last ?? quote.ref;
  if (!close) return last;
  const dayOpen = quote.open || close;
  const dayHigh = Math.max(quote.high || close, dayOpen, close);
  const dayLow = Math.min(quote.low || close, dayOpen, close);
  const earlierVolume = todayBase ? last.volume - todayBase.volume : 0;
  const isWeek = todayBase !== null && todayBase.time !== last.time;
  return {
    time: last.time,
    open: isWeek ? last.open : dayOpen,
    high: isWeek ? Math.max(last.high, dayHigh) : dayHigh,
    low: isWeek ? Math.min(last.low, dayLow) : dayLow,
    close,
    volume: Math.max(0, earlierVolume) + quote.totalVolume,
  };
}

export interface CandleChange {
  change: number;
  changePct: number;
}

// Thay đổi so với cây trước: dùng cho chú thích O/H/L/C khi rê chuột.
export function changeFrom(previous: ChartCandle | undefined, current: ChartCandle): CandleChange {
  if (!previous || !previous.close) return { change: 0, changePct: 0 };
  const change = current.close - previous.close;
  return { change, changePct: (change / previous.close) * 100 };
}
