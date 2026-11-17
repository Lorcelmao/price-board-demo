import { describe, expect, it } from "vitest";
import type { FeedConnection, FeedEvents, QuotePatch } from "../../shared/feed";
import type { IndexCode, IndexPoint, IndexSnapshot } from "../../shared/indexes";
import { CHART_INDEXES } from "../../shared/indexes";
import { createYsflexFeed, type YsflexSocket } from "./ysflex";

// Socket giả: ghi lại tin gửi đi, và nhận tin đến qua receive().
// onAny chỉ nhận sự kiện dữ liệu, giống socket.io thật (connect/disconnect là sự kiện hệ thống).
class FakeSocket implements YsflexSocket {
  readonly sent: Array<{ event: string; payload: Record<string, unknown> }> = [];
  closed = 0;
  private readonly handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  private readonly anyHandlers: Array<(event: string, ...args: unknown[]) => void> = [];

  on(event: string, listener: (...args: unknown[]) => void): void {
    const list = this.handlers.get(event) ?? [];
    list.push(listener);
    this.handlers.set(event, list);
  }

  onAny(listener: (event: string, ...args: unknown[]) => void): void {
    this.anyHandlers.push(listener);
  }

  emit(event: string, payload: unknown): void {
    this.sent.push({ event, payload: payload as Record<string, unknown> });
  }

  close(): void {
    this.closed += 1;
  }

  removeAllListeners(): void {
    this.handlers.clear();
    this.anyHandlers.length = 0;
  }

  receive(event: string, payload?: unknown): void {
    for (const listener of this.handlers.get(event) ?? []) listener(payload);
    if (event === "connect" || event === "disconnect" || event === "connect_error") return;
    for (const listener of this.anyHandlers) listener(event, payload);
  }
}

interface Collected {
  events: FeedEvents;
  quotes: Array<{ symbol: string; patch: QuotePatch }>;
  indexes: IndexSnapshot[];
  histories: Array<{ code: IndexCode; points: IndexPoint[] }>;
  connections: FeedConnection[];
}

const collect = (): Collected => {
  const quotes: Collected["quotes"] = [];
  const indexes: IndexSnapshot[] = [];
  const histories: Collected["histories"] = [];
  const connections: FeedConnection[] = [];
  return {
    quotes,
    indexes,
    histories,
    connections,
    events: {
      quote: (symbol, patch) => quotes.push({ symbol, patch }),
      index: (snapshot) => indexes.push(snapshot),
      indexHistory: (code, points) => histories.push({ code, points }),
      connection: (state) => connections.push(state),
    },
  };
};

const SI = { topic: "KRXMDDS|SI|G1|AAA", data: { t55: "AAA", t270: 20100, t271: 300 } };
const IGI = {
  topic: "KRXMDDS|IGI|STO|101",
  data: {
    t30001: "STO",
    t30167: "101",
    t30217: 1837.13,
    t40002: 1844.25,
    t40003: -7.12,
    t387: 261633435,
    t381: 8497474224394,
    t30589: 0,
    t30590: 8,
    t30591: 3,
    t30592: 19,
    t30593: 0,
    t60: "150505008",
  },
};

const QUOTE_TOPICS = ["KRXMDDS|ST|G1", "KRXMDDS|SI|G1", "KRXMDDS|TP|G1", "KRXMDDS|MD|G1"];
const IGI_TOPICS = ["KRXMDDS|IGI|STO", "KRXMDDS|IGI|STX", "KRXMDDS|IGI|UPX"];

describe("createYsflexFeed: đăng ký", () => {
  it("nối xong gửi SUB_REQ cho bốn kênh giá, IGI theo sàn và HIST_REQ cho chỉ số có biểu đồ", () => {
    const made: FakeSocket[] = [];
    const feed = createYsflexFeed({
      symbols: ["AAA", "BBB"],
      createSocket: () => {
        const socket = new FakeSocket();
        made.push(socket);
        return socket;
      },
      now: () => 1,
    });
    const seen = collect();

    feed.start(seen.events);
    expect(feed.status().connection).toBe("connecting");

    made[0].receive("connect");
    expect(feed.status().connection).toBe("open");
    expect(seen.connections).toEqual(["connecting", "open"]);

    const quoteSub = made[0].sent.filter((message) => message.event === "SUB_REQ")[0];
    expect(quoteSub.payload.topic).toEqual(QUOTE_TOPICS);
    expect(quoteSub.payload.value).toEqual(["AAA", "BBB"]);

    const indexSubs = made[0].sent.filter(
      (message) => message.event === "SUB_REQ" && String((message.payload.topic as string[])[0]).startsWith("KRXMDDS|IGI|"),
    );
    expect(indexSubs.map((message) => (message.payload.topic as string[])[0])).toEqual(IGI_TOPICS);
    expect(indexSubs.map((message) => message.payload.value)).toEqual([["001", "101"], ["002", "100"], ["301"]]);

    const history = made[0].sent.filter((message) => message.event === "HIST_REQ");
    expect(history.map((message) => (message.payload.topic as string[])[0])).toEqual([
      "INTRADAY_1m|STO",
      "INTRADAY_1m|STO",
      "INTRADAY_1m|STX",
      "INTRADAY_1m|UPX",
    ]);
    expect(history.map((message) => (message.payload.value as string[])[0])).toEqual(["001", "101", "002", "301"]);
    expect(history).toHaveLength(CHART_INDEXES.length);
  });

  it("mất kết nối rồi nối lại thì đăng ký lại và tăng reconnects", () => {
    const made: FakeSocket[] = [];
    const feed = createYsflexFeed({
      symbols: ["AAA"],
      createSocket: () => {
        const socket = new FakeSocket();
        made.push(socket);
        return socket;
      },
      now: () => 1,
    });
    const seen = collect();
    feed.start(seen.events);
    made[0].receive("connect");
    const subsBefore = made[0].sent.filter((message) => message.event === "SUB_REQ").length;
    const historyBefore = made[0].sent.filter((message) => message.event === "HIST_REQ").length;

    made[0].receive("disconnect", "transport close");
    expect(feed.status().connection).toBe("reconnecting");
    expect(seen.connections).toEqual(["connecting", "open", "reconnecting"]);

    made[0].receive("connect");
    expect(feed.status().connection).toBe("open");
    expect(feed.status().reconnects).toBe(1);
    expect(made[0].sent.filter((message) => message.event === "SUB_REQ")).toHaveLength(subsBefore * 2);
    expect(made[0].sent.filter((message) => message.event === "HIST_REQ")).toHaveLength(historyBefore * 2);
  });

  it("connect_error cũng báo đang kết nối lại", () => {
    const made: FakeSocket[] = [];
    const feed = createYsflexFeed({
      symbols: ["AAA"],
      createSocket: () => {
        const socket = new FakeSocket();
        made.push(socket);
        return socket;
      },
      now: () => 1,
    });
    const seen = collect();
    feed.start(seen.events);
    made[0].receive("connect_error", new Error("mất mạng"));

    expect(feed.status().connection).toBe("reconnecting");
    expect(seen.connections).toEqual(["connecting", "reconnecting"]);
  });

  it("gọi start lần hai khi đang chạy thì không mở thêm socket", () => {
    const made: FakeSocket[] = [];
    const feed = createYsflexFeed({
      symbols: ["AAA"],
      createSocket: () => {
        const socket = new FakeSocket();
        made.push(socket);
        return socket;
      },
      now: () => 1,
    });
    feed.start(collect().events);
    feed.start(collect().events);
    expect(made).toHaveLength(1);
  });
});

describe("createYsflexFeed: nhận tin", () => {
  const setup = () => {
    const made: FakeSocket[] = [];
    let tick = 0;
    const feed = createYsflexFeed({
      symbols: ["AAA"],
      createSocket: () => {
        const socket = new FakeSocket();
        made.push(socket);
        return socket;
      },
      now: () => ++tick,
    });
    const seen = collect();
    feed.start(seen.events);
    made[0].receive("connect");
    return { feed, socket: made[0], seen };
  };

  it("tin giá đi vào events.quote với đúng mã và phần thay đổi", () => {
    const { seen, socket } = setup();
    socket.receive("onFOSStream", SI);

    expect(seen.quotes).toHaveLength(1);
    expect(seen.quotes[0].symbol).toBe("AAA");
    expect(seen.quotes[0].patch.last).toBe(20100);
    expect(seen.quotes[0].patch.lastVolume).toBe(300);
  });

  it("tin IGI đi vào events.index, không đi nhầm vào quote", () => {
    const { seen, socket } = setup();
    socket.receive("onFOSStream", IGI);

    expect(seen.quotes).toHaveLength(0);
    expect(seen.indexes).toHaveLength(1);
    expect(seen.indexes[0].code).toBe("VN30");
    expect(seen.indexes[0].value).toBe(1837.13);
  });

  it("tin không nhận ra thì tăng rejected, không ném lỗi", () => {
    const { feed, seen, socket } = setup();
    socket.receive("onFOSStream", { topic: "KRXMDDS|XX|G1|AAA", data: {} });
    socket.receive("onFOSStream", null);

    expect(seen.quotes).toHaveLength(0);
    expect(seen.indexes).toHaveLength(0);
    expect(feed.status().rejected).toBe(2);
    expect(feed.status().messages).toBe(2);
  });

  it("HIST_RES chia lịch sử theo từng chỉ số và gọi indexHistory", () => {
    const { feed, seen, socket } = setup();
    socket.receive("HIST_RES", {
      Data: [
        { topic: "INTRADAY_1m|STO|101", data: { T: "09:01:00", C: 1839.94, V: 0 } },
        { topic: "INTRADAY_1m|STO|001", data: { T: "09:02:00", C: 1840.1, V: 5 } },
      ],
    });

    expect(seen.histories.map((item) => item.code)).toEqual(["VN30", "VNI"]);
    expect(seen.histories[0].points).toEqual([{ time: "09:01", value: 1839.94, volume: 0 }]);
    expect(feed.status().messages).toBe(1);
    expect(feed.status().lastMessageAt).toBe(1);
  });

  it("đếm mọi tin dữ liệu và cập nhật lastMessageAt bằng đồng hồ truyền vào", () => {
    const { feed, socket } = setup();
    socket.receive("onFOSStream", SI);
    socket.receive("onFOSStream", IGI);
    socket.receive("SUB_RES", { Result: 1 });

    expect(feed.status().messages).toBe(3);
    expect(feed.status().lastMessageAt).toBe(3);
  });
});

describe("createYsflexFeed: dừng", () => {
  it("stop gửi UNSUB_REQ, đóng socket, bỏ nghe và báo stopped", () => {
    const made: FakeSocket[] = [];
    const feed = createYsflexFeed({
      symbols: ["AAA", "BBB"],
      createSocket: () => {
        const socket = new FakeSocket();
        made.push(socket);
        return socket;
      },
      now: () => 1,
    });
    const seen = collect();
    feed.start(seen.events);
    made[0].receive("connect");
    const quotesBefore = seen.quotes.length;

    feed.stop();

    expect(made[0].closed).toBe(1);
    expect(feed.status().connection).toBe("stopped");
    expect(seen.connections.at(-1)).toBe("stopped");

    const unsubs = made[0].sent.filter((message) => message.event === "UNSUB_REQ");
    expect(unsubs).toHaveLength(4);
    expect(unsubs[0].payload.topic).toEqual(QUOTE_TOPICS);
    expect(unsubs[0].payload.value).toEqual(["AAA", "BBB"]);
    expect(unsubs.slice(1).map((message) => (message.payload.topic as string[])[0])).toEqual(IGI_TOPICS);

    // Đã gỡ listener: tin đến sau khi dừng không còn tác dụng.
    made[0].receive("onFOSStream", SI);
    expect(seen.quotes).toHaveLength(quotesBefore);
  });

  it("stop rồi start lại được, socket mới đăng ký lại, reconnects không cộng oan", () => {
    const made: FakeSocket[] = [];
    const feed = createYsflexFeed({
      symbols: ["AAA"],
      createSocket: () => {
        const socket = new FakeSocket();
        made.push(socket);
        return socket;
      },
      now: () => 1,
    });
    feed.start(collect().events);
    made[0].receive("connect");
    feed.stop();

    feed.start(collect().events);
    expect(made).toHaveLength(2);
    made[1].receive("connect");

    expect(feed.status().connection).toBe("open");
    expect(feed.status().reconnects).toBe(0);
    expect(made[1].sent.filter((message) => message.event === "SUB_REQ")).toHaveLength(4);
  });

  it("stop khi chưa start thì chỉ báo stopped, không lỗi", () => {
    const feed = createYsflexFeed({ createSocket: () => new FakeSocket() });
    feed.stop();
    expect(feed.status().connection).toBe("stopped");
  });
});
