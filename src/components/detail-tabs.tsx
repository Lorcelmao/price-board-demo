import { useEffect, useMemo, useRef, useState } from "react";
import type { CandleDto, CompanyDto, IntradayBucket, ProfileLevel } from "../../shared/protocol";
import { apiGet } from "../net/api";
import { formatPrice } from "../net/format";
import { formatVolumeBoard } from "../lib/format-board";
import { useQuote } from "../lib/quote-store";
import { nextTape, volumeByHour, type Trade } from "../lib/trade-tape";

// Bốn tab bên phải popup chi tiết mã. Dữ liệu thị trường là API mở của mock,
// không cần đăng nhập.

const tone = (price: number | null, ref: number, ceil: number, floor: number) => {
  if (!price || !ref) return "px-ref";
  if (price >= ceil) return "px-ceil";
  if (price <= floor) return "px-floor";
  return price > ref ? "px-up" : price < ref ? "px-down" : "px-ref";
};

const shares = (value: number) => value.toLocaleString("en-US");
const clock = (time: number) =>
  new Date(time).toLocaleTimeString("vi-VN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

// Tải một API mở, tải lại mỗi `everyMs` (0 là chỉ tải một lần).
function usePolled<T>(path: string, everyMs = 0): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => apiGet<T>(path).then((value) => !cancelled && setData(value)).catch(() => undefined);
    void load();
    const timer = everyMs ? setInterval(load, everyMs) : undefined;
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [path, everyMs]);
  return data;
}

// ---- Độ sâu giá ----
export function DepthTab({ symbol }: { symbol: string }) {
  const quote = useQuote(symbol);
  const profile = usePolled<ProfileLevel[]>(`/volume-profile/${symbol}`, 5_000);
  const { ref, ceil, floor } = quote;
  const bidTotal = quote.bids.reduce((sum, [, volume]) => sum + volume, 0);
  const askTotal = quote.asks.reduce((sum, [, volume]) => sum + volume, 0);
  const total = bidTotal + askTotal;
  const bidPct = total ? (bidTotal / total) * 100 : 50;
  const maxBook = Math.max(1, ...quote.bids.map(([, v]) => v), ...quote.asks.map(([, v]) => v));
  const maxProfile = Math.max(1, ...(profile ?? []).map((level) => level.volume));

  return (
    <div className="ui-tab-body" data-testid="tab-depth">
      <table className="ui-depth">
        <thead><tr><th>KL mua</th><th>Giá mua</th><th>Giá bán</th><th>KL bán</th></tr></thead>
        <tbody>
          {[0, 1, 2].map((level) => {
            const [bidPrice, bidVolume] = quote.bids[level] ?? [0, 0];
            const [askPrice, askVolume] = quote.asks[level] ?? [0, 0];
            return (
              <tr key={level}>
                <td className="ui-depth-bar is-bid">
                  <span style={{ width: `${(bidVolume / maxBook) * 100}%` }} />
                  <em>{bidVolume ? formatVolumeBoard(bidVolume) : ""}</em>
                </td>
                <td className={tone(bidPrice, ref, ceil, floor)}>{bidPrice ? formatPrice(bidPrice) : ""}</td>
                <td className={tone(askPrice, ref, ceil, floor)}>{askPrice ? formatPrice(askPrice) : ""}</td>
                <td className="ui-depth-bar is-ask">
                  <span style={{ width: `${(askVolume / maxBook) * 100}%` }} />
                  <em>{askVolume ? formatVolumeBoard(askVolume) : ""}</em>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h4 className="ui-tab-sub">Khối lượng khớp theo mức giá</h4>
      <div className="ui-profile" data-testid="depth-profile">
        {(profile ?? []).map((level) => (
          <div key={level.price} className="ui-profile-row">
            <span className={tone(level.price, ref, ceil, floor)}>{formatPrice(level.price)}</span>
            <span className="ui-profile-bar"><i style={{ width: `${(level.volume / maxProfile) * 100}%` }} /></span>
            <span>{shares(level.volume)}</span>
          </div>
        ))}
        {profile && profile.length === 0 && <p className="ui-tab-empty">Chưa có giao dịch.</p>}
      </div>

      <div className="ui-ratio" aria-label="Tỉ lệ dư mua và dư bán">
        <div className="ui-ratio-labels"><span>CP</span><span className="px-up">Dư mua</span><span className="px-down">Dư bán</span><span>CP</span></div>
        <div className="ui-ratio-bar" data-testid="depth-ratio">
          <span className="is-bid" style={{ width: `${bidPct}%` }}>{shares(bidTotal)}</span>
          <span className="is-ask" style={{ width: `${100 - bidPct}%` }}>{shares(askTotal)}</span>
        </div>
      </div>
    </div>
  );
}

// ---- Khớp lệnh ----
export function TradesTab({ symbol }: { symbol: string }) {
  const quote = useQuote(symbol);
  const intraday = usePolled<IntradayBucket[]>(`/intraday/${symbol}`, 10_000);
  const [tape, setTape] = useState<Trade[]>([]);
  const previous = useRef<{ last: number | null; totalVolume: number } | null>(null);

  // Theo dõi Tổng KL: mỗi lần tăng là một lần khớp (lib/trade-tape.ts).
  useEffect(() => {
    const current = { last: quote.last, totalVolume: quote.totalVolume };
    // Chụp giá trị cũ trước: hàm cập nhật của setTape chạy muộn hơn, lúc đó ref đã là giá trị mới.
    const before = previous.current;
    const now = Date.now();
    setTape((list) => nextTape(list, before, current, now));
    previous.current = current;
  }, [quote.last, quote.totalVolume]);

  const hours = useMemo(() => volumeByHour(intraday ?? []), [intraday]);
  const maxHour = Math.max(1, ...hours.map((item) => item.volume));

  return (
    <div className="ui-tab-body" data-testid="tab-trades">
      <table className="ui-trades">
        <thead><tr><th>Giờ</th><th>Giá</th><th>KL</th></tr></thead>
        <tbody>
          {tape.length === 0 && <tr><td colSpan={3} className="ui-tab-empty">Đang chờ lần khớp tiếp theo...</td></tr>}
          {tape.map((trade) => (
            <tr key={`${trade.time}-${trade.volume}`}>
              <td>{clock(trade.time)}</td>
              <td className={tone(trade.price, quote.ref, quote.ceil, quote.floor)}>{formatPrice(trade.price)}</td>
              <td data-volume={trade.volume}>{shares(trade.volume)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4 className="ui-tab-sub">Khối lượng theo giờ</h4>
      <div className="ui-hours" data-testid="trades-hours">
        {hours.map((item) => (
          <div key={item.hour} className="ui-hour" title={`${item.hour}h: ${shares(item.volume)} cp`}>
            <i style={{ height: `${(item.volume / maxHour) * 100}%` }} />
            <span>{String(item.hour).padStart(2, "0")}h</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Lịch sử giá ----
const HISTORY_ROWS: Array<[string, number]> = [["1M", 22], ["3M", 66], ["6M", 130]];

export function HistoryTab({ symbol }: { symbol: string }) {
  const candles = usePolled<CandleDto[]>(`/candles/${symbol}?tf=1D`, 30_000);
  const [rows, setRows] = useState(22);
  const recent = useMemo(() => {
    if (!candles) return [];
    const list = candles.slice(-(rows + 1));
    return list.slice(1).map((candle, index) => {
      const change = candle.close - list[index].close;
      return { candle, change, changePct: (change / list[index].close) * 100 };
    }).reverse();
  }, [candles, rows]);

  return (
    <div className="ui-tab-body" data-testid="tab-history">
      <div className="ui-seg" role="group" aria-label="Khoảng lịch sử">
        {HISTORY_ROWS.map(([label, value]) => (
          <button key={label} type="button" aria-pressed={rows === value} onClick={() => setRows(value)}>{label}</button>
        ))}
      </div>
      <table className="ui-history">
        <thead><tr><th>Ngày</th><th>Mở cửa</th><th>Cao</th><th>Thấp</th><th>Đóng cửa</th><th>+/-</th><th>%</th><th>KL</th></tr></thead>
        <tbody>
          {recent.map(({ candle, change, changePct }) => {
            const cls = change > 0 ? "px-up" : change < 0 ? "px-down" : "px-ref";
            return (
              <tr key={candle.time}>
                <td>{candle.time.split("-").reverse().join("/")}</td>
                <td>{formatPrice(candle.open)}</td>
                <td>{formatPrice(candle.high)}</td>
                <td>{formatPrice(candle.low)}</td>
                <td className={cls}>{formatPrice(candle.close)}</td>
                <td className={cls}>{change > 0 ? "+" : ""}{(change / 1000).toFixed(2)}</td>
                <td className={cls}>{changePct > 0 ? "+" : ""}{changePct.toFixed(2)}%</td>
                <td>{shares(candle.volume)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---- Thông tin khác ----
export function CompanyTab({ symbol }: { symbol: string }) {
  const company = usePolled<CompanyDto>(`/company/${symbol}`);
  if (!company) return <div className="ui-tab-body ui-tab-empty">Đang tải...</div>;
  const rows: Array<[string, string]> = [
    ["Tên", company.name],
    ["Sàn", company.exchange],
    ["Ngành", company.sector],
    ["KL cổ phiếu lưu hành", shares(company.sharesOutstanding)],
    ["Vốn hoá (tỷ đồng)", shares(Math.round(company.marketCap / 1e9))],
    ["EPS (đồng)", shares(company.eps)],
    ["P/E", company.pe.toFixed(2)],
    ["P/B", company.pb.toFixed(2)],
    ["Room NN còn lại (cp)", shares(company.foreignRoom)],
  ];
  return (
    <div className="ui-tab-body" data-testid="tab-company">
      <dl className="ui-company">
        {rows.map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      <p className="ui-tab-note">Số liệu giả do mock server sinh ra, không phải báo cáo tài chính thật.</p>
    </div>
  );
}
