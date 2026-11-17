import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import type { SessionPhase } from "../shared/market-rules";
import type { OrderDraft } from "../shared/order-validation";
import { isFeedName, type FeedAdapter, type FeedEvents, type FeedName } from "../shared/feed";
import type { ClientMessage, PositionDto, ServerMessage } from "../shared/protocol";
import { Account } from "./account";
import { AuthStore } from "./auth";
import { dailyHistory, isoDate, toWeekly } from "./candles";
import { companyInfo } from "./company";
import { createMockFeed } from "./feed/mock";
import { FeedRegistry } from "./gateway/feed-registry";
import { IndexCache } from "./gateway/index-cache";
import { QuoteCache } from "./gateway/quote-cache";
import { MarketIndexes } from "./market-indexes";
import { MarketSimulator } from "./market-simulator";
import { OrderEngine } from "./order-engine";
import { listenPort, MOCK_PORT } from "./port";

const PHASES: SessionPhase[] = ["ATO", "CONTINUOUS", "ATC", "CLOSED"];

interface ClientState {
  symbols: Set<string>;
  // Nguồn giá của kết nối này; null cho tới tin sub đầu tiên.
  feed: FeedName | null;
  account: boolean;
  // Token đã dùng khi đăng ký tin tài khoản, để ngắt đúng socket khi phiên đó mất hiệu lực.
  token?: string;
}

export interface MockServerOptions {
  port?: number;
  tickMs?: number;
  random?: () => number;
  // Đồng hồ cho phiên đăng nhập; test truyền đồng hồ giả để thử hết hạn.
  now?: () => number;
  // Các nguồn giá ngoài mock (ví dụ Yuanta). Mở khi có người xem, đóng sau idleMs không còn ai xem.
  feeds?: FeedAdapter[];
  idleMs?: number;
}

export interface MockServer {
  http: Server;
  port: number;
  market: MarketSimulator;
  engine: OrderEngine;
  account: Account;
  auth: AuthStore;
  feeds: FeedRegistry;
  quotes: QuoteCache;
  close(): Promise<void>;
  // Ngắt mọi kết nối WebSocket nhưng giữ server sống, để thử client kết nối lại.
  dropAllClients(): void;
}

const readJson = async <T>(req: IncomingMessage): Promise<T> => {
  let body = "";
  for await (const chunk of req) body += chunk;
  return (body ? JSON.parse(body) : {}) as T;
};

export function startMockServer(options: MockServerOptions = {}): Promise<MockServer> {
  const market = new MarketSimulator(options.random);
  const account = new Account();
  const engine = new OrderEngine(market, account);
  const auth = new AuthStore(options.now);
  const clients = new Map<WebSocket, ClientState>();
  const indexes = new MarketIndexes(market);

  const send = (socket: WebSocket, message: ServerMessage) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  };
  const expireSocket = (socket: WebSocket, state: ClientState) => {
    state.account = false;
    state.token = undefined;
    send(socket, { topic: "AUTH", status: "expired" });
  };
  // Ngắt tin tài khoản của mọi socket đang dùng token này (đăng xuất, hay bị đăng nhập nơi khác đẩy ra).
  const expireToken = (token: string) => {
    for (const [socket, state] of clients) if (state.token === token) expireSocket(socket, state);
  };
  const broadcastAccount = (message: ServerMessage) => {
    for (const [socket, state] of clients) {
      if (!state.account) continue;
      // Token hết hạn giữa chừng thì thôi gửi, kể cả khi client không gọi REST nào.
      if (!auth.verify(state.token)) expireSocket(socket, state);
      else send(socket, message);
    }
  };

  // Gateway: mọi nguồn đổ dữ liệu đã chuẩn hoá vào cache, rồi phát cho đúng kết nối đang theo nguồn đó.
  const quotes = new QuoteCache();
  const indexCache = new IndexCache();
  const eventsFor = (feed: FeedName): FeedEvents => ({
    quote(symbol, patch) {
      const changed = quotes.apply(feed, symbol, patch);
      if (!changed) return;
      for (const [socket, state] of clients) {
        if (state.feed === feed && state.symbols.has(symbol)) send(socket, { topic: "QUOTE", feed, symbol, patch: changed });
      }
    },
    index(snapshot) {
      indexCache.setSnapshot(feed, snapshot);
      for (const [socket, state] of clients) if (state.feed === feed) send(socket, { topic: "INDEX", feed, index: snapshot });
    },
    indexHistory(code, points) {
      indexCache.setHistory(feed, code, points);
    },
    connection() {
      /* trạng thái đọc qua /api/feed-status */
    },
  });
  const feeds = new FeedRegistry(eventsFor, { idleMs: options.idleMs });
  // Mock luôn chạy: bộ khớp lệnh dùng giá giả lập, kể cả khi không ai xem nguồn mock.
  feeds.add(createMockFeed(market, indexes), true);
  for (const adapter of options.feeds ?? []) feeds.add(adapter);
  const feedOf = (req: IncomingMessage): FeedName | null => {
    const value = new URL(req.url ?? "/", "http://localhost").searchParams.get("feed") ?? "mock";
    return isFeedName(value) && feeds.has(value) ? value : null;
  };

  engine.onEvent((event) => {
    if (event.kind === "order") broadcastAccount({ topic: "ACCOUNT|ORDER", order: event.order });
    else if (event.kind === "fill") broadcastAccount({ topic: "ACCOUNT|FILL", fill: event.fill });
    else broadcastAccount({ topic: "ACCOUNT|BALANCE" });
  });

  const positions = (): PositionDto[] =>
    [...account.holdings.values()]
      .map((holding) => {
        const holdQty = engine.holdQty(holding.symbol);
        return {
          symbol: holding.symbol,
          exchange: market.get(holding.symbol)?.exchange ?? "HOSE",
          totalQty: holding.available + holding.pendingT0 + holding.pendingT1,
          availableQty: holding.available - holdQty,
          holdQty,
          pendingT0: holding.pendingT0,
          pendingT1: holding.pendingT1,
          avgCost: holding.avgCost,
        };
      })
      .filter((position) => position.totalQty > 0);

  // Lịch sử nến ngày (khoảng 5 năm) sinh một lần cho mỗi mã; cây hôm nay lấy từ phiên đang chạy.
  const HISTORY_DAYS = 1250;
  const histories = new Map<string, ReturnType<typeof dailyHistory>>();
  const history = (symbol: string, exchange: Parameters<typeof dailyHistory>[0]["exchange"], ref: number) => {
    let cached = histories.get(symbol);
    if (!cached) {
      cached = dailyHistory({ symbol, exchange, ref, today: new Date(), days: HISTORY_DAYS });
      histories.set(symbol, cached);
    }
    return cached;
  };
  const todayCandle = (state: NonNullable<ReturnType<typeof market.get>>) => {
    const close = state.last ?? state.ref;
    const open = state.open || close;
    return {
      time: isoDate(new Date()),
      open,
      high: Math.max(state.high || close, open, close),
      low: Math.min(state.low || close, open, close),
      close,
      volume: state.totalVolume,
    };
  };

  const respond = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(body));
  };

  const bearer = (req: IncomingMessage): string | undefined => {
    const header = req.headers.authorization ?? "";
    return header.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
  };

  // API của tài khoản cần đăng nhập. API dựng tình huống (đợt phiên, sang ngày) và dữ liệu thị trường để mở.
  const ACCOUNT_GET = new Set([
    "/api/account", "/api/portfolio", "/api/orders", "/api/fills", "/api/cash-history", "/api/corporate-actions", "/api/me",
  ]);
  const ORDER_ACTION = /^\/api\/orders\/[\w-]+\/(cancel|modify)$/;
  const needsAuth = (method: string, pathname: string) =>
    (method === "GET" && ACCOUNT_GET.has(pathname)) ||
    (method === "POST" && (pathname === "/api/orders" || pathname === "/api/account/foreign" || ORDER_ACTION.test(pathname)));

  const http = createServer(async (req, res) => {
    const { pathname } = new URL(req.url ?? "/", "http://localhost");
    const method = req.method ?? "GET";
    try {
      if (method === "POST" && pathname === "/api/login") {
        const { username, password } = await readJson<{ username?: string; password?: string }>(req);
        const result = auth.login(String(username ?? ""), String(password ?? ""));
        if (!result) return respond(res, 401, { error: "Sai tên đăng nhập hoặc mật khẩu." });
        if (result.replacedToken) expireToken(result.replacedToken);
        const { token, accountId, displayName, expiresAt } = result;
        return respond(res, 200, { token, accountId, displayName, expiresAt });
      }
      if (method === "POST" && pathname === "/api/logout") {
        const token = bearer(req);
        if (token && auth.logout(token)) expireToken(token);
        res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
        return res.end();
      }
      if (needsAuth(method, pathname)) {
        const session = auth.verify(bearer(req));
        if (!session) return respond(res, 401, { error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." });
        if (pathname === "/api/me") {
          const { accountId, displayName, expiresAt } = session;
          return respond(res, 200, { accountId, displayName, expiresAt });
        }
      }
      if (method === "GET" && pathname === "/api/instruments") return respond(res, 200, market.instruments());
      if (method === "GET" && pathname === "/api/session") return respond(res, 200, { phase: market.phase });
      if (method === "GET" && pathname === "/api/account") return respond(res, 200, account.toDto(engine.holdFunds()));
      if (method === "GET" && pathname === "/api/portfolio") return respond(res, 200, positions());
      if (method === "GET" && pathname === "/api/orders") return respond(res, 200, [...engine.orders.values()]);
      if (method === "GET" && pathname === "/api/fills") return respond(res, 200, engine.fills);
      if (method === "GET" && pathname === "/api/cash-history") return respond(res, 200, account.cashHistory);
      if (method === "GET" && pathname === "/api/corporate-actions") return respond(res, 200, account.corporateActions());

      const intraday = pathname.match(/^\/api\/intraday\/([A-Z0-9]+)$/);
      if (method === "GET" && intraday) return respond(res, 200, market.intraday(intraday[1]));
      const candles = pathname.match(/^\/api\/candles\/([A-Z0-9]+)$/);
      if (method === "GET" && candles) {
        const state = market.get(candles[1]);
        if (!state) return respond(res, 404, { error: "Không có mã này." });
        const daily = [...history(state.symbol, state.exchange, state.ref), todayCandle(state)];
        const tf = new URL(req.url ?? "/", "http://localhost").searchParams.get("tf");
        return respond(res, 200, tf === "1W" ? toWeekly(daily) : daily);
      }
      const company = pathname.match(/^\/api\/company\/([A-Z0-9]+)$/);
      if (method === "GET" && company) {
        const state = market.get(company[1]);
        if (!state) return respond(res, 404, { error: "Không có mã này." });
        const { symbol, name, exchange, room } = state;
        return respond(res, 200, companyInfo({ symbol, name, exchange, room, price: state.last ?? state.ref }));
      }
      const indexHistory = pathname.match(/^\/api\/index-intraday\/([A-Z0-9]+)$/);
      if (method === "GET" && indexHistory) {
        const feed = feedOf(req);
        if (!feed) return respond(res, 400, { error: "Nguồn giá không hợp lệ." });
        const points = indexCache.history(feed, indexHistory[1]);
        return points ? respond(res, 200, points) : respond(res, 404, { error: "Không có chỉ số này." });
      }
      // Giá mới nhất trong cache của gateway. Nguồn chưa mở (chưa ai xem) thì trả mảng rỗng.
      if (method === "GET" && pathname === "/api/quotes") {
        const feed = feedOf(req);
        if (!feed) return respond(res, 400, { error: "Nguồn giá không hợp lệ." });
        const list = new URL(req.url ?? "/", "http://localhost").searchParams.get("symbols");
        const symbols = list ? list.split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean) : undefined;
        return respond(res, 200, quotes.snapshot(feed, symbols));
      }
      const oneQuote = pathname.match(/^\/api\/quotes\/([A-Z0-9]+)$/);
      if (method === "GET" && oneQuote) {
        const feed = feedOf(req);
        if (!feed) return respond(res, 400, { error: "Nguồn giá không hợp lệ." });
        const quote = quotes.get(feed, oneQuote[1]);
        return quote ? respond(res, 200, quote) : respond(res, 404, { error: "Chưa có giá của mã này." });
      }
      if (method === "GET" && pathname === "/api/feed-status") {
        return respond(res, 200, feeds.status().map((status) => ({ ...status, rejected: status.rejected + quotes.rejected(status.feed) })));
      }
      const profile = pathname.match(/^\/api\/volume-profile\/([A-Z0-9]+)$/);
      if (method === "GET" && profile) return respond(res, 200, market.volumeProfile(profile[1]));

      if (method === "POST" && pathname === "/api/session") {
        const { phase } = await readJson<{ phase: SessionPhase }>(req);
        if (!PHASES.includes(phase)) return respond(res, 400, { error: "Đợt giao dịch không hợp lệ." });
        engine.setPhase(phase);
        for (const socket of clients.keys()) send(socket, { topic: "SESSION", phase });
        return respond(res, 200, { phase });
      }
      if (method === "POST" && pathname === "/api/account/foreign") {
        const { isForeign } = await readJson<{ isForeign: boolean }>(req);
        account.isForeign = Boolean(isForeign);
        broadcastAccount({ topic: "ACCOUNT|BALANCE" });
        return respond(res, 200, account.toDto(engine.holdFunds()));
      }
      if (method === "POST" && pathname === "/api/advance-day") {
        engine.advanceDay();
        return respond(res, 200, account.toDto(engine.holdFunds()));
      }
      if (method === "POST" && pathname === "/api/orders") {
        const result = engine.place(await readJson<OrderDraft>(req));
        return respond(res, result.errors ? 422 : 201, result);
      }
      const cancel = pathname.match(/^\/api\/orders\/([\w-]+)\/cancel$/);
      if (method === "POST" && cancel) {
        const result = engine.cancel(cancel[1]);
        return respond(res, result.error ? 409 : 200, result);
      }
      const modify = pathname.match(/^\/api\/orders\/([\w-]+)\/modify$/);
      if (method === "POST" && modify) {
        const result = engine.modify(modify[1], await readJson(req));
        return respond(res, result.error ? 409 : 200, result);
      }
      if (method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        });
        return res.end();
      }
      return respond(res, 404, { error: "Không có API này." });
    } catch (error) {
      return respond(res, 500, { error: String(error) });
    }
  });

  const wss = new WebSocketServer({ server: http, path: "/ws" });
  wss.on("connection", (socket) => {
    clients.set(socket, { symbols: new Set(), feed: null, account: false });
    socket.on("close", () => {
      const state = clients.get(socket);
      if (state?.feed) feeds.release(state.feed);
      clients.delete(socket);
    });
    socket.on("message", (raw) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }
      const state = clients.get(socket);
      if (!state) return;
      if (message.op === "ping") send(socket, { op: "pong", ts: message.ts });
      if (message.op === "subAccount") {
        if (auth.verify(message.token)) {
          state.account = true;
          state.token = message.token;
        } else {
          expireSocket(socket, state);
        }
      }
      if (message.op === "unsubAccount") {
        state.account = false;
        state.token = undefined;
      }
      if (message.op === "unsub") message.symbols.forEach((symbol) => state.symbols.delete(symbol));
      if (message.op === "sub") {
        const feed = isFeedName(message.feed) && feeds.has(message.feed) ? message.feed : "mock";
        // Đổi nguồn: bỏ người xem ở nguồn cũ, giữ ở nguồn mới, gửi ảnh chụp chỉ số của nguồn mới.
        if (state.feed !== feed) {
          if (state.feed) feeds.release(state.feed);
          state.feed = feed;
          state.symbols.clear();
          feeds.acquire(feed);
          for (const index of indexCache.snapshots(feed)) send(socket, { topic: "INDEX", feed, index });
        }
        // Ảnh chụp từ cache ngay khi đăng ký: mở trang hay tải lại không phải chờ tin mới.
        for (const symbol of message.symbols) {
          state.symbols.add(symbol);
          const quote = quotes.get(feed, symbol);
          if (quote) send(socket, { topic: "QUOTE", feed, symbol, patch: quote });
        }
      }
    });
    send(socket, { topic: "SESSION", phase: market.phase });
  });

  const timer = setInterval(() => market.tick(), options.tickMs ?? 250);

  return new Promise((resolve) => {
    http.listen(options.port ?? MOCK_PORT, () => {
      const address = http.address();
      resolve({
        http,
        port: typeof address === "object" && address ? address.port : 0,
        market,
        engine,
        account,
        auth,
        feeds,
        quotes,
        dropAllClients: () => {
          for (const socket of clients.keys()) socket.terminate();
        },
        close: () =>
          new Promise((done) => {
            clearInterval(timer);
            feeds.stopAll();
            for (const socket of clients.keys()) socket.terminate();
            wss.close(() => http.close(() => done()));
          }),
      });
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await startMockServer({ port: listenPort() });
  console.log(`Mock server: http://localhost:${server.port}/api và ws://localhost:${server.port}/ws`);
}
