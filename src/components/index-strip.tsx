// Vùng 3: dải chỉ số. Bốn thẻ có biểu đồ trong ngày (VNI, VN30, HNX, UPCOM) và bảng "Chỉ số chính".
// Số liệu lấy từ kho chỉ số: mock server tự tính từ các mã của nó, nguồn YSFlex đọc kênh chỉ số trên /market.
import { CHART_INDEXES, TABLE_INDEXES, type IndexCode, type IndexSnapshot } from "../../shared/indexes";
import type { SessionPhase } from "../../shared/market-rules";
import { useIndex } from "../lib/index-store";
import { IndexChart } from "./index-chart";

const PHASE_NOTE: Record<SessionPhase, string> = {
  ATO: "Phiên ATO",
  CONTINUOUS: "Phiên liên tục",
  ATC: "Phiên ATC",
  CLOSED: "Đóng cửa",
};

const fixed2 = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (value: number) => `${value > 0 ? "+" : ""}${fixed2(value)}`;
const tone = (snapshot: IndexSnapshot) => (snapshot.change > 0 ? "up" : snapshot.change < 0 ? "down" : "ref");
const arrow = (snapshot: IndexSnapshot) => (snapshot.change > 0 ? "↑" : snapshot.change < 0 ? "↓" : "");

function IndexCard({ code, phase }: { code: IndexCode; phase: SessionPhase | null }) {
  const { snapshot, points } = useIndex(code);
  return (
    <div className="pb-index-card" data-index={code}>
      <div className="pb-index-chart">
        {snapshot && <div className="pb-index-target">{fixed2(snapshot.ref)}</div>}
        <IndexChart points={points} refValue={snapshot?.ref ?? 0} />
        <div className="pb-index-axis">
          {["09h", "10h", "11h", "12h", "13h", "14h", "15h"].map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </div>
      <div className="pb-index-foot">
        <div className="pb-index-line">
          <span className="pb-index-name">
            {code}
            <i className="pb-caret small" aria-hidden="true">▾</i>
          </span>
          {snapshot ? (
            <span className={`pb-index-value px-${tone(snapshot)}`} data-testid={`index-value-${code}`}>
              {arrow(snapshot)}{fixed2(snapshot.value)}
              <small>({signed(snapshot.change)} {signed(snapshot.changePct)}%)</small>
            </span>
          ) : (
            <span className="pb-index-value">Đang tải...</span>
          )}
        </div>
        {snapshot && (
          <>
            <div className="pb-index-line pb-index-volume">
              <span>{snapshot.volume.toLocaleString("en-US")} <em>CP</em></span>
              <span>{fixed2(snapshot.turnover / 1e9)} <em>Tỷ</em></span>
            </div>
            <div className="pb-index-line pb-index-counts">
              <b className="px-up">↑{snapshot.up}<i className="px-ceil">({snapshot.ceil})</i></b>
              <b className="px-ref">{snapshot.flat}</b>
              <b className="px-down">↓{snapshot.down}<i className="px-floor">({snapshot.floor})</i></b>
              <em>{phase ? PHASE_NOTE[phase] : ""}</em>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function IndexRow({ code }: { code: IndexCode }) {
  const { snapshot } = useIndex(code);
  return (
    <div className="pb-main-index-row" data-index={code}>
      <span>{code}</span>
      {snapshot ? (
        <>
          <span className={`pb-mono px-${tone(snapshot)}`}>
            {fixed2(snapshot.value)} {signed(snapshot.changePct)}%
          </span>
          <span className="pb-mono">{(snapshot.volume / 1e6).toFixed(2)} M</span>
          <span className="pb-mono">{(snapshot.turnover / 1e9).toFixed(2)} B</span>
        </>
      ) : (
        <><span /><span /><span /></>
      )}
    </div>
  );
}

export function IndexStrip({ phase }: { phase: SessionPhase | null }) {
  return (
    <section className="pb-index-strip" aria-label="Dải chỉ số">
      <div className="pb-index-cards">
        {CHART_INDEXES.map((code) => (
          <IndexCard key={code} code={code} phase={phase} />
        ))}
      </div>
      <div className="pb-main-index">
        <div className="pb-main-index-head">
          <span>Chỉ số chính</span>
          <span>+/-</span>
          <span>KLGD</span>
          <span>GTGD</span>
        </div>
        {TABLE_INDEXES.map((code) => (
          <IndexRow key={code} code={code} />
        ))}
        <a className="pb-chart-credit" href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          Biểu đồ: TradingView Lightweight Charts
        </a>
      </div>
    </section>
  );
}
