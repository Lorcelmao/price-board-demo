import type { FeedName } from "../../shared/feed";
import { CHART_INDEXES, type IndexPoint } from "../../shared/indexes";
import { apiGet } from "../net/api";
import { MarketClient, type ConnectionStatus } from "../net/market-client";
import { loadAccount, onAccountMessage, resetAccountState } from "./account-store";
import { setIndexHistory, setIndexSnapshot } from "./index-store";
import { getQuote, setQuote, setStatus } from "./quote-store";
import { checkSession, expire, getSession, onSessionChange } from "./session";
import { setSessionPhase } from "./session-phase";

// Nguồn giá của trang. Cả mock và Yuanta đều đi qua gateway của server bằng một kết nối /ws:
// trình duyệt không nối thẳng tới Yuanta. Server gửi tin QUOTE (phần thay đổi của Quote) và INDEX
// của đúng nguồn đã chọn. Tài khoản, đặt lệnh và tin đợt phiên chỉ có ở nguồn mock.
let started = false;
let client: MarketClient | null = null;

// MarketClient.watch() đếm số người dùng từng mã, nên tách hai đăng ký:
// - nhóm VN30 đăng ký một lần lúc mở nguồn và giữ suốt phiên, để các số tổng luôn có;
// - mã của tab đang mở đăng ký thêm, huỷ và đăng ký lại khi đổi tab.
let tabUnwatch: (() => void) | null = null;
let tabSymbols: string[] = [];

const toStoreStatus = (status: ConnectionStatus) => {
  if (status === "connecting") setStatus("connecting");
  else if (status === "open") setStatus("open");
  else setStatus("reconnecting");
};

const sameSet = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((item) => b.includes(item));

export function startMarketSource(feed: FeedName, symbols: string[]): void {
  if (started) return;
  started = true;

  const market = new MarketClient(feed);
  client = market;
  market.onStatus(toStoreStatus);
  market.onMessage((message) => {
    if (!("topic" in message)) return;
    if (message.topic === "QUOTE") {
      if (message.feed !== feed) return;
      setQuote(message.symbol, { ...getQuote(message.symbol), ...message.patch, symbol: message.symbol });
      return;
    }
    if (message.topic === "INDEX") {
      if (message.feed === feed) setIndexSnapshot(message.index);
      return;
    }
    // Đợt phiên của server là đợt của thị trường giả lập; nguồn Yuanta tính đợt theo giờ ở trình duyệt.
    if (message.topic === "SESSION") {
      if (feed === "mock") setSessionPhase(message.phase);
      return;
    }
    // Server báo phiên đăng nhập mất hiệu lực (đăng nhập nơi khác, đăng xuất, hết hạn).
    if (message.topic === "AUTH") {
      expire();
      return;
    }
    if (message.topic.startsWith("ACCOUNT")) onAccountMessage(message);
  });
  // Nối lại xong thì tải lại, vì trong lúc mất kết nối có thể đã lỡ tin.
  // Lần kết nối đầu cũng đi qua đây, nên không gọi tải riêng ở dưới (tránh gọi hai lần).
  market.onStatus((status) => {
    if (status !== "open") return;
    if (feed === "mock") void loadAccount("mock");
    // Lịch sử trong ngày của bốn chỉ số có biểu đồ; tin INDEX sau đó nối tiếp từng phút.
    for (const code of CHART_INDEXES) {
      apiGet<IndexPoint[]>(`/index-intraday/${code}?feed=${feed}`)
        .then((points) => setIndexHistory(code, points))
        .catch(() => undefined);
    }
  });
  if (feed === "mock") {
    // Có phiên thì đăng ký tin tài khoản bằng token của phiên; đăng xuất hay hết hạn thì huỷ và xoá kho.
    const syncAccount = () => {
      const session = getSession();
      if (session) {
        market.watchAccount(session.token);
        if (market.status === "open") void loadAccount("mock");
      } else {
        market.unwatchAccount();
        resetAccountState();
      }
    };
    onSessionChange(syncAccount);
    void checkSession();
    // Đăng ký nhận tin tài khoản trên chính kết nối này, không mở kết nối thứ hai.
    syncAccount();
  }
  market.connect();
  // Nhóm VN30 đăng ký suốt phiên; không giữ hàm huỷ vì không bao giờ huỷ nhóm này.
  market.watch(symbols);
}

// Đổi các mã theo dõi thêm cho tab đang mở. Nhóm VN30 đã có đăng ký riêng nên không bị huỷ.
export function setTabSymbols(symbols: string[], base: string[]): void {
  if (!client) return;
  // Mã đã nằm trong nhóm VN30 thì không cần đăng ký thêm lần nữa.
  const baseSet = new Set(base);
  const extra = [...new Set(symbols.filter((symbol) => !baseSet.has(symbol)))];
  if (sameSet(extra, tabSymbols)) return;

  tabUnwatch?.();
  tabUnwatch = extra.length > 0 ? client.watch(extra) : null;
  tabSymbols = extra;
}

// Dùng cho kiểm tra: các mã đang theo dõi thêm ngoài nhóm VN30.
export const getTabSymbols = (): string[] => tabSymbols.slice();
