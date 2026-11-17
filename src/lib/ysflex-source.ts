import { io, type Socket } from "socket.io-client";
import { CHART_INDEXES } from "../../shared/indexes";
import { setIndexHistory, setIndexSnapshot } from "./index-store";
import { getQuote, setQuote, setStatus } from "./quote-store";
import { VN30_YSFLEX } from "./vn30";
import { mapYsflexMessage, type QuotePatch } from "./ysflex-map";
import { mapHistoryRows, mapIgiMessage, YSFLEX_INDEXES } from "./ysflex-index-map";

// Nguồn ysflex: nối vào đường /market, đăng ký danh sách VN30, chuyển tin thành Quote.
// Giới hạn: chỉ /market, không đăng nhập, không giao dịch, một kết nối mỗi tab.

const YSFLEX_URL = "https://ysflex.yuanta.com.vn";
const MARKET_PATH = "/market";

// Kênh con dùng cho bảng giá VN30, đúng như trang chính thức đăng ký.
const TOPICS = ["KRXMDDS|ST|G1", "KRXMDDS|SI|G1", "KRXMDDS|TP|G1", "KRXMDDS|MD|G1"];

let socket: Socket | null = null;
let started = false;
let clientSeq = 0;

// Giá trị khối ngoại (foreignBuyValue, foreignSellValue, đơn vị đồng) đi cùng bản vá vào kho,
// để giao diện đọc thẳng từ useQuote và được báo khi số đổi. Luồng không có KL khối ngoại.
// Bản vá chỉ chứa trường có trong tin (xem ysflex-map.ts), nên trộn đè không làm mất dữ liệu cũ.
const applyPatch = (symbol: string, patch: QuotePatch): void => {
  setQuote(symbol, { ...getQuote(symbol), ...patch });
};

const subscribe = (client: Socket, symbols: string[]): void => {
  clientSeq += 1;
  client.emit("SUB_REQ", {
    ClientSeq: clientSeq,
    TransId: "123-abc",
    topic: TOPICS,
    value: symbols,
  });
};

// Chỉ số: đăng ký giá trị trực tiếp (IGI) theo từng sàn, và xin lịch sử trong ngày của bốn chỉ số có biểu đồ.
const subscribeIndexes = (client: Socket): void => {
  const boards = [...new Set(YSFLEX_INDEXES.map((item) => item.board))];
  for (const board of boards) {
    clientSeq += 1;
    client.emit("SUB_REQ", {
      ClientSeq: clientSeq,
      TransId: "123-abc",
      topic: [`KRXMDDS|IGI|${board}`],
      value: YSFLEX_INDEXES.filter((item) => item.board === board).map((item) => item.id),
    });
  }
  for (const item of YSFLEX_INDEXES.filter((index) => CHART_INDEXES.includes(index.code))) {
    clientSeq += 1;
    client.emit("HIST_REQ", {
      ClientSeq: clientSeq,
      TransId: "123-abc",
      topic: [`INTRADAY_1m|${item.board}`],
      value: [item.id],
      fromseq: [0],
      size: [500],
    });
  }
};

export function startYsflexSource(symbols: string[] = VN30_YSFLEX): void {
  if (started) return;
  started = true;

  const client = io(YSFLEX_URL, {
    path: MARKET_PATH,
    transports: ["websocket"],
    reconnection: true,
  });
  socket = client;

  setStatus("connecting");

  client.on("connect", () => {
    setStatus("open");
    // Đăng ký lại sau mỗi lần nối (kể cả nối lại sau khi mất mạng).
    subscribe(client, symbols);
    subscribeIndexes(client);
  });
  client.on("disconnect", () => setStatus("reconnecting"));
  client.on("connect_error", () => setStatus("reconnecting"));

  // Lịch sử về theo gói; gói cuối có Message "DONE" và không mang dữ liệu.
  client.on("HIST_RES", (payload: { Data?: unknown }) => {
    for (const [code, points] of mapHistoryRows(payload?.Data)) setIndexHistory(code, points);
  });

  client.on("onFOSStream", (payload: unknown) => {
    const index = mapIgiMessage(payload);
    if (index) {
      setIndexSnapshot(index);
      return;
    }
    const mapped = mapYsflexMessage("onFOSStream", payload);
    if (!mapped) return;
    applyPatch(mapped.symbol, mapped.patch);
  });

  // Đóng trang sạch: hủy đăng ký rồi đóng kết nối, tránh để kết nối treo.
  // event.persisted là trình duyệt cất trang vào bộ nhớ đệm để quay lại nhanh: không đóng hẳn,
  // vì đóng thủ công thì Socket.IO không tự nối lại khi người dùng quay lại trang.
  window.addEventListener("pagehide", (event) => {
    if (event.persisted || !client.connected) return;
    clientSeq += 1;
    client.emit("UNSUB_REQ", { ClientSeq: clientSeq, TransId: "123-abc", topic: TOPICS, value: symbols });
    client.close();
  });
}

export function stopYsflexSource(): void {
  if (!socket) return;
  socket.removeAllListeners();
  socket.close();
  socket = null;
  started = false;
}
