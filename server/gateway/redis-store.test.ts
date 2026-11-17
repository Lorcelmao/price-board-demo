import { describe, expect, it } from "vitest";
import { createClient } from "redis";
import { emptyQuote } from "../../shared/protocol";
import type { StoredQuote } from "./latest-store";
import { createRedisStore, type RedisClientLike } from "./redis-store";

// Client giả: giữ dữ liệu trong Map, ghi lại lệnh đã gọi, có công tắc fail để thử mất Redis.
class FakeRedis implements RedisClientLike {
  ready = false;
  fail = false;
  readonly data = new Map<string, Record<string, string>>();
  readonly calls: Array<{ method: string; key?: string }> = [];
  connectCalls = 0;
  closeCalls = 0;
  private readonly errorListeners: Array<(error: unknown) => void> = [];

  get isReady(): boolean {
    return this.ready;
  }

  on(event: "error", listener: (error: unknown) => void): void {
    if (event === "error") this.errorListeners.push(listener);
  }

  async connect(): Promise<void> {
    this.connectCalls += 1;
    if (this.fail) throw new Error("Redis không sẵn sàng");
    this.ready = true;
  }

  async hSet(key: string, values: Record<string, string>): Promise<void> {
    this.calls.push({ method: "hSet", key });
    if (this.fail) throw new Error("mất kết nối");
    this.data.set(key, { ...(this.data.get(key) ?? {}), ...values });
  }

  async hGetAll(key: string): Promise<Record<string, string>> {
    this.calls.push({ method: "hGetAll", key });
    if (this.fail) throw new Error("mất kết nối");
    return { ...(this.data.get(key) ?? {}) };
  }

  async close(): Promise<void> {
    this.closeCalls += 1;
    this.ready = false;
  }

  emitError(error: unknown): void {
    for (const listener of this.errorListeners) listener(error);
  }
}

const entry = (symbol: string, last: number, asOf = 1): StoredQuote => ({
  quote: { ...emptyQuote(symbol), last },
  asOf,
});

const makeStore = (client: FakeRedis, now: () => number = () => 42) =>
  createRedisStore("redis://localhost:6379", { client, now });

describe("RedisStore", () => {
  it("save rồi load trả đúng dữ liệu, mỗi nguồn một key riêng", async () => {
    const client = new FakeRedis();
    const store = makeStore(client);

    await store.save("ysflex", [entry("FPT", 1, 10), entry("VCB", 2, 20)]);
    const writes = client.calls.filter((call) => call.method === "hSet");
    expect(writes).toHaveLength(1);
    expect(writes[0].key).toBe("quotes:ysflex:latest");

    const loaded = await store.load("ysflex");
    expect(loaded.map((item) => [item.quote.symbol, item.quote.last, item.asOf])).toEqual([
      ["FPT", 1, 10],
      ["VCB", 2, 20],
    ]);
    expect(store.status()).toMatchObject({ kind: "redis", connected: true, lastWriteAt: 42, errors: 0 });

    await store.save("mock", [entry("SSI", 3, 30)]);
    expect(client.calls.filter((call) => call.method === "hSet").at(-1)?.key).toBe("quotes:mock:latest");
    expect((await store.load("mock")).map((item) => item.quote.symbol)).toEqual(["SSI"]);
    expect((await store.load("ysflex")).map((item) => item.quote.symbol)).toEqual(["FPT", "VCB"]);
  });

  it("lô rỗng không gọi client, kể cả connect", async () => {
    const client = new FakeRedis();
    const store = makeStore(client);

    await store.save("ysflex", []);

    expect(client.calls).toHaveLength(0);
    expect(client.connectCalls).toBe(0);
  });

  it("value hỏng bị bỏ qua và đếm vào errors", async () => {
    const client = new FakeRedis();
    const store = makeStore(client);
    client.data.set("quotes:ysflex:latest", {
      GOOD: JSON.stringify(entry("FPT", 1, 10)),
      BAD_JSON: "{không phải json",
      MISSING_ASOF: JSON.stringify({ quote: emptyQuote("VCB") }),
      MISSING_QUOTE: JSON.stringify({ asOf: 5 }),
    });

    const loaded = await store.load("ysflex");

    expect(loaded.map((item) => item.quote.symbol)).toEqual(["FPT"]);
    expect(store.status().errors).toBe(3);
    expect(store.status().connected).toBe(true);
  });

  it("client ném lỗi thì save/load không ném, connected=false và errors tăng", async () => {
    const client = new FakeRedis();
    const store = makeStore(client);
    client.fail = true;

    await expect(store.load("ysflex")).resolves.toEqual([]);
    await expect(store.save("ysflex", [entry("FPT", 1)])).resolves.toBeUndefined();

    expect(store.status().connected).toBe(false);
    expect(store.status().errors).toBeGreaterThan(0);

    // Redis sống lại: lần ghi sau nối được và connected trở lại true.
    const errorsBefore = store.status().errors;
    client.fail = false;
    await store.save("ysflex", [entry("FPT", 2)]);

    expect(store.status().connected).toBe(true);
    expect(store.status().errors).toBe(errorsBefore);
    expect((await store.load("ysflex")).map((item) => item.quote.last)).toEqual([2]);
  });

  it("sự kiện error của client cũng đánh dấu mất kết nối", async () => {
    const client = new FakeRedis();
    const store = makeStore(client);
    await store.save("ysflex", [entry("FPT", 1)]);
    expect(store.status().connected).toBe(true);

    client.emitError(new Error("socket closed"));

    expect(store.status().connected).toBe(false);
    expect(store.status().errors).toBe(1);
  });

  it("close đóng client và báo mất kết nối", async () => {
    const client = new FakeRedis();
    const store = makeStore(client);
    await store.save("ysflex", [entry("FPT", 1)]);

    await store.close();

    expect(client.closeCalls).toBe(1);
    expect(store.status().connected).toBe(false);
  });

  // Chỉ chạy khi có Redis thật: REDIS_URL=redis://localhost:6379 npx vitest run server/gateway
  it.skipIf(!process.env.REDIS_URL)("ghi rồi đọc thật trên Redis", async () => {
    const store = createRedisStore(process.env.REDIS_URL as string);
    const symbol = `__TEST_${Date.now()}`;
    try {
      await store.save("mock", [entry(symbol, 123, 456)]);
      expect(store.status().connected).toBe(true);
      const loaded = await store.load("mock");
      expect(loaded.find((item) => item.quote.symbol === symbol)).toMatchObject({ asOf: 456 });
    } finally {
      await store.close();
      // Xoá mã thử để test không để lại rác trong Redis (kể cả Redis trên cloud).
      const cleaner = createClient({ url: process.env.REDIS_URL });
      await cleaner.connect();
      await cleaner.hDel("quotes:mock:latest", symbol);
      await cleaner.close();
    }
  });
});
