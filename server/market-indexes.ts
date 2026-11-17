import {
  chartMinutes,
  computeIndex,
  isTradingMinute,
  mergeIndexTick,
  toMinutes,
  vnClock,
  VN30_MOCK,
  type IndexCode,
  type IndexPoint,
  type IndexSnapshot,
} from "../shared/indexes";
import { seededRandom, type MarketSimulator, type SymbolState } from "./market-simulator";

// Mốc (tham chiếu) của từng chỉ số giả lập và cách chọn mã thành phần từ 50 mã của mock.
const INDEX_DEFS: Array<{ code: IndexCode; base: number; members: (state: SymbolState) => boolean }> = [
  { code: "VNI", base: 1710.72, members: (state) => state.exchange === "HOSE" },
  { code: "VN30", base: 1817.05, members: (state) => VN30_MOCK.includes(state.symbol) },
  { code: "HNX", base: 250.55, members: (state) => state.exchange === "HNX" },
  { code: "UPCOM", base: 121.95, members: (state) => state.exchange === "UPCOM" },
  // Mock chỉ có vài mã HNX, nên HNX30 dùng chung các mã HNX đó.
  { code: "HNX30", base: 430.15, members: (state) => state.exchange === "HNX" },
];

interface IndexTrack {
  snapshot: IndexSnapshot;
  points: IndexPoint[];
}

// Chỉ số của mock server: tính từ giá các mã thành phần, kèm chuỗi điểm theo phút cho biểu đồ.
// Lúc khởi động sinh sẵn đường từ 09:00 tới giờ hiện tại (hoặc cả ngày nếu đang ngoài giờ),
// kết thúc đúng ở giá trị hiện tại, để biểu đồ đầy ngay khi mở trang.
export class MarketIndexes {
  private readonly tracks = new Map<IndexCode, IndexTrack>();

  constructor(private readonly market: MarketSimulator, private readonly now: () => number = Date.now) {
    const clock = vnClock(this.now());
    for (const def of INDEX_DEFS) {
      const snapshot = this.compute(def, clock);
      this.tracks.set(def.code, { snapshot, points: backfill(def.code, snapshot, clock) });
    }
  }

  // Tính lại mọi chỉ số từ giá hiện tại và ghép vào biểu đồ. Trả về ảnh chụp mới để phát cho client.
  update(): IndexSnapshot[] {
    const clock = vnClock(this.now());
    return INDEX_DEFS.map((def) => {
      const track = this.tracks.get(def.code)!;
      const snapshot = this.compute(def, clock);
      track.points = mergeIndexTick(track.points, snapshot, snapshot.volume - track.snapshot.volume);
      track.snapshot = snapshot;
      return snapshot;
    });
  }

  snapshots(): IndexSnapshot[] {
    return [...this.tracks.values()].map((track) => track.snapshot);
  }

  history(code: string): IndexPoint[] | undefined {
    return this.tracks.get(code as IndexCode)?.points;
  }

  private compute(def: (typeof INDEX_DEFS)[number], clock: string): IndexSnapshot {
    const members = [...this.market.symbols.values()].filter(def.members);
    return computeIndex(def.code, def.base, members, clock);
  }
}

// Đường giả lập từ 09:00: bắt đầu quanh mốc, đi ngẫu nhiên có seed theo mã chỉ số, kết thúc đúng ở giá trị hiện tại.
// Dùng cầu Brown: cộng dồn nhiễu rồi trừ phần trôi, để điểm đầu và điểm cuối khớp mốc và giá trị hiện tại.
function backfill(code: IndexCode, snapshot: IndexSnapshot, clock: string): IndexPoint[] {
  const nowMinute = toMinutes(clock);
  const inSession = nowMinute >= toMinutes("09:00") && nowMinute <= toMinutes("15:00");
  const minutes = chartMinutes().filter((time) => isTradingMinute(time) && (!inSession || toMinutes(time) <= nowMinute));
  if (minutes.length === 0) return [];
  const random = seededRandom([...code].reduce((sum, char) => sum * 31 + char.charCodeAt(0), 7));
  const walk: number[] = [];
  let level = 0;
  for (let i = 0; i < minutes.length; i += 1) {
    level += random() - 0.5;
    walk.push(level);
  }
  const last = walk.length - 1;
  const end = walk[last];
  const startPct = 0;
  const endPct = snapshot.changePct;
  // Biên độ nhiễu khoảng 0,25% giá trị chỉ số.
  const scale = 0.25 / Math.max(1, Math.sqrt(minutes.length) / 2);
  const avgVolume = Math.max(1, snapshot.volume / minutes.length);
  return minutes.map((time, i) => {
    const t = last ? i / last : 1;
    const pct = startPct + (endPct - startPct) * t + (walk[i] - end * t) * scale;
    const value = i === last ? snapshot.value : Math.round(snapshot.ref * (1 + pct / 100) * 100) / 100;
    return { time, value, volume: Math.round(avgVolume * (0.4 + random() * 1.2)) };
  });
}
