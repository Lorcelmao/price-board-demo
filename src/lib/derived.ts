import { useEffect, useRef, useState } from "react";
import type { BoardQuote } from "./quote-store-core";
import { getQuote } from "./quote-store";

// Các số phải tính ở phía giao diện, cho phần luồng chưa có và cho nguồn mock.
// Mọi công thức dưới đây là GIẢ ĐỊNH cho bản demo, không phải cách tính của sở giao dịch.

// Chỉ số VN30 mẫu, dùng làm mốc cho công thức giả lập.
export const VN30_BASE_INDEX = 1817.05;

// Có giá khớp hợp lệ và có TC: chỉ những mã này mới tham gia mọi phép tính.
const usable = (quote: BoardQuote): boolean => quote.ref !== 0 && quote.last !== null && quote.last !== undefined && quote.last !== 0;

// GT mua / GT bán của khối ngoại, đơn vị nghìn đồng: KL × giá TB ÷ 1000.
// Không dùng t30557/t30558 của luồng YSFlex (foreignBuyValue, foreignSellValue): nghĩa của hai trường
// chưa được xác nhận, và có mã trả số âm (ví dụ -21.742.696), nên nhiều khả năng đó không phải
// giá trị mua, bán gộp. Luồng cũng không có KL khối ngoại, vì vậy với nguồn ysflex hai cột GT để trống.
export function foreignTradeValue(quote: BoardQuote, side: "buy" | "sell"): number {
  const volume = side === "buy" ? quote.foreignBuy : quote.foreignSell;
  if (!volume || !quote.avgPrice) return 0;
  return Math.max(0, Math.round((volume * quote.avgPrice) / 1000));
}

// Hiển thị GT khối ngoại: số nguyên nghìn đồng, dấu phẩy hàng nghìn; không có số thì để trống.
export function foreignTradeText(quote: BoardQuote, side: "buy" | "sell"): string {
  const value = foreignTradeValue(quote, side);
  return value === 0 ? "" : value.toLocaleString("en-US");
}

// Tổng GTGD của các mã VN30, đơn vị tỷ VNĐ, số nguyên. Giả định: tổng KL × giá TB ÷ 1 tỷ.
export function sumTurnover(quotes: BoardQuote[]): number {
  let total = 0;
  for (const quote of quotes) total += quote.totalVolume * quote.avgPrice;
  return Math.round(total / 1_000_000_000);
}

export interface Vn30IndexResult {
  value: number;
  change: number;
  changePct: number;
}

// Chỉ số VN30 giả lập: mốc 1817.05 nhân với (1 + trung bình cộng % thay đổi của các mã).
export function vn30Index(quotes: BoardQuote[]): Vn30IndexResult {
  const changes: number[] = [];
  for (const quote of quotes) {
    if (!usable(quote)) continue;
    changes.push(((quote.last as number) - quote.ref) / quote.ref * 100);
  }
  if (changes.length === 0) return { value: VN30_BASE_INDEX, change: 0, changePct: 0 };

  const average = changes.reduce((sum, value) => sum + value, 0) / changes.length;
  const value = VN30_BASE_INDEX * (1 + average / 100);
  return { value, change: value - VN30_BASE_INDEX, changePct: average };
}

export interface MoverCount {
  up: number;
  flat: number;
  down: number;
}

// Đếm mã tăng, đứng, giảm theo giá khớp so với TC.
export function countMovers(quotes: BoardQuote[]): MoverCount {
  const result: MoverCount = { up: 0, flat: 0, down: 0 };
  for (const quote of quotes) {
    if (!usable(quote)) continue;
    const last = quote.last as number;
    if (last > quote.ref) result.up += 1;
    else if (last < quote.ref) result.down += 1;
    else result.flat += 1;
  }
  return result;
}

export interface Vn30Stats {
  turnover: number;
  index: Vn30IndexResult;
  movers: MoverCount;
  points: number[];
  averagePrice: number;
  totalVolume: number;
}

const MAX_POINTS = 300;
const COMPUTE_INTERVAL_MS = 1_000;

// Một chỗ tính các số phụ thuộc toàn bộ VN30 (tổng GTGD, chỉ số, số mã tăng giảm).
// Tính lại tối đa mỗi giây để không kéo cả trang render theo từng tin.
// Mã có TC nhưng chưa có giá khớp được coi là đứng giá, nhờ vậy tăng + đứng + giảm = số mã.
export function useVn30Stats(symbols: string[]): Vn30Stats {
  const key = symbols.join(",");
  const [stats, setStats] = useState<Vn30Stats>(() => computeStats(symbols));
  const points = useRef<number[]>([]);

  useEffect(() => {
    points.current = [];
    const compute = () => {
      const next = computeStats(symbols);
      const history = points.current;
      const last = history[history.length - 1];
      if (last !== next.index.value) {
        history.push(next.index.value);
        if (history.length > MAX_POINTS) history.splice(0, history.length - MAX_POINTS);
      }
      setStats({ ...next, points: history.slice() });
    };
    compute();
    const timer = setInterval(compute, COMPUTE_INTERVAL_MS);
    return () => clearInterval(timer);
    // Danh sách mã so sánh theo nội dung.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return stats;
}

function computeStats(symbols: string[]): Vn30Stats {
  const quotes = symbols.map((symbol) => getQuote(symbol));
  // Mã có TC nhưng chưa có giá khớp: coi như đứng giá để tổng số mã khớp danh sách.
  const normalized = quotes.map((quote) =>
    quote.ref !== 0 && (quote.last === null || quote.last === undefined || quote.last === 0)
      ? { ...quote, last: quote.ref }
      : quote,
  );
  let totalVolume = 0;
  let totalValue = 0;
  for (const quote of normalized) {
    totalVolume += quote.totalVolume;
    totalValue += quote.totalVolume * quote.avgPrice;
  }
  return {
    turnover: sumTurnover(normalized),
    index: vn30Index(normalized),
    movers: countMovers(normalized),
    points: [],
    averagePrice: totalVolume === 0 ? 0 : Math.round(totalValue / totalVolume),
    totalVolume,
  };
}
