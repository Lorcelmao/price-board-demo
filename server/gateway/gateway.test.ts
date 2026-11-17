import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { FeedAdapter, FeedConnection, FeedEvents } from "../../shared/feed";
import type { Quote, ServerMessage } from "../../shared/protocol";
import { startMockServer, type MockServer } from "../index";
import { seededRandom } from "../market-simulator";

// Nguồn Yuanta giả: test tự đẩy tin qua events đã nhận lúc start.
function fakeYsflex() {
  let events: FeedEvents | null = null;
  let connection: FeedConnection = "stopped";
  const calls = { start: 0, stop: 0 };
  const adapter: FeedAdapter = {
    name: "ysflex",
    start(next) { calls.start += 1; events = next; connection = "open"; },
    stop() { calls.stop += 1; events = null; connection = "stopped"; },
    status: () => ({ feed: "ysflex", connection, lastMessageAt: null, messages: 0, rejected: 0, reconnects: 0 }),
  };
  return { adapter, calls, emit: () => events };
}

let server: MockServer;
let ysflex: ReturnType<typeof fakeYsflex>;
let base = "";

beforeEach(async () => {
  ysflex = fakeYsflex();
  server = await startMockServer({ port: 0, tickMs: 60_000, random: seededRandom(5), feeds: [ysflex.adapter], idleMs: 50 });
  base = `http://localhost:${server.port}`;
});

afterEach(async () => {
  await server.close();
});

const wait = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

async function openSocket(sub: { symbols: string[]; feed?: string }) {
  const socket = new WebSocket(`ws://localhost:${server.port}/ws`);
  const messages: ServerMessage[] = [];
  socket.on("message", (raw) => messages.push(JSON.parse(String(raw))));
  await new Promise((resolve) => socket.once("open", resolve));
  socket.send(JSON.stringify({ op: "sub", ...sub }));
  await wait();
  return { socket, messages };
}

const quotesOf = (messages: ServerMessage[]) =>
  messages.filter((message): message is Extract<ServerMessage, { topic: "QUOTE" }> => "topic" in message && message.topic === "QUOTE");

describe("gateway: nguồn mock", () => {
  it("đăng ký mã thì nhận ngay ảnh chụp từ cache bằng tin QUOTE", async () => {
    const { socket, messages } = await openSocket({ symbols: ["FPT"] });
    const fpt = quotesOf(messages).find((message) => message.symbol === "FPT");
    expect(fpt?.feed).toBe("mock");
    expect(fpt?.patch.ref).toBeGreaterThan(0);
    expect(messages.some((message) => "topic" in message && message.topic === "INDEX")).toBe(true);
    socket.close();
  });

  it("GET /api/quotes trả giá trong cache, lọc được theo mã", async () => {
    const all = (await (await fetch(`${base}/api/quotes?feed=mock`)).json()) as Quote[];
    expect(all.length).toBe(50);
    const some = (await (await fetch(`${base}/api/quotes?symbols=fpt,VCB`)).json()) as Quote[];
    expect(some.map((quote) => quote.symbol).sort()).toEqual(["FPT", "VCB"]);
    expect((await fetch(`${base}/api/quotes/FPT`)).status).toBe(200);
    expect((await fetch(`${base}/api/quotes/ZZZ`)).status).toBe(404);
    expect((await fetch(`${base}/api/quotes?feed=khac`)).status).toBe(400);
  });

  it("lịch sử chỉ số trong ngày lấy theo nguồn", async () => {
    const points = (await (await fetch(`${base}/api/index-intraday/VNI?feed=mock`)).json()) as unknown[];
    expect(points.length).toBeGreaterThan(0);
  });
});

describe("gateway: nguồn Yuanta", () => {
  it("chỉ mở khi có người xem, ba tab dùng chung một nguồn", async () => {
    expect(ysflex.calls.start).toBe(0);
    const tabs = await Promise.all([1, 2, 3].map(() => openSocket({ symbols: ["FPT"], feed: "ysflex" })));
    expect(ysflex.calls.start).toBe(1);
    const status = (await (await fetch(`${base}/api/feed-status`)).json()) as Array<{ feed: string; viewers: number }>;
    expect(status.find((item) => item.feed === "ysflex")?.viewers).toBe(3);
    tabs.forEach(({ socket }) => socket.close());
  });

  it("tin của nguồn chỉ đến đúng kết nối theo nguồn đó và đúng mã đã đăng ký", async () => {
    const yuanta = await openSocket({ symbols: ["FPT"], feed: "ysflex" });
    const mock = await openSocket({ symbols: ["FPT"] });
    ysflex.emit()!.quote("FPT", { ref: 49_400, last: 48_500, foreignBuyValue: 924_006_547 });
    ysflex.emit()!.quote("VCB", { last: 1 });
    await wait();
    const received = quotesOf(yuanta.messages);
    expect(received.map((message) => message.symbol)).toEqual(["FPT"]);
    expect(received[0]).toMatchObject({ feed: "ysflex", patch: { last: 48_500, foreignBuyValue: 924_006_547 } });
    expect(quotesOf(mock.messages).some((message) => message.feed === "ysflex")).toBe(false);
    yuanta.socket.close();
    mock.socket.close();
  });

  it("tab mới mở sau đó nhận ngay giá đã có trong cache", async () => {
    const first = await openSocket({ symbols: ["FPT"], feed: "ysflex" });
    ysflex.emit()!.quote("FPT", { ref: 49_400, last: 48_500 });
    await wait();
    const second = await openSocket({ symbols: ["FPT"], feed: "ysflex" });
    expect(quotesOf(second.messages)[0]?.patch).toMatchObject({ ref: 49_400, last: 48_500 });
    const rest = (await (await fetch(`${base}/api/quotes/FPT?feed=ysflex`)).json()) as Quote;
    expect(rest.last).toBe(48_500);
    first.socket.close();
    second.socket.close();
  });

  it("tin rác bị loại và đếm vào rejected", async () => {
    const tab = await openSocket({ symbols: ["FPT"], feed: "ysflex" });
    ysflex.emit()!.quote("FPT", { last: Number.NaN });
    await wait();
    expect(quotesOf(tab.messages)).toHaveLength(0);
    const status = (await (await fetch(`${base}/api/feed-status`)).json()) as Array<{ feed: string; rejected: number }>;
    expect(status.find((item) => item.feed === "ysflex")?.rejected).toBe(1);
    tab.socket.close();
  });

  it("đóng hết tab thì nguồn đóng sau khoảng chờ", async () => {
    const tab = await openSocket({ symbols: ["FPT"], feed: "ysflex" });
    tab.socket.close();
    await wait(200);
    expect(ysflex.calls.stop).toBe(1);
  });
});
