import { describe, expect, it } from "vitest";
import { isOnTick } from "../shared/market-rules";
import { TOPIC, type MarketWire } from "../shared/protocol";
import { MarketSimulator, seededRandom } from "./market-simulator";

describe("MarketSimulator", () => {
  it("có đúng 50 mã, gồm 5 mã quen thuộc", () => {
    const market = new MarketSimulator(seededRandom(1));
    expect(market.symbols.size).toBe(50);
    for (const symbol of ["VCB", "FPT", "VPB", "HPG", "SSI"]) expect(market.get(symbol)).toBeDefined();
  });

  it("sau nhiều nhịp, giá luôn trong biên độ và đúng bước giá", () => {
    const market = new MarketSimulator(seededRandom(2));
    for (let i = 0; i < 2_000; i++) market.tick();
    for (const state of market.symbols.values()) {
      const last = state.last ?? state.ref;
      expect(last).toBeLessThanOrEqual(state.ceil);
      expect(last).toBeGreaterThanOrEqual(state.floor);
      expect(isOnTick(last, state.exchange)).toBe(true);
    }
  });

  it("sổ lệnh không vượt 10 mức, sắp đúng thứ tự, không ra ngoài biên độ", () => {
    const market = new MarketSimulator(seededRandom(3));
    for (let i = 0; i < 500; i++) market.tick();
    for (const state of market.symbols.values()) {
      expect(state.bids.length).toBeLessThanOrEqual(10);
      expect(state.asks.length).toBeLessThanOrEqual(10);
      for (let i = 1; i < state.asks.length; i++) expect(state.asks[i][0]).toBeGreaterThan(state.asks[i - 1][0]);
      for (let i = 1; i < state.bids.length; i++) expect(state.bids[i][0]).toBeLessThan(state.bids[i - 1][0]);
      if (state.asks.length) expect(state.asks.at(-1)![0]).toBeLessThanOrEqual(state.ceil);
      if (state.bids.length) expect(state.bids.at(-1)![0]).toBeGreaterThanOrEqual(state.floor);
    }
  });

  it("đợt khớp liên tục sinh SI, đợt định kỳ của HOSE chỉ sinh EP", () => {
    const market = new MarketSimulator(seededRandom(4));
    const seen: MarketWire[] = [];
    market.onMarket((message) => seen.push(message));

    for (let i = 0; i < 20; i++) market.tick();
    expect(seen.some((message) => message.topic === TOPIC.SI)).toBe(true);

    seen.length = 0;
    market.setPhase("ATO");
    for (let i = 0; i < 20; i++) market.tick();
    const hoseSymbols = new Set([...market.symbols.values()].filter((s) => s.exchange === "HOSE").map((s) => s.symbol));
    expect(seen.some((message) => message.topic === TOPIC.EP)).toBe(true);
    expect(seen.some((message) => message.topic === TOPIC.SI && hoseSymbols.has(message.t55))).toBe(false);
  });

  it("đóng cửa thì không có tin nào", () => {
    const market = new MarketSimulator(seededRandom(5));
    const seen: MarketWire[] = [];
    market.onMarket((message) => seen.push(message));
    market.setPhase("CLOSED");
    for (let i = 0; i < 20; i++) market.tick();
    expect(seen).toEqual([]);
  });

  it("ảnh chụp có trần sàn trước, để client tính được phần trăm ngay", () => {
    const market = new MarketSimulator(seededRandom(6));
    const snapshot = market.snapshot("FPT");
    expect(snapshot[0].topic).toBe(TOPIC.ST);
    expect(snapshot.some((message) => message.topic === TOPIC.MD)).toBe(true);
  });

  it("khối lượng theo phút cộng lại bằng tổng khớp", () => {
    const market = new MarketSimulator(seededRandom(8));
    for (let i = 0; i < 300; i++) market.tick();
    const state = market.get("FPT")!;
    const fromProfile = market.volumeProfile("FPT").reduce((sum, level) => sum + level.volume, 0);
    expect(fromProfile).toBe(state.totalVolume);
  });
});
