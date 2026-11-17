import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  createChart,
  HistogramSeries,
  LineSeries,
  PriceScaleMode,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesType,
  type Time,
} from "lightweight-charts";
import type { IntradayCandle } from "../../shared/feed";
import type { CandleDto } from "../../shared/protocol";
import { apiGet } from "../net/api";
import type { SourceView } from "./footer-bar";
import {
  candleIndex,
  changeFrom,
  CHART_PREFS_KEY,
  intradayToChart,
  liveIntradayLast,
  liveLastCandle,
  minuteLabel,
  rangeStart,
  type ChartCandle,
  sanitizePrefs,
  type ChartPrefs,
  type ChartRange,
  type ChartType,
  type ScaleMode,
  type Timeframe,
} from "../lib/chart-data";
import { ema } from "../lib/indicators";
import { useQuote } from "../lib/quote-store";

// Biểu đồ nến của popup chi tiết mã, vẽ bằng Lightweight Charts (TradingView, Apache-2.0).
// Nguồn mock: nến ngày/tuần lấy từ /api/candles. Nguồn Yuanta: nến 1 phút trong ngày lấy qua gateway
// (/api/intraday-candles), vì luồng /market không có nến ngày. Cây cuối luôn cập nhật theo giá realtime.
// Dùng bộ màu mặc định của TradingView, dịu hơn màu tăng giảm của bảng giá.

const UP = "#089981";
const DOWN = "#f23645";
const EMA5_COLOR = "#fbc02d";
const EMA20_COLOR = "#f98946";

const TYPES: Array<[ChartType, string]> = [
  ["candle", "Nến"],
  ["hollow", "Nến rỗng"],
  ["bar", "Cột OHLC"],
  ["line", "Đường"],
  ["area", "Vùng"],
];
const RANGES: ChartRange[] = ["1M", "6M", "1Y", "5Y", "MAX"];
const SCALES: Array<[ScaleMode, string]> = [["normal", "Thường"], ["log", "log"], ["percent", "%"]];

const price = (value: number) => (value / 1000).toFixed(2);
const volumeText = (value: number) =>
  value >= 1_000_000 ? `${(value / 1_000_000).toFixed(2)} M` : value.toLocaleString("en-US");

const loadPrefs = (): ChartPrefs => {
  try {
    return sanitizePrefs(JSON.parse(localStorage.getItem(CHART_PREFS_KEY) ?? "null"));
  } catch {
    return sanitizePrefs(null);
  }
};

const savePrefs = (prefs: ChartPrefs) => {
  try {
    localStorage.setItem(CHART_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* Bộ nhớ trình duyệt bị chặn: lựa chọn chỉ sống tới khi đóng popup. */
  }
};

// Dữ liệu cho từng kiểu series: nến và cột OHLC cần đủ 4 giá; đường và vùng chỉ cần giá đóng cửa.
const seriesPoint = (type: ChartType, candle: ChartCandle) =>
  type === "line" || type === "area"
    ? { time: candle.time as Time, value: candle.close }
    : { time: candle.time as Time, open: candle.open, high: candle.high, low: candle.low, close: candle.close };

const volumePoint = (candle: ChartCandle, previous?: ChartCandle) => ({
  time: candle.time as Time,
  value: candle.volume,
  color: candle.close >= (previous?.close ?? candle.open) ? "rgba(8, 153, 129, 0.5)" : "rgba(242, 54, 69, 0.5)",
});

function addMainSeries(chart: IChartApi, type: ChartType): ISeriesApi<SeriesType> {
  const priceFormat = { type: "custom" as const, formatter: price, minMove: 10 };
  if (type === "line") return chart.addSeries(LineSeries, { color: "#4fa3ff", lineWidth: 2, priceFormat });
  if (type === "area") {
    return chart.addSeries(AreaSeries, {
      lineColor: "#4fa3ff", topColor: "rgba(79, 163, 255, 0.35)", bottomColor: "rgba(79, 163, 255, 0.02)", priceFormat,
    });
  }
  if (type === "bar") return chart.addSeries(BarSeries, { upColor: UP, downColor: DOWN, priceFormat });
  // Nến rỗng: thân nến tăng trong suốt, chỉ còn viền; nến giảm vẫn tô đặc.
  const hollow = type === "hollow";
  return chart.addSeries(CandlestickSeries, {
    upColor: hollow ? "rgba(0, 0, 0, 0)" : UP,
    downColor: DOWN,
    borderUpColor: UP,
    borderDownColor: DOWN,
    wickUpColor: UP,
    wickDownColor: DOWN,
    priceFormat,
  });
}

interface Legend {
  candle: ChartCandle;
  change: number;
  changePct: number;
}

// Nến 1 phút tải lại mỗi phút để có cây mới và khối lượng của phút vừa xong.
const INTRADAY_REFRESH_MS = 60_000;

export function CandleChart({ symbol, source = "mock" }: { symbol: string; source?: SourceView }) {
  const quote = useQuote(symbol);
  const intraday = source === "ysflex";
  const [prefs, setPrefs] = useState<ChartPrefs>(loadPrefs);
  const [daily, setDaily] = useState<ChartCandle[] | null>(null);
  const [weekly, setWeekly] = useState<ChartCandle[] | null>(null);
  const [minutes, setMinutes] = useState<ChartCandle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<Legend | null>(null);

  const container = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema5Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ema20Ref = useRef<ISeriesApi<"Line"> | null>(null);

  const update = (patch: Partial<ChartPrefs>) =>
    setPrefs((current) => {
      const next = { ...current, ...patch };
      savePrefs(next);
      return next;
    });

  // Nguồn Yuanta: nến 1 phút trong ngày, tải lại mỗi phút.
  useEffect(() => {
    if (!intraday) return;
    let cancelled = false;
    setError(null);
    const load = () =>
      apiGet<IntradayCandle[]>(`/intraday-candles/${symbol}?feed=ysflex`)
        .then((data) => !cancelled && setMinutes(intradayToChart(data)))
        .catch(() => !cancelled && setError("Chưa tải được nến 1 phút, đang thử lại..."));
    void load();
    const timer = setInterval(load, INTRADAY_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [symbol, intraday]);

  // Nguồn mock: nến ngày (luôn cần: cây hôm nay làm mốc cho realtime) và nến tuần khi chọn 1W.
  useEffect(() => {
    if (intraday) return;
    let cancelled = false;
    setError(null);
    apiGet<CandleDto[]>(`/candles/${symbol}?tf=1D`)
      .then((data) => !cancelled && setDaily(data))
      .catch(() => !cancelled && setError("Không tải được dữ liệu nến."));
    return () => {
      cancelled = true;
    };
  }, [symbol, intraday]);

  useEffect(() => {
    if (intraday || prefs.timeframe !== "1W" || weekly) return;
    let cancelled = false;
    apiGet<CandleDto[]>(`/candles/${symbol}?tf=1W`)
      .then((data) => !cancelled && setWeekly(data))
      .catch(() => !cancelled && setError("Không tải được dữ liệu nến tuần."));
    return () => {
      cancelled = true;
    };
  }, [symbol, prefs.timeframe, weekly, intraday]);

  const todayBase = daily?.at(-1) ?? null;
  const base = intraday ? minutes : prefs.timeframe === "1W" ? weekly : daily;

  // Chuỗi nến đang vẽ, cây cuối đã ghép với giá realtime.
  const candles = useMemo(() => {
    if (!base || base.length === 0) return null;
    const tail = base[base.length - 1];
    const last = intraday ? liveIntradayLast(tail, quote) : liveLastCandle(tail, quote, todayBase);
    return [...base.slice(0, -1), last];
  }, [base, quote, todayBase, intraday]);

  // Tạo biểu đồ một lần; huỷ khi đóng popup để không rò bộ nhớ.
  useEffect(() => {
    if (!container.current) return;
    const chart = createChart(container.current, {
      autoSize: true,
      layout: { background: { color: "#14141a" }, textColor: "#cfcfcf", fontSize: 11, attributionLogo: true },
      grid: { vertLines: { color: "#23232d" }, horzLines: { color: "#23232d" } },
      rightPriceScale: { borderColor: "#47475e" },
      timeScale: { borderColor: "#47475e", rightOffset: 4, timeVisible: intraday, secondsVisible: false },
      crosshair: { mode: 0 },
      // Nến 1 phút nằm trên một ngày cố định (xem minuteTime): nhãn ở con trỏ chỉ hiện giờ, không hiện ngày giả.
      ...(intraday ? { localization: { timeFormatter: (time: Time) => minuteLabel(time as number) } } : {}),
    });
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
      mainRef.current = null;
      volumeRef.current = null;
      ema5Ref.current = null;
      ema20Ref.current = null;
    };
    // Biểu đồ dựng một lần cho mỗi lần mở popup; nguồn không đổi trong lúc popup mở.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dựng lại series khi đổi kiểu hay bật tắt chỉ báo; nạp lại toàn bộ dữ liệu khi đổi khung hay mã.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !base || base.length === 0) return;

    for (const ref of [mainRef, volumeRef, ema5Ref, ema20Ref]) {
      if (ref.current) chart.removeSeries(ref.current);
      ref.current = null;
    }
    const data = candles ?? base;
    const main = addMainSeries(chart, prefs.type);
    main.setData(data.map((candle) => seriesPoint(prefs.type, candle)));
    mainRef.current = main;

    if (prefs.volume) {
      const volume = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false });
      chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      volume.setData(data.map((candle, index) => volumePoint(candle, data[index - 1])));
      volumeRef.current = volume;
    }
    const closes = data.map((candle) => candle.close);
    const addEma = (period: number, color: string) => {
      const line = chart.addSeries(LineSeries, {
        color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        priceFormat: { type: "custom", formatter: price, minMove: 10 },
      });
      const values = ema(closes, period);
      line.setData(data.flatMap((candle, index) => (values[index] === null ? [] : [{ time: candle.time as Time, value: values[index]! }])));
      return line;
    };
    if (prefs.ema5) ema5Ref.current = addEma(5, EMA5_COLOR);
    if (prefs.ema20) ema20Ref.current = addEma(20, EMA20_COLOR);

    const from = intraday ? null : rangeStart(String(data[data.length - 1].time), prefs.range);
    if (from) chart.timeScale().setVisibleRange({ from: from as Time, to: data[data.length - 1].time as Time });
    else chart.timeScale().fitContent();
    // Chỉ dựng lại khi đổi những thứ này; cây cuối realtime đi qua effect bên dưới bằng update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, prefs.type, prefs.volume, prefs.ema5, prefs.ema20, prefs.range]);

  // Realtime: chỉ cập nhật cây cuối (series.update), không nạp lại cả chuỗi.
  useEffect(() => {
    if (!candles || !mainRef.current) return;
    const last = candles[candles.length - 1];
    mainRef.current.update(seriesPoint(prefs.type, last));
    volumeRef.current?.update(volumePoint(last, candles[candles.length - 2]));
    const closes = candles.map((candle) => candle.close);
    for (const [ref, period] of [[ema5Ref, 5], [ema20Ref, 20]] as const) {
      const value = ema(closes, period).at(-1);
      if (ref.current && value != null) ref.current.update({ time: last.time as Time, value });
    }
  }, [candles, prefs.type]);

  useEffect(() => {
    const mode = prefs.scale === "log" ? PriceScaleMode.Logarithmic : prefs.scale === "percent" ? PriceScaleMode.Percentage : PriceScaleMode.Normal;
    chartRef.current?.priceScale("right").applyOptions({ mode });
  }, [prefs.scale]);

  // Chú thích O/H/L/C theo vị trí chuột; rời chuột thì về cây cuối.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !candles) return;
    const positionOf = candleIndex(candles);
    const onMove = (param: MouseEventParams<Time>) => {
      const position = positionOf(param.time);
      if (position === undefined) {
        setHover(null);
        return;
      }
      const candle = candles[position];
      setHover({ candle, ...changeFrom(candles[position - 1], candle) });
    };
    chart.subscribeCrosshairMove(onMove);
    return () => chart.unsubscribeCrosshairMove(onMove);
  }, [candles]);

  const latest: Legend | null = candles
    ? { candle: candles[candles.length - 1], ...changeFrom(candles[candles.length - 2], candles[candles.length - 1]) }
    : null;
  const legend = hover ?? latest;
  const tone = legend && legend.change > 0 ? "px-up" : legend && legend.change < 0 ? "px-down" : "px-ref";

  return (
    <div className="ui-chart" data-testid="candle-chart">
      <div className="ui-chart-toolbar" role="toolbar" aria-label="Tuỳ chọn biểu đồ">
        <select
          aria-label="Kiểu biểu đồ"
          data-testid="chart-type"
          value={prefs.type}
          onChange={(event) => update({ type: event.target.value as ChartType })}
        >
          {TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {intraday ? (
          <span className="ui-chart-note" data-testid="chart-intraday-note" title="Luồng /market của Yuanta chỉ có dữ liệu trong ngày">
            Nến 1 phút trong ngày (nến ngày cần nguồn khác)
          </span>
        ) : (
          <div className="ui-seg" role="group" aria-label="Khung thời gian">
            {(["1D", "1W"] as Timeframe[]).map((value) => (
              <button key={value} type="button" aria-pressed={prefs.timeframe === value} data-testid={`chart-tf-${value}`}
                onClick={() => update({ timeframe: value })}>{value}</button>
            ))}
          </div>
        )}
        <label className="ui-check"><input type="checkbox" checked={prefs.ema5} data-testid="chart-ema5" onChange={(event) => update({ ema5: event.target.checked })} /> EMA 5</label>
        <label className="ui-check"><input type="checkbox" checked={prefs.ema20} data-testid="chart-ema20" onChange={(event) => update({ ema20: event.target.checked })} /> EMA 20</label>
        <label className="ui-check"><input type="checkbox" checked={prefs.volume} data-testid="chart-volume" onChange={(event) => update({ volume: event.target.checked })} /> Khối lượng</label>
        <div className="ui-seg" role="group" aria-label="Trục giá">
          {SCALES.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={prefs.scale === value} data-testid={`chart-scale-${value}`}
              onClick={() => update({ scale: value })}>{label}</button>
          ))}
        </div>
      </div>

      <div className="ui-chart-legend" data-testid="chart-legend">
        <b>{symbol} · {intraday ? "1 phút" : prefs.timeframe}</b>
        {legend && (
          <>
            <span>O<i className={tone}>{price(legend.candle.open)}</i></span>
            <span>H<i className={tone}>{price(legend.candle.high)}</i></span>
            <span>L<i className={tone}>{price(legend.candle.low)}</i></span>
            <span>C<i className={tone} data-testid="chart-close">{price(legend.candle.close)}</i></span>
            <span className={tone}>
              {legend.change > 0 ? "+" : ""}{price(legend.change)} ({legend.changePct > 0 ? "+" : ""}{legend.changePct.toFixed(2)}%)
            </span>
            <span>KL <i>{volumeText(legend.candle.volume)}</i></span>
            {prefs.ema5 && <span style={{ color: EMA5_COLOR }}>EMA 5</span>}
            {prefs.ema20 && <span style={{ color: EMA20_COLOR }}>EMA 20</span>}
          </>
        )}
      </div>

      <div className="ui-chart-canvas" ref={container}>
        {error && <p className="ui-chart-error" role="alert">{error}</p>}
      </div>

      {!intraday && (
        <div className="ui-seg ui-chart-ranges" role="group" aria-label="Khoảng thời gian">
          {RANGES.map((value) => (
            <button key={value} type="button" aria-pressed={prefs.range === value} data-testid={`chart-range-${value}`}
              onClick={() => update({ range: value })}>{value === "MAX" ? "Max" : value}</button>
          ))}
        </div>
      )}
    </div>
  );
}
