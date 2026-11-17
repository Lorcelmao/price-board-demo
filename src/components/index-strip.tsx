// Vùng 3: dải chỉ số cao khoảng 190px. Thẻ VN30 và dòng VN30
// nhận số thật qua props. Các thẻ khác giữ số mẫu.

export interface Vn30IndexView {
  value: number;
  change: number;
  changePct: number;
  up: number;
  flat: number;
  down: number;
  totalVolume: number;
  totalValue: number;
  points: number[];
}

interface IndexCard {
  key: string;
  name: string;
  value: string;
  change: string;
  changePct: string;
  up: string;
  flat: string;
  down: string;
  note: string;
  points: number[];
  positive: boolean;
}

// Số mẫu từ ảnh, không phải dữ liệu thật.
const SAMPLE_CARDS: IndexCard[] = [
  {
    key: "VNI", name: "VNI", value: "1708.88", change: "-1.84", changePct: "-0.11%",
    up: "90(2)", flat: "56", down: "58(1)", note: "Phiên liên tục", positive: false,
    points: [3, 4, 6, 5, 7, 9, 8, 11, 10, 13, 12, 14, 13, 15, 16],
  },
  {
    key: "HNX", name: "HNX", value: "251.06", change: "0.51", changePct: "0.20%",
    up: "3(2)", flat: "29", down: "1(1)", note: "Phiên liên tục", positive: true,
    points: [8, 6, 7, 9, 8, 10, 9, 11, 9, 8, 9, 7, 8, 6, 5],
  },
  {
    key: "UPCOM", name: "UPCOM", value: "122.34", change: "0.39", changePct: "0.32%",
    up: "37(3)", flat: "27", down: "17(5)", note: "Phiên liên tục", positive: true,
    points: [4, 6, 5, 7, 6, 8, 9, 8, 10, 9, 11, 10, 12, 11, 13],
  },
];

const SAMPLE_VN30: Vn30IndexView = {
  value: 1817.05, change: 3.64, changePct: 0.2, up: 20, flat: 4, down: 8,
  totalVolume: 5_052_480, totalValue: 150.38, points: [6, 7, 7, 8, 8, 9, 9, 10, 10, 10, 11, 11, 12, 12, 12],
};

// Số mẫu từ ảnh, không phải dữ liệu thật.
const SAMPLE_TABLE = [
  { name: "VNI", value: "1708.88", pct: "-0.11%", vol: "16.25 M", val: "311.10 B", tone: "down" },
  { name: "HNX", value: "251.06", pct: "0.20%", vol: "3.80 M", val: "49.28 B", tone: "up" },
  { name: "UPCOM", value: "122.34", pct: "0.32%", vol: "1.4 M", val: "16.56 B", tone: "up" },
  { name: "HNX30", value: "0", pct: "0.00%", vol: "", val: "", tone: "ref" },
  { name: "VNX50", value: "3020.15", pct: "0.21%", vol: "10.74 M", val: "239.31 B", tone: "up" },
];

function Sparkline({ points, positive }: { points: number[]; positive: boolean }) {
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const width = 260;
  const height = 96;
  const step = width / (points.length - 1 || 1);
  const d = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${(index * step).toFixed(1)} ${(height - ((point - min) / span) * height).toFixed(1)}`)
    .join(" ");
  return (
    <svg className="pb-spark" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke={positive ? "var(--up)" : "var(--down)"} strokeWidth="1.5" />
    </svg>
  );
}

function Card({ card }: { card: IndexCard }) {
  return (
    <div className="pb-index-card">
      <div className="pb-index-chart">
        <div className="pb-index-target">{card.value}</div>
        <Sparkline points={card.points} positive={card.positive} />
        <div className="pb-index-axis">
          {["09h", "10h", "11h", "12h", "13h", "14h", "15h"].map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      </div>
      <div className="pb-index-foot">
        <span className="pb-index-name">
          {card.name}
          <i className="pb-caret small" aria-hidden="true">▾</i>
        </span>
        <span className={`pb-index-value ${card.positive ? "px-up" : "px-down"}`}>
          {card.value}
          <small>
            ({card.change} {card.changePct})
          </small>
        </span>
        <span className="pb-index-counts">
          <b className="px-up">↑{card.up}</b>
          <b>{card.flat}</b>
          <b className="px-down">↓{card.down}</b>
          <em>{card.note}</em>
        </span>
      </div>
    </div>
  );
}

export function IndexStrip({ vn30 }: { vn30?: Vn30IndexView }) {
  const live = vn30 ?? SAMPLE_VN30;
  const vn30Card: IndexCard = {
    key: "VN30",
    name: "VN30",
    value: live.value.toFixed(2),
    change: `${live.change >= 0 ? "+" : ""}${live.change.toFixed(2)}`,
    changePct: `${live.changePct >= 0 ? "+" : ""}${live.changePct.toFixed(2)}%`,
    up: `${live.up}(0)`,
    flat: String(live.flat),
    down: `${live.down}(0)`,
    note: "Phiên liên tục",
    points: live.points.length > 1 ? live.points : SAMPLE_VN30.points,
    positive: live.change >= 0,
  };

  const rows = [
    SAMPLE_TABLE[0],
    SAMPLE_TABLE[1],
    SAMPLE_TABLE[2],
    {
      name: "VN30",
      value: live.value.toFixed(2),
      pct: `${live.changePct >= 0 ? "+" : ""}${live.changePct.toFixed(2)}%`,
      vol: `${(live.totalVolume / 1_000_000).toFixed(2)} M`,
      // totalValue truyền vào là tổng GTGD tính bằng tỷ VNĐ, khớp cột GTGD bên phải.
      val: `${live.totalValue.toFixed(2)} B`,
      tone: live.change >= 0 ? "up" : "down",
    },
    SAMPLE_TABLE[3],
    SAMPLE_TABLE[4],
  ];

  return (
    <section className="pb-index-strip" aria-label="Dải chỉ số">
      <div className="pb-index-cards">
        {SAMPLE_CARDS.map((card) => (
          <Card key={card.key} card={card} />
        ))}
        <Card card={vn30Card} />
      </div>
      <div className="pb-main-index">
        <div className="pb-main-index-head">
          <span>Chỉ số chính</span>
          <span>+/-</span>
          <span>KLGD</span>
          <span>GTGD</span>
        </div>
        {rows.map((row) => (
          <div key={row.name} className="pb-main-index-row">
            <span>{row.name}</span>
            <span className={`pb-mono px-${row.tone}`}>
              {row.value} {row.pct}
            </span>
            <span className="pb-mono">{row.vol}</span>
            <span className="pb-mono">{row.val}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
