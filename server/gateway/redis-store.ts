import { createClient } from "redis";
import type { FeedName } from "../../shared/feed";
import type { Quote } from "../../shared/protocol";
import type { LatestStore, StoredQuote, StoreStatus } from "./latest-store";

// Bản Redis của LatestStore: hash "quotes:<feed>:latest", field là mã, value là JSON { quote, asOf }.
// Redis là tuỳ chọn: không bao giờ ném lỗi ra ngoài, mất kết nối thì gateway chạy tiếp bằng bộ nhớ.
// Ghi theo lô (một HSET cho cả lô), không ghi từng mã.

// Phần client mà store cần. Nhận diện tối thiểu để test truyền client giả, không cần Redis thật.
export interface RedisClientLike {
  readonly isReady?: boolean;
  on(event: "error", listener: (error: unknown) => void): unknown;
  connect(): Promise<unknown>;
  hSet(key: string, values: Record<string, string>): Promise<unknown>;
  hGetAll(key: string): Promise<Record<string, string> | Map<string, string>>;
  close(): Promise<unknown>;
}

export interface RedisStoreOptions {
  // Test truyền client giả; chạy thật thì createClient({ url }) của thư viện redis.
  client?: RedisClientLike;
  now?: () => number;
}

const keyOf = (feed: FeedName): string => `quotes:${feed}:latest`;

// Value hỏng (JSON lỗi, thiếu quote/asOf) thì bỏ qua và đếm vào errors, không làm hỏng cả lần nạp.
const parseStored = (value: string): StoredQuote | null => {
  try {
    const parsed = JSON.parse(value) as { quote?: Quote; asOf?: unknown };
    if (!parsed || typeof parsed.asOf !== "number" || !Number.isFinite(parsed.asOf)) return null;
    const quote = parsed.quote;
    if (!quote || typeof quote !== "object" || typeof quote.symbol !== "string") return null;
    return { quote, asOf: parsed.asOf };
  } catch {
    return null;
  }
};

export function createRedisStore(url: string, options: RedisStoreOptions = {}): LatestStore {
  const now = options.now ?? Date.now;
  const client = options.client ?? (createClient({ url }) as unknown as RedisClientLike);

  let connected = false;
  let errors = 0;
  let lastWriteAt: number | null = null;
  // Gộp các lần gọi connect đồng thời thành một lần thử, tránh mở nhiều kết nối.
  let connecting: Promise<boolean> | null = null;

  // Bắt buộc phải nghe "error", nếu không node-redis sẽ ném ra ngoài tiến trình.
  client.on("error", () => {
    connected = false;
    errors += 1;
  });

  const connect = async (): Promise<boolean> => {
    if (client.isReady) {
      connected = true;
      return true;
    }
    if (connecting) return connecting;
    const attempt: Promise<boolean> = Promise.resolve()
      .then(() => client.connect())
      .then(() => {
        connected = true;
        return true;
      })
      .catch(() => {
        connected = false;
        errors += 1;
        return false;
      })
      .finally(() => {
        connecting = null;
      });
    connecting = attempt;
    return attempt;
  };

  return {
    async load(feed: FeedName): Promise<StoredQuote[]> {
      if (!(await connect())) return [];
      try {
        const reply = await client.hGetAll(keyOf(feed));
        connected = true;
        const values = reply instanceof Map ? [...reply.values()] : Object.values(reply ?? {});
        const result: StoredQuote[] = [];
        for (const value of values) {
          const parsed = typeof value === "string" ? parseStored(value) : null;
          if (!parsed) {
            errors += 1;
            continue;
          }
          result.push(parsed);
        }
        return result;
      } catch {
        connected = false;
        errors += 1;
        return [];
      }
    },

    async save(feed: FeedName, entries: StoredQuote[]): Promise<void> {
      if (entries.length === 0) return;
      const values: Record<string, string> = {};
      for (const entry of entries) values[entry.quote.symbol] = JSON.stringify(entry);
      if (!(await connect())) return;
      try {
        // Một HSET cho cả lô: node-redis nhận object field -> value.
        await client.hSet(keyOf(feed), values);
        connected = true;
        lastWriteAt = now();
      } catch {
        connected = false;
        errors += 1;
      }
    },

    status(): StoreStatus {
      return { kind: "redis", connected, lastWriteAt, errors };
    },

    async close(): Promise<void> {
      try {
        await client.close();
      } catch {
        errors += 1;
      }
      connected = false;
    },
  };
}
