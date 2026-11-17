import type { FeedAdapter, FeedEvents, FeedName, FeedStatus } from "../../shared/feed";

// Quản lý vòng đời các nguồn giá: nguồn mở khi có người xem đầu tiên, đóng sau một khoảng
// không còn ai xem. Nguồn "alwaysOn" (mock, vì bộ khớp lệnh cần giá) mở ngay và không bao giờ đóng.

export interface RegistryTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const REAL_TIMERS: RegistryTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

interface Entry {
  adapter: FeedAdapter;
  alwaysOn: boolean;
  running: boolean;
  viewers: number;
  idleTimer: unknown;
}

export interface FeedRegistryOptions {
  idleMs?: number;
  timers?: RegistryTimers;
}

export class FeedRegistry {
  private readonly entries = new Map<FeedName, Entry>();
  private readonly idleMs: number;
  private readonly timers: RegistryTimers;

  constructor(
    private readonly eventsFor: (feed: FeedName) => FeedEvents,
    options: FeedRegistryOptions = {},
  ) {
    this.idleMs = options.idleMs ?? 60_000;
    this.timers = options.timers ?? REAL_TIMERS;
  }

  add(adapter: FeedAdapter, alwaysOn = false): void {
    const entry: Entry = { adapter, alwaysOn, running: false, viewers: 0, idleTimer: null };
    this.entries.set(adapter.name, entry);
    if (alwaysOn) this.start(entry);
  }

  has(feed: FeedName): boolean {
    return this.entries.has(feed);
  }

  // Một người xem bắt đầu theo nguồn này.
  acquire(feed: FeedName): void {
    const entry = this.entries.get(feed);
    if (!entry) return;
    entry.viewers += 1;
    if (entry.idleTimer !== null) {
      this.timers.clearTimeout(entry.idleTimer);
      entry.idleTimer = null;
    }
    this.start(entry);
  }

  // Một người xem rời đi. Hết người xem thì hẹn giờ đóng nguồn.
  release(feed: FeedName): void {
    const entry = this.entries.get(feed);
    if (!entry || entry.viewers === 0) return;
    entry.viewers -= 1;
    if (entry.viewers > 0 || entry.alwaysOn || !entry.running) return;
    entry.idleTimer = this.timers.setTimeout(() => {
      entry.idleTimer = null;
      if (entry.viewers === 0 && entry.running) {
        entry.adapter.stop();
        entry.running = false;
      }
    }, this.idleMs);
  }

  status(): Array<FeedStatus & { viewers: number }> {
    return [...this.entries.values()].map((entry) => ({ ...entry.adapter.status(), viewers: entry.viewers }));
  }

  stopAll(): void {
    for (const entry of this.entries.values()) {
      if (entry.idleTimer !== null) this.timers.clearTimeout(entry.idleTimer);
      if (entry.running) entry.adapter.stop();
      entry.running = false;
    }
  }

  private start(entry: Entry): void {
    if (entry.running) return;
    entry.running = true;
    entry.adapter.start(this.eventsFor(entry.adapter.name));
  }
}
