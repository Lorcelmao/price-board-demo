import { applyMarketMessage } from "../../shared/protocol";
import { isMarketMessage, MarketClient, type ConnectionStatus } from "../net/market-client";
import { getQuote, setQuote, setStatus } from "./quote-store";
import { setSessionPhase } from "./session-phase";
import { loadAccount, onAccountMessage, resetAccountState } from "./account-store";
import { checkSession, expire, getSession, onSessionChange } from "./session";
import { VN30_MOCK } from "./vn30";

// Nguồn mock: dùng lại MarketClient và applyMarketMessage có sẵn, không sửa hai file đó.
let started = false;
let client: MarketClient | null = null;

// MarketClient.watch() đếm số người dùng từng mã, nên tách hai đăng ký:
// - nhóm VN30 đăng ký một lần lúc mở nguồn và giữ suốt phiên, để dải chỉ số VN30 luôn có số;
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

export function startMockSource(symbols: string[] = VN30_MOCK): void {
  if (started) return;
  started = true;

  const market = new MarketClient();
  client = market;
  market.onStatus(toStoreStatus);
  market.onMessage((message) => {
    // Tin tài khoản đi cùng kết nối này; đẩy vào kho tài khoản.
    // Server báo phiên mất hiệu lực (đăng nhập nơi khác, đăng xuất, hết hạn).
    if ("topic" in message && message.topic === "AUTH") {
      expire();
      return;
    }
    if ("topic" in message && String(message.topic).startsWith("ACCOUNT")) {
      onAccountMessage(message);
      return;
    }
    // Tin SESSION không phải tin thị trường: isMarketMessage bỏ qua nó, nên bắt riêng ở đây
    // để kho đợt có số đúng.
    if ("topic" in message && message.topic === "SESSION") {
      setSessionPhase(message.phase);
      return;
    }
    if (!isMarketMessage(message)) return;
    const symbol = message.t55;
    setQuote(symbol, applyMarketMessage(getQuote(symbol), message));
  });
  // Nối lại xong thì tải lại toàn bộ, vì trong lúc mất kết nối có thể đã lỡ tin.
  // Lần kết nối đầu cũng đi qua đây, nên không gọi tải riêng ở dưới (tránh gọi hai lần).
  market.onStatus((status) => {
    if (status === "open") void loadAccount("mock");
  });
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
  market.connect();
  // Nhóm VN30 đăng ký suốt phiên; không giữ hàm huỷ vì không bao giờ huỷ nhóm này.
  market.watch(symbols);
  // Đăng ký nhận tin tài khoản trên chính kết nối này, không mở kết nối thứ hai.
  syncAccount();
}

// Đổi các mã theo dõi thêm cho tab đang mở. Nhóm VN30 đã có đăng ký riêng nên không bị huỷ.
export function setMockTabSymbols(symbols: string[], base: string[] = VN30_MOCK): void {
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
export const getMockTabSymbols = (): string[] => tabSymbols.slice();
