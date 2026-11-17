import { useEffect, useState } from "react";
import type { Side } from "../../shared/market-rules";
import { formatPrice } from "../net/format";
import { formatVolumeBoard } from "../lib/format-board";
import { useQuote } from "../lib/quote-store";
import { CandleChart } from "./candle-chart";
import { CompanyTab, DepthTab, HistoryTab, TradesTab } from "./detail-tabs";

// Popup chi tiết mã: dòng giá + MUA/BÁN, biểu đồ nến bên trái, bốn tab bên phải.
// Mở bằng một lần bấm vào ô Mã CK trên bảng giá.

type TabId = "depth" | "trades" | "history" | "company";
const TABS: Array<[TabId, string]> = [
  ["depth", "Độ sâu giá"],
  ["trades", "Khớp lệnh"],
  ["history", "Lịch sử giá"],
  ["company", "Thông tin khác"],
];
const TAB_KEY = "price-board-demo:chi-tiet-tab:v1";

const loadTab = (): TabId => {
  try {
    const saved = localStorage.getItem(TAB_KEY) as TabId | null;
    return TABS.some(([id]) => id === saved) ? (saved as TabId) : "depth";
  } catch {
    return "depth";
  }
};

interface SymbolDetailDialogProps {
  symbol: string;
  name: string;
  // Đang có hộp thoại khác đè lên (form đặt lệnh, đăng nhập) thì Esc để hộp thoại đó xử lý.
  covered: boolean;
  onOrder: (symbol: string, side: Side) => void;
  onClose: () => void;
}

export function SymbolDetailDialog({ symbol, name, covered, onOrder, onClose }: SymbolDetailDialogProps) {
  const quote = useQuote(symbol);
  const [tab, setTab] = useState<TabId>(loadTab);

  useEffect(() => {
    if (covered) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [covered, onClose]);

  const chooseTab = (id: TabId) => {
    setTab(id);
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {
      /* Không lưu được thì lần sau mở lại tab mặc định. */
    }
  };

  const { ref, ceil, floor, last } = quote;
  const change = last && ref ? last - ref : 0;
  const changePct = ref ? (change / ref) * 100 : 0;
  const tone = !last ? "px-ref" : last >= ceil ? "px-ceil" : last <= floor ? "px-floor" : change > 0 ? "px-up" : change < 0 ? "px-down" : "px-ref";

  return (
    <div className="pb-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="ui-detail" role="dialog" aria-modal="true" aria-labelledby="ui-detail-title" data-testid="symbol-detail">
        <header className="ui-detail-head">
          <h2 id="ui-detail-title" className="ui-detail-title">{name || symbol} ({quote.exchange})</h2>
          <button type="button" className="ui-detail-buy" data-testid="detail-buy" onClick={() => onOrder(symbol, "BUY")}>MUA</button>
          <button type="button" className="ui-detail-sell" data-testid="detail-sell" onClick={() => onOrder(symbol, "SELL")}>BÁN</button>
          <span className="pb-dialog-spacer" />
          <button type="button" className="ui-detail-close" aria-label="Đóng" onClick={onClose}>✕</button>
        </header>

        <div className="ui-detail-quote" data-testid="detail-quote">
          <b className={tone}>{symbol}</b>
          <span>Trần <i className="px-ceil">{formatPrice(ceil)}</i></span>
          <span>Sàn <i className="px-floor">{formatPrice(floor)}</i></span>
          <span>TC <i className="px-ref">{formatPrice(ref)}</i></span>
          <span>Giá <i className={tone} data-testid="detail-last">{formatPrice(last ?? ref)}</i></span>
          <span className={tone}>{change > 0 ? "+" : ""}{(change / 1000).toFixed(2)} ({changePct > 0 ? "+" : ""}{changePct.toFixed(2)}%)</span>
          <span>Tổng KL <i>{formatVolumeBoard(quote.totalVolume)}</i></span>
          <span>Cao <i>{formatPrice(quote.high || null)}</i></span>
          <span>Thấp <i>{formatPrice(quote.low || null)}</i></span>
        </div>

        <div className="ui-detail-body">
          <CandleChart symbol={symbol} />
          <section className="ui-detail-side">
            <div className="ui-tabs" role="tablist" aria-label="Thông tin mã">
              {TABS.map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} data-testid={`detail-tab-${id}`}
                  className={`ui-tab${tab === id ? " is-active" : ""}`} onClick={() => chooseTab(id)}>{label}</button>
              ))}
            </div>
            {tab === "depth" && <DepthTab symbol={symbol} />}
            {tab === "trades" && <TradesTab symbol={symbol} />}
            {tab === "history" && <HistoryTab symbol={symbol} />}
            {tab === "company" && <CompanyTab symbol={symbol} />}
          </section>
        </div>
      </div>
    </div>
  );
}
