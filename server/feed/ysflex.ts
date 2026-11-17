import { io } from "socket.io-client";
import type { FeedAdapter, FeedConnection, FeedEvents, FeedStatus } from "../../shared/feed";
import { CHART_INDEXES, VN30_YSFLEX } from "../../shared/indexes";
import { mapHistoryRows, mapIgiMessage, YSFLEX_INDEXES } from "./ysflex-index-map";
import { mapYsflexMessage } from "./ysflex-map";

// Adapter nguồn Yuanta: giữ một kết nối /market, chuẩn hoá tin về QuotePatch và chỉ số
// rồi đẩy cho gateway. Chỉ đọc: không đăng nhập, không gọi /services.

const YSFLEX_URL = "https://ysflex.yuanta.com.vn";
const MARKET_PATH = "/market";
const TRANS_ID = "123-abc";

// Bốn kênh giá của bảng VN30, đúng như trang chính thức đăng ký.
const QUOTE_TOPICS = ["KRXMDDS|ST|G1", "KRXMDDS|SI|G1", "KRXMDDS|TP|G1", "KRXMDDS|MD|G1"];

// Phần socket mà adapter cần. Nhận diện tối thiểu để test truyền socket giả, không cần mạng.
export interface YsflexSocket {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  onAny(listener: (event: string, ...args: unknown[]) => void): unknown;
  emit(event: string, payload: unknown): unknown;
  close(): void;
  removeAllListeners(): unknown;
}

export interface YsflexFeedOptions {
  // Mặc định 30 mã VN30, cùng danh sách trang YSFlex đăng ký.
  symbols?: string[];
  // Test truyền hàm tạo socket giả; chạy thật thì dùng socket.io-client.
  createSocket?: () => YsflexSocket;
  now?: () => number;
}

// Origin và Referer giống lần spike server-side. User-Agent nói đúng đây là dự án học tập,
// không giả làm trình duyệt: Yuanta cho phép dùng luồng này trong phạm vi học tập.
const defaultSocket = (): YsflexSocket =>
  io(YSFLEX_URL, {
    path: MARKET_PATH,
    transports: ["websocket"],
    reconnection: true,
    extraHeaders: {
      Origin: YSFLEX_URL,
      Referer: `${YSFLEX_URL}/`,
      "User-Agent": "price-board-demo/0.1 (du an hoc tap; https://github.com/Lorcelmao/price-board-demo)",
    },
  });

// Đăng ký chỉ số theo sàn: topic "KRXMDDS|IGI|<sàn>", value là mã các chỉ số của sàn đó.
const indexSubscriptions = (): Array<{ topic: string[]; value: string[] }> => {
  const boards = [...new Set(YSFLEX_INDEXES.map((item) => item.board))];
  return boards.map((board) => ({
    topic: [`KRXMDDS|IGI|${board}`],
    value: YSFLEX_INDEXES.filter((item) => item.board === board).map((item) => item.id),
  }));
};

export function createYsflexFeed(options: YsflexFeedOptions = {}): FeedAdapter {
  const symbols = options.symbols ?? VN30_YSFLEX;
  const now = options.now ?? Date.now;
  const createSocket = options.createSocket ?? defaultSocket;

  let socket: YsflexSocket | null = null;
  let events: FeedEvents | null = null;
  let started = false;
  // Đã nối được ít nhất một lần trong vòng đời hiện tại; dùng để đếm reconnects.
  let hasConnected = false;
  let clientSeq = 0;

  let connection: FeedConnection = "stopped";
  let messages = 0;
  let rejected = 0;
  let reconnects = 0;
  let lastMessageAt: number | null = null;

  const setConnection = (next: FeedConnection) => {
    if (connection === next) return;
    connection = next;
    events?.connection(next);
  };

  const send = (client: YsflexSocket, event: string, payload: object) => {
    clientSeq += 1;
    client.emit(event, { ClientSeq: clientSeq, TransId: TRANS_ID, ...payload });
  };

  // Đăng ký lại toàn bộ sau mỗi lần nối, kể cả nối lại sau khi mất mạng.
  const subscribe = (client: YsflexSocket) => {
    send(client, "SUB_REQ", { topic: QUOTE_TOPICS, value: symbols });
    for (const sub of indexSubscriptions()) send(client, "SUB_REQ", sub);
    // Lịch sử trong ngày của bốn chỉ số có biểu đồ.
    for (const item of YSFLEX_INDEXES.filter((index) => CHART_INDEXES.includes(index.code))) {
      send(client, "HIST_REQ", {
        topic: [`INTRADAY_1m|${item.board}`],
        value: [item.id],
        fromseq: [0],
        size: [500],
      });
    }
  };

  // Tin dữ liệu vào: mọi tin đều được đếm; tin không nhận ra thì tăng rejected, không ném lỗi.
  const receive = (payload: unknown) => {
    const index = mapIgiMessage(payload);
    if (index) {
      events?.index(index);
      return;
    }
    const mapped = mapYsflexMessage("onFOSStream", payload);
    if (mapped) {
      events?.quote(mapped.symbol, mapped.patch);
      return;
    }
    rejected += 1;
  };

  return {
    name: "ysflex",

    start(nextEvents: FeedEvents) {
      if (started) return;
      events = nextEvents;
      started = true;
      hasConnected = false;
      setConnection("connecting");

      const client = createSocket();
      socket = client;

      client.on("connect", () => {
        if (!started) return;
        // Lần nối thứ hai trở đi trong cùng vòng đời là nối lại sau khi đã mất kết nối.
        if (hasConnected) reconnects += 1;
        hasConnected = true;
        setConnection("open");
        subscribe(client);
      });
      client.on("disconnect", () => {
        if (started) setConnection("reconnecting");
      });
      client.on("connect_error", () => {
        if (started) setConnection("reconnecting");
      });
      client.on("onFOSStream", (payload) => {
        if (started) receive(payload);
      });
      client.on("HIST_RES", (payload) => {
        if (!started) return;
        const rows = mapHistoryRows((payload as { Data?: unknown } | null)?.Data);
        for (const [code, points] of rows) events?.indexHistory(code, points);
      });
      // Đếm mọi tin nhận được (không tính sự kiện hệ thống connect/disconnect).
      client.onAny(() => {
        if (!started) return;
        messages += 1;
        lastMessageAt = now();
      });
    },

    stop() {
      if (!started) {
        setConnection("stopped");
        return;
      }
      started = false;
      const client = socket;
      socket = null;
      if (client) {
        // HIST_REQ là yêu cầu một lần, không có huỷ đăng ký.
        send(client, "UNSUB_REQ", { topic: QUOTE_TOPICS, value: symbols });
        for (const sub of indexSubscriptions()) send(client, "UNSUB_REQ", sub);
        client.removeAllListeners();
        client.close();
      }
      setConnection("stopped");
    },

    status(): FeedStatus {
      return { feed: "ysflex", connection, lastMessageAt, messages, rejected, reconnects };
    },
  };
}
