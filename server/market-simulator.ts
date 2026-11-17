import {
  calcLimits,
  effectivePhase,
  priceAbove,
  priceBelow,
  type Exchange,
  type SessionPhase,
  type Side,
} from "../shared/market-rules";
import {
  TOPIC,
  type BookLevel,
  type EpWire,
  type Instrument,
  type IntradayBucket,
  type MarketWire,
  type MdWire,
  type ProfileLevel,
  type SiWire,
  type StWire,
} from "../shared/protocol";
import { INSTRUMENT_SEED, NO_ROOM_SYMBOL } from "./instruments";

const BOOK_DEPTH = 10;
const BOARD_LOT = 100;

export interface SymbolState extends Instrument {
  last: number | null;
  expected: number;
  open: number;
  high: number;
  low: number;
  totalVolume: number;
  totalValue: number;
  foreignBuy: number;
  foreignSell: number;
  room: number;
  lastVolume: number;
  lastSide: Side;
  lastTime: number;
  bookVolumes: Map<number, number>;
  bids: BookLevel[];
  asks: BookLevel[];
  intraday: Map<string, number>;
  profile: Map<number, number>;
}

// Bộ sinh số ngẫu nhiên có seed, để test chạy lại cho đúng cùng kết quả.
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const minuteKey = (time: number) => {
  const date = new Date(time);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

type TradeListener = (state: SymbolState) => void;
type MarketListener = (message: MarketWire) => void;

export class MarketSimulator {
  readonly symbols = new Map<string, SymbolState>();
  phase: SessionPhase = "CONTINUOUS";
  private readonly marketListeners = new Set<MarketListener>();
  private readonly tradeListeners = new Set<TradeListener>();

  constructor(private readonly random: () => number = Math.random) {
    for (const [symbol, exchange, ref, name] of INSTRUMENT_SEED) {
      const state = this.createSymbol(symbol, exchange, ref, name);
      this.symbols.set(symbol, state);
      this.seedHistory(state);
      this.rebuildBook(state);
    }
  }

  onMarket(listener: MarketListener): () => void {
    this.marketListeners.add(listener);
    return () => this.marketListeners.delete(listener);
  }

  onTrade(listener: TradeListener): () => void {
    this.tradeListeners.add(listener);
    return () => this.tradeListeners.delete(listener);
  }

  get(symbol: string): SymbolState | undefined {
    return this.symbols.get(symbol);
  }

  instruments(): Instrument[] {
    return [...this.symbols.values()].map(({ symbol, name, exchange, ref, ceil, floor }) => ({
      symbol,
      name,
      exchange,
      ref,
      ceil,
      floor,
    }));
  }

  // Ảnh chụp đầy đủ cho client vừa đăng ký: trần sàn, tick gần nhất và sổ lệnh.
  snapshot(symbol: string): MarketWire[] {
    const state = this.symbols.get(symbol);
    if (!state) return [];
    const messages: MarketWire[] = [this.toSt(state), this.toMd(state)];
    if (state.last !== null) messages.splice(1, 0, this.toSi(state));
    if (effectivePhase(state.exchange, this.phase) !== "CONTINUOUS" && this.phase !== "CLOSED") {
      messages.push(this.toEp(state));
    }
    return messages;
  }

  intraday(symbol: string): IntradayBucket[] {
    const state = this.symbols.get(symbol);
    if (!state) return [];
    return [...state.intraday.entries()].map(([minute, volume]) => ({ minute, volume }));
  }

  volumeProfile(symbol: string): ProfileLevel[] {
    const state = this.symbols.get(symbol);
    if (!state) return [];
    return [...state.profile.entries()]
      .map(([price, volume]) => ({ price, volume }))
      .sort((a, b) => b.price - a.price);
  }

  // Vào đợt định kỳ thì giá dự khớp xuất phát từ giá khớp gần nhất.
  setPhase(phase: SessionPhase): void {
    this.phase = phase;
    if (phase !== "ATO" && phase !== "ATC") return;
    for (const state of this.symbols.values()) state.expected = state.last ?? state.ref;
  }

  // Mỗi nhịp, vài mã ngẫu nhiên có biến động. Đợt khớp liên tục sinh tick khớp, đợt định kỳ chỉ sinh giá dự kiến.
  tick(activeCount = 12): void {
    const all = [...this.symbols.values()];
    for (let i = 0; i < activeCount; i++) {
      const state = all[Math.floor(this.random() * all.length)];
      const phase = effectivePhase(state.exchange, this.phase);
      if (phase === "CONTINUOUS") this.simulateTrade(state);
      else if (phase === "ATO" || phase === "ATC") this.simulateExpected(state);
    }
  }

  // Ghi nhận một giao dịch: do thị trường tự sinh, do lệnh của người dùng khớp, hoặc do chốt đợt định kỳ.
  recordTrade(symbol: string, price: number, volume: number, side: Side, time = Date.now()): void {
    const state = this.symbols.get(symbol);
    if (!state) return;
    state.last = price;
    state.lastVolume = volume;
    state.lastSide = side;
    state.lastTime = time;
    if (state.open === 0) state.open = price;
    state.high = Math.max(state.high, price);
    state.low = state.low === 0 ? price : Math.min(state.low, price);
    state.totalVolume += volume;
    state.totalValue += price * volume;
    state.profile.set(price, (state.profile.get(price) ?? 0) + volume);
    const minute = minuteKey(time);
    state.intraday.set(minute, (state.intraday.get(minute) ?? 0) + volume);
    this.rebuildBook(state);
    this.emit(this.toSi(state));
    this.emit(this.toMd(state));
    for (const listener of this.tradeListeners) listener(state);
  }

  // Lệnh người dùng ăn hết một phần thanh khoản ở một mức giá.
  takeLiquidity(symbol: string, price: number, volume: number): void {
    const state = this.symbols.get(symbol);
    if (!state) return;
    const remaining = (state.bookVolumes.get(price) ?? 0) - volume;
    if (remaining > 0) state.bookVolumes.set(price, remaining);
    else state.bookVolumes.delete(price);
  }

  private createSymbol(symbol: string, exchange: Exchange, ref: number, name: string): SymbolState {
    const { ceil, floor } = calcLimits(ref, exchange);
    return {
      symbol,
      name,
      exchange,
      ref,
      ceil,
      floor,
      last: null,
      expected: ref,
      open: 0,
      high: 0,
      low: 0,
      totalVolume: 0,
      totalValue: 0,
      foreignBuy: 0,
      foreignSell: 0,
      room: symbol === NO_ROOM_SYMBOL ? 0 : Math.floor(this.random() * 50_000) * BOARD_LOT,
      lastVolume: 0,
      lastSide: "BUY",
      lastTime: 0,
      bookVolumes: new Map(),
      bids: [],
      asks: [],
      intraday: new Map(),
      profile: new Map(),
    };
  }

  // Dựng sẵn khoảng 30 phút giao dịch để biểu đồ trong ngày không trống lúc mới mở.
  private seedHistory(state: SymbolState): void {
    let price = state.ref;
    const start = Date.now() - 30 * 60_000;
    for (let minute = 0; minute < 30; minute++) {
      const volume = (1 + Math.floor(this.random() * 40)) * BOARD_LOT;
      price = this.nextWalkPrice(state, price);
      const time = start + minute * 60_000;
      if (state.open === 0) state.open = price;
      state.high = Math.max(state.high, price);
      state.low = state.low === 0 ? price : Math.min(state.low, price);
      state.totalVolume += volume;
      state.totalValue += price * volume;
      state.profile.set(price, (state.profile.get(price) ?? 0) + volume);
      state.intraday.set(minuteKey(time), volume);
      state.last = price;
      state.lastVolume = volume;
      state.lastTime = time;
    }
    state.expected = price;
  }

  private nextWalkPrice(state: SymbolState, from: number): number {
    const roll = this.random();
    let next = from;
    if (roll < 0.35) next = priceBelow(from, state.exchange);
    else if (roll > 0.65) next = priceAbove(from, state.exchange);
    return Math.min(state.ceil, Math.max(state.floor, next));
  }

  private simulateTrade(state: SymbolState): void {
    const current = state.last ?? state.ref;
    const price = this.nextWalkPrice(state, current);
    const volume = (1 + Math.floor(this.random() * 50)) * BOARD_LOT;
    const side: Side = price >= current ? "BUY" : "SELL";
    if (this.random() < 0.3) {
      const foreign = (1 + Math.floor(this.random() * 10)) * BOARD_LOT;
      if (this.random() < 0.5) {
        state.foreignBuy += foreign;
        state.room = Math.max(0, state.room - foreign);
      } else {
        state.foreignSell += foreign;
        if (state.symbol !== NO_ROOM_SYMBOL) state.room += foreign;
      }
    }
    this.recordTrade(state.symbol, price, volume, side);
  }

  private simulateExpected(state: SymbolState): void {
    state.expected = this.nextWalkPrice(state, state.expected);
    this.rebuildBook(state);
    this.emit(this.toEp(state));
    this.emit(this.toMd(state));
  }

  // Dựng lại 10 mức giá mỗi bên quanh giá hiện tại. Mức cũ vẫn giữ khối lượng và chỉ vài mức thay đổi,
  // để giao diện thấy được đúng mức nào vừa đổi thay vì nhấp nháy cả bảng.
  private rebuildBook(state: SymbolState): void {
    const center = effectivePhase(state.exchange, this.phase) === "CONTINUOUS"
      ? (state.last ?? state.ref)
      : state.expected;
    const asks = this.buildSide(state, center, priceAbove, (price) => price <= state.ceil);
    const firstBid = center > state.floor ? priceBelow(center, state.exchange) : center;
    const bids = this.buildSide(state, firstBid, priceBelow, (price) => price >= state.floor);
    state.asks = asks;
    state.bids = bids;
    const kept = new Set([...asks, ...bids].map(([price]) => price));
    for (const price of state.bookVolumes.keys()) if (!kept.has(price)) state.bookVolumes.delete(price);
  }

  private buildSide(
    state: SymbolState,
    start: number,
    step: (price: number, exchange: Exchange) => number,
    inRange: (price: number) => boolean,
  ): BookLevel[] {
    const levels: BookLevel[] = [];
    let price = start;
    while (levels.length < BOOK_DEPTH && inRange(price)) {
      let volume = state.bookVolumes.get(price);
      if (volume === undefined || this.random() < 0.2) {
        volume = (1 + Math.floor(this.random() * 800)) * BOARD_LOT;
        state.bookVolumes.set(price, volume);
      }
      levels.push([price, volume]);
      price = step(price, state.exchange);
    }
    return levels;
  }

  private emit(message: MarketWire): void {
    for (const listener of this.marketListeners) listener(message);
  }

  private toSt(state: SymbolState): StWire {
    return {
      topic: TOPIC.ST,
      t55: state.symbol,
      exchange: state.exchange,
      t260: state.ref,
      t332: state.ceil,
      t333: state.floor,
      room: state.room,
    };
  }

  private toSi(state: SymbolState): SiWire {
    return {
      topic: TOPIC.SI,
      t55: state.symbol,
      t31: state.last ?? state.ref,
      t32: state.lastVolume,
      t391: state.totalVolume,
      t631: state.totalVolume === 0 ? 0 : Math.round(state.totalValue / state.totalVolume),
      t266: state.high,
      t2661: state.low,
      t137: state.open,
      t397: state.foreignBuy,
      t398: state.foreignSell,
      room: state.room,
      side: state.lastSide,
      time: state.lastTime,
    };
  }

  private toEp(state: SymbolState): EpWire {
    return {
      topic: TOPIC.EP,
      t55: state.symbol,
      expectedPrice: state.expected,
      expectedVolume: (state.bids[0]?.[1] ?? 0) + (state.asks[0]?.[1] ?? 0),
    };
  }

  private toMd(state: SymbolState): MdWire {
    return { topic: TOPIC.MD, t55: state.symbol, bids: state.bids, asks: state.asks };
  }
}
