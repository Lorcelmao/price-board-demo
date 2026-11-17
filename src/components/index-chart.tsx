import { useEffect, useRef, useState } from "react";
import {
  BaselineSeries,
  createChart,
  HistogramSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { chartMinutes, toMinutes, type IndexPoint } from "../../shared/indexes";

// Biểu đồ trong ngày của một thẻ chỉ số: đường chỉ số (xanh trên tham chiếu, đỏ dưới), cột khối lượng
// từng phút và đường gạch ngang ở mức tham chiếu. Trục giờ cố định 09:00 tới 15:00, mỗi phút một vị trí,
// nên phút chưa tới để trống và giờ nghỉ trưa giữ giá trị cuối buổi sáng như bảng giá thật.

const UP = "#00c853";
const DOWN = "#ff3d3d";
const VOLUME = "rgba(79, 195, 247, 0.75)";
const MINUTES = chartMinutes();

// Phút "HH:mm" thành mốc thời gian của thư viện. Chỉ cần đúng thứ tự, nên dùng một ngày cố định theo UTC.
const timeOf = (minute: string): UTCTimestamp => (Date.UTC(2000, 0, 1) / 1000 + toMinutes(minute) * 60) as UTCTimestamp;
const minuteOf = (time: Time): string => {
  const total = Math.round(((time as number) - Date.UTC(2000, 0, 1) / 1000) / 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

// Dữ liệu trên trục đủ 361 phút: phút đã qua có giá trị (thiếu thì lấy giá trị phút trước), phút chưa tới để trống.
function seriesData(points: IndexPoint[]) {
  const byMinute = new Map(points.map((point) => [point.time, point]));
  const lastMinute = points.length ? toMinutes(points[points.length - 1].time) : -1;
  const line: Array<{ time: UTCTimestamp; value?: number }> = [];
  const bars: Array<{ time: UTCTimestamp; value?: number }> = [];
  let carry: number | undefined;
  for (const minute of MINUTES) {
    const time = timeOf(minute);
    const point = byMinute.get(minute);
    if (point) carry = point.value;
    const reached = toMinutes(minute) <= lastMinute && carry !== undefined;
    line.push(reached ? { time, value: carry } : { time });
    bars.push(point ? { time, value: point.volume } : { time });
  }
  return { line, bars };
}

interface Hover {
  x: number;
  minute: string;
  value: number;
  volume: number;
}

export function IndexChart({ points, refValue }: { points: IndexPoint[]; refValue: number }) {
  const container = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const barsRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const [hover, setHover] = useState<Hover | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const chart = createChart(container.current, {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: "#8b8b8b", fontSize: 10, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: { visible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: { mode: 0, horzLine: { visible: false, labelVisible: false }, vertLine: { labelVisible: false } },
      handleScroll: false,
      handleScale: false,
    });
    const bars = chart.addSeries(HistogramSeries, {
      color: VOLUME, priceScaleId: "vol", priceLineVisible: false, lastValueVisible: false,
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.7, bottom: 0 } });
    const line = chart.addSeries(BaselineSeries, {
      lineWidth: 1,
      topLineColor: UP, bottomLineColor: DOWN,
      topFillColor1: "transparent", topFillColor2: "transparent",
      bottomFillColor1: "transparent", bottomFillColor2: "transparent",
      priceLineVisible: false, lastValueVisible: false, crosshairMarkerRadius: 3,
    });
    line.priceScale().applyOptions({ scaleMargins: { top: 0.12, bottom: 0.3 } });
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        setHover(null);
        return;
      }
      const minute = minuteOf(param.time);
      const known = pointsRef.current.filter((point) => toMinutes(point.time) <= toMinutes(minute));
      const at = known[known.length - 1];
      if (!at) {
        setHover(null);
        return;
      }
      const exact = pointsRef.current.find((point) => point.time === minute);
      setHover({ x: param.point.x, minute, value: at.value, volume: exact?.volume ?? 0 });
    });
    chartRef.current = chart;
    lineRef.current = line;
    barsRef.current = bars;
    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!lineRef.current || !barsRef.current || !refValue) return;
    const { line, bars } = seriesData(points);
    lineRef.current.applyOptions({ baseValue: { type: "price", price: refValue } });
    lineRef.current.setData(line);
    barsRef.current.setData(bars);
    chartRef.current?.timeScale().fitContent();
  }, [points, refValue]);

  // Đường gạch ngang ở mức tham chiếu, kèm chữ số tham chiếu như bảng giá thật.
  useEffect(() => {
    const line = lineRef.current;
    if (!line || !refValue) return;
    const priceLine = line.createPriceLine({
      price: refValue, color: "#f5a623", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false,
    });
    return () => line.removePriceLine(priceLine);
  }, [refValue]);

  return (
    <div className="pb-index-canvas" ref={container}>
      {hover && (
        <div className="pb-index-tip" style={{ left: hover.x }}>
          <div>{hover.minute}</div>
          <div>Chỉ số: <b>{hover.value.toFixed(2)}</b></div>
          <div>KLGD: <b>{hover.volume.toLocaleString("en-US")}</b></div>
        </div>
      )}
    </div>
  );
}
