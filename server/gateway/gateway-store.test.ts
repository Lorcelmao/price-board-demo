import { afterEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { FeedAdapter, FeedConnection, FeedEvents, FeedHistory } from "../../shared/feed";
import { emptyQuote, type ServerMessage } from "../../shared/protocol";
import { startMockServer, type MockServer } from "../index";
import { seededRandom } from "../market-simulator";
import { MemoryStore } from "./latest-store";

// Nguồn Yuanta giả, có lịch sử theo mã giả.
function fakeYsflex(history?: FeedHistory) {
  let events: FeedEvents | null = null;
  let connection: FeedConnection = "stopped";
  const adapter: FeedAdapter = {
    name: "ysflex",
    start(next) { events = next; connection = "open"; },
    stop() { events = null; connection = "stopped"; },
    status: () => ({ feed: "ysflex", connection, lastMessageAt: null, messages: 0, rejected: 0, reconnects: 0 }),
    history,
  };
  return { adapter, emit: () => events };
}

const wait = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));
const servers: MockServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function start(options: Parameters<typeof startMockServer>[0]) {
  const server = await startMockServer({ port: 0, tickMs: 60_000, random: seededRandom(9), ...options });
  servers.push(server);
  return { server, base: `http://localhost:${server.port}` };
}

async function openSocket(port: number, sub: object) {
  const socket = new WebSocket(`ws://localhost:${port}/ws`);
  const messages: ServerMessage[] = [];
  socket.on("message", (raw) => messages.push(JSON.parse(String(raw))));
  await new Promise((resolve) => socket.once("open", resolve));
  socket.send(JSON.stringify({ op: "sub", ...sub }));
  await wait();
  return { socket, messages };
}

describe("gateway: giữ giá qua lần khởi động lại", () => {
  it("giá nạp từ store có stale: true cho tới khi nguồn gửi giá mới", async () => {
    const store = new MemoryStore();
    await store.save("ysflex", [{ quote: { ...emptyQuote("FPT"), ref: 49_400, last: 48_500 }, asOf: 1_000 }]);
    const ysflex = fakeYsflex();
    const { server, base } = await start({ feeds: [ysflex.adapter], store });

    const before = (await (await fetch(`${base}/api/quotes/FPT?feed=ysflex`)).json()) as { last: number; stale: boolean; asOf: number };
    expect(before).toMatchObject({ last: 48_500, stale: true, asOf: 1_000 });

    // Tab mở trang nhận ngay giá cũ qua WS, có cờ stale.
    const tab = await openSocket(server.port, { symbols: ["FPT"], feed: "ysflex" });
    const first = tab.messages.find((message) => "topic" in message && message.topic === "QUOTE");
    expect(first).toMatchObject({ symbol: "FPT", stale: true });

    ysflex.emit()!.quote("FPT", { last: 48_600 });
    await wait();
    const after = (await (await fetch(`${base}/api/quotes/FPT?feed=ysflex`)).json()) as { last: number; stale: boolean };
    expect(after).toMatchObject({ last: 48_600, stale: false });
    tab.socket.close();
  });

  it("ghi store theo lô và chỉ ghi nguồn thật, không ghi nguồn mock", async () => {
    const store = new MemoryStore();
    let saves = 0;
    const save = store.save.bind(store);
    store.save = async (feed, entries) => {
      saves += 1;
      expect(feed).toBe("ysflex");
      return save(feed, entries);
    };
    const ysflex = fakeYsflex();
    const { server } = await start({ feeds: [ysflex.adapter], store, storeIntervalMs: 100 });
    const tab = await openSocket(server.port, { symbols: ["FPT"], feed: "ysflex" });
    for (let i = 0; i < 100; i += 1) ysflex.emit()!.quote("FPT", { last: 48_000 + i * 50 });
    await wait(250);
    expect(saves).toBe(1);
    expect((await store.load("ysflex"))[0].quote.last).toBe(48_000 + 99 * 50);
    tab.socket.close();
  });

  it("feed-status kèm trạng thái store", async () => {
    const { base } = await start({ feeds: [fakeYsflex().adapter] });
    const status = (await (await fetch(`${base}/api/feed-status`)).json()) as { store: { kind: string; connected: boolean } };
    expect(status.store).toMatchObject({ kind: "memory", connected: true });
  });
});

describe("gateway: lịch sử theo mã", () => {
  const history: FeedHistory = {
    intraday: async (symbol) => [{ time: "09:16", open: 1, high: 2, low: 1, close: 2, volume: symbol === "FPT" ? 100 : 1 }],
    trades: async (_symbol, options) => [{ time: "14:45:00", price: 48_500, volume: options?.size ?? 0, side: "BUY", seq: 7 }],
  };

  it("nguồn có lịch sử trả nến 1 phút và lệnh khớp", async () => {
    const { base } = await start({ feeds: [fakeYsflex(history).adapter] });
    const candles = (await (await fetch(`${base}/api/intraday-candles/FPT?feed=ysflex`)).json()) as Array<{ volume: number }>;
    expect(candles[0].volume).toBe(100);
    const ticks = (await (await fetch(`${base}/api/trades/FPT?feed=ysflex&size=20`)).json()) as Array<{ volume: number; side: string }>;
    expect(ticks[0]).toMatchObject({ volume: 20, side: "BUY" });
  });

  it("nguồn mock không có lịch sử theo mã thì 404", async () => {
    const { base } = await start({ feeds: [fakeYsflex(history).adapter] });
    expect((await fetch(`${base}/api/intraday-candles/FPT?feed=mock`)).status).toBe(404);
    expect((await fetch(`${base}/api/trades/FPT`)).status).toBe(404);
  });

  it("nguồn lỗi thì 503; nhiều yêu cầu trong lúc cache còn hạn chỉ gọi nguồn một lần", async () => {
    let calls = 0;
    const flaky: FeedHistory = {
      intraday: async () => { calls += 1; return []; },
      trades: async () => { throw new Error("chưa mở"); },
    };
    const { base } = await start({ feeds: [fakeYsflex(flaky).adapter] });
    await Promise.all([1, 2, 3].map(() => fetch(`${base}/api/intraday-candles/FPT?feed=ysflex`)));
    expect(calls).toBe(1);
    expect((await fetch(`${base}/api/trades/FPT?feed=ysflex`)).status).toBe(503);
  });
});
