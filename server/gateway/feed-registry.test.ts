import { describe, expect, it } from "vitest";
import type { FeedAdapter, FeedConnection, FeedEvents, FeedName } from "../../shared/feed";
import { FeedRegistry, type RegistryTimers } from "./feed-registry";

function fakeAdapter(name: FeedName) {
  let connection: FeedConnection = "stopped";
  const calls = { start: 0, stop: 0 };
  const adapter: FeedAdapter = {
    name,
    start() { calls.start += 1; connection = "open"; },
    stop() { calls.stop += 1; connection = "stopped"; },
    status: () => ({ feed: name, connection, lastMessageAt: null, messages: 0, rejected: 0, reconnects: 0 }),
  };
  return { adapter, calls };
}

// Đồng hồ giả: giữ hàm hẹn giờ, test tự gọi khi muốn "hết giờ".
function fakeTimers() {
  const pending = new Map<number, () => void>();
  let id = 0;
  const timers: RegistryTimers = {
    setTimeout: (fn) => { id += 1; pending.set(id, fn); return id; },
    clearTimeout: (handle) => { pending.delete(handle as number); },
  };
  const fire = () => { const fns = [...pending.values()]; pending.clear(); fns.forEach((fn) => fn()); };
  return { timers, fire, pending };
}

const noEvents = (): FeedEvents => ({ quote() {}, index() {}, indexHistory() {}, connection() {} });

describe("FeedRegistry", () => {
  it("nguồn alwaysOn mở ngay và không đóng khi hết người xem", () => {
    const { timers, fire } = fakeTimers();
    const registry = new FeedRegistry(noEvents, { timers });
    const mock = fakeAdapter("mock");
    registry.add(mock.adapter, true);
    registry.acquire("mock");
    registry.release("mock");
    fire();
    expect(mock.calls).toEqual({ start: 1, stop: 0 });
  });

  it("nguồn thường mở khi có người xem đầu tiên, một kết nối cho nhiều người xem", () => {
    const { timers } = fakeTimers();
    const registry = new FeedRegistry(noEvents, { timers });
    const ysflex = fakeAdapter("ysflex");
    registry.add(ysflex.adapter);
    expect(ysflex.calls.start).toBe(0);
    registry.acquire("ysflex");
    registry.acquire("ysflex");
    registry.acquire("ysflex");
    expect(ysflex.calls.start).toBe(1);
    expect(registry.status().find((status) => status.feed === "ysflex")).toMatchObject({ viewers: 3, connection: "open" });
  });

  it("hết người xem thì đóng sau khoảng chờ; có người quay lại trước đó thì không đóng", () => {
    const { timers, fire, pending } = fakeTimers();
    const registry = new FeedRegistry(noEvents, { timers });
    const ysflex = fakeAdapter("ysflex");
    registry.add(ysflex.adapter);
    registry.acquire("ysflex");
    registry.release("ysflex");
    expect(pending.size).toBe(1);
    registry.acquire("ysflex");
    expect(pending.size).toBe(0);
    registry.release("ysflex");
    fire();
    expect(ysflex.calls.stop).toBe(1);
    expect(registry.status()[0].connection).toBe("stopped");
    registry.acquire("ysflex");
    expect(ysflex.calls.start).toBe(2);
  });

  it("nguồn không đăng ký thì bỏ qua", () => {
    const registry = new FeedRegistry(noEvents);
    expect(registry.has("ysflex")).toBe(false);
    expect(() => registry.acquire("ysflex")).not.toThrow();
  });
});
