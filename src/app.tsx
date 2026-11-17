import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BoardTabs } from "./components/board-tabs";
import { ColumnConfigDialog } from "./components/column-config-dialog";
import { FooterBar, type ConnectionStatusView, type SourceView } from "./components/footer-bar";
import { IndexStrip } from "./components/index-strip";
import { MainMenu } from "./components/main-menu";
import { PriceBoard } from "./components/price-board";
import { TopBar } from "./components/top-bar";
import { COLUMNS } from "./lib/columns";
import { setMockTabSymbols, startMockSource } from "./lib/mock-source";
import { useVn30Stats } from "./lib/derived";
import type { Instrument } from "../shared/protocol";
import {
  loadPrefs,
  loadTabView,
  moveSymbol,
  nextSort,
  safeStorage,
  sanitizeOrder,
  savePrefs,
  saveTabView,
  sortSymbols,
  type BoardPrefs,
  type SortState,
} from "./lib/board-prefs";
import {
  instrumentsFromApi,
  symbolsForTab,
  tabEnabled,
  type BoardTab,
} from "./lib/board-tabs-data";
import {
  addSymbol,
  initialWatchlist,
  loadWatchlist,
  removeSymbol,
  sanitizeWatchlist,
  saveWatchlist,
} from "./lib/watchlist";
import { OrderDialog } from "./components/order-dialog";
import { OrderBookPanel } from "./components/order-book-panel";
import { ModifyOrderDialog } from "./components/modify-order-dialog";
import type { Order } from "../shared/order-merge";
import { useOpenOrderCount } from "./lib/account-store";
import { logout, useSession } from "./lib/session";
import { LoginDialog } from "./components/login-dialog";
import { SymbolDetailDialog } from "./components/symbol-detail-dialog";
import type { Side } from "../shared/market-rules";
import { getQuote, quoteStore, useConnectionStatus } from "./lib/quote-store";
import { draftFromCell, type CellKind } from "./lib/order-draft";
import { startClockPhase, useSessionPhase } from "./lib/session-phase";
import { VN30_MOCK, VN30_YSFLEX } from "./lib/vn30";
import { startYsflexSource } from "./lib/ysflex-source";

// Mặc định dùng mock server chạy trên máy. ?nguon=ysflex chuyển sang luồng giá công khai của YSFlex
// (chỉ đọc, 30 mã VN30); nút nhỏ ở chân trang đổi qua lại giữa hai nguồn.
const readSource = (): SourceView =>
  new URLSearchParams(location.search).get("nguon") === "ysflex" ? "ysflex" : "mock";

// Bảng hàm lấy giá trị sắp xếp, lấy từ định nghĩa cột duy nhất.
const SORT_GETTERS = Object.fromEntries(
  COLUMNS.filter((column) => column.sortValue).map((column) => [column.id, column.sortValue!]),
);

export function App() {
  // Chốt nguồn một lần lúc mở trang để nhãn chân trang khớp đúng nguồn đang chạy.
  const [source] = useState<SourceView>(readSource);
  const status = useConnectionStatus();
  // Dải chỉ số VN30 và các số tổng luôn tính trên nhóm VN30, không theo tab đang mở.
  const vn30Symbols = source === "ysflex" ? VN30_YSFLEX : VN30_MOCK;
  const stats = useVn30Stats(vn30Symbols);

  const storage = useRef(safeStorage());

  // Cấu hình đọc một lần lúc mở trang; đối chiếu với danh sách mã của nguồn đang dùng.
  // Cột sắp xếp đã lưu mà không còn tồn tại thì bỏ, nếu không tay kéo bị khoá mà không có biểu tượng nào.
  const [prefs, setPrefs] = useState<BoardPrefs>(() => {
    const saved = loadPrefs(storage.current, source);
    const sort = saved.sort && SORT_GETTERS[saved.sort.columnId] ? saved.sort : null;
    return { ...saved, sort, order: sanitizeOrder(saved.order, vn30Symbols) };
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  // Popup chi tiết mã: mở bằng một lần bấm vào ô Mã CK, đồng thời chọn dòng đó.
  const [detailSymbol, setDetailSymbol] = useState<string | null>(null);
  const openDetail = useCallback((symbol: string) => {
    setSelected(symbol);
    setDetailSymbol(symbol);
  }, []);
  const closeDetail = useCallback(() => setDetailSymbol(null), []);
  // Đăng nhập chỉ có với nguồn mock. Sổ lệnh và nút "Đặt lệnh" cần đã đăng nhập.
  const sessionState = useSession();
  const loggedIn = source === "mock" && sessionState.session !== null;
  const [loginOpen, setLoginOpen] = useState(false);
  const openLogin = useCallback(() => setLoginOpen(true), []);
  const closeLogin = useCallback(() => setLoginOpen(false), []);
  // Phiên mất hiệu lực (401, hay tin AUTH khi đăng nhập nơi khác) thì mở màn đăng nhập kèm lý do.
  useEffect(() => {
    if (sessionState.expired && source === "mock") setLoginOpen(true);
  }, [sessionState.expired, source]);
  const gearRef = useRef<HTMLButtonElement | null>(null);
  const phase = useSessionPhase();

  // Danh sách mã của nguồn (chỉ nguồn mock cần: lấy một lần từ GET /api/instruments).
  // Với ysflex, mọi mã đều là HOSE và chỉ có 30 mã VN30.
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [instrumentsState, setInstrumentsState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  // Danh mục quan tâm, đọc một lần rồi đối chiếu với danh sách mã của nguồn.
  // Với mock, danh sách 50 mã chỉ có sau khi tải `/api/instruments`, nên lúc mở trang chỉ bỏ trùng và
  // dữ liệu sai kiểu; việc bỏ mã lạ làm sau khi tải xong (effect bên dưới). Không được đối chiếu với
  // VN30_MOCK: làm vậy sẽ xoá mất mã ngoài VN30 như SHS, PNJ rồi ghi đè vào kho lưu.
  const [watchlist, setWatchlist] = useState<string[]>(() => {
    return initialWatchlist(loadWatchlist(storage.current, source), source, VN30_YSFLEX);
  });
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const [watchlistNotice, setWatchlistNotice] = useState<string | null>(null);
  const [symbolInput, setSymbolInput] = useState("");
  // Thông báo ngắn sau khi gửi lệnh thành công.
  const [toast, setToast] = useState<string | null>(null);

  // Sổ lệnh chỉ có với nguồn mock. Trạng thái mở lưu ở khoá riêng.
  // Chỉ đọc số lệnh đang chờ: App không vẽ lại theo từng lần khớp .
  const bookCount = useOpenOrderCount();
  const bookStorageKey = "price-board-demo:so-lenh:v1:mock";
  const [bookOpen, setBookOpen] = useState<boolean>(() => {
    if (source !== "mock") return false;
    try {
      return storage.current.getItem(bookStorageKey) === "open";
    } catch {
      return false;
    }
  });
  // Giữ id, không giữ bản chụp lệnh: hộp thoại sửa tự đọc lệnh mới nhất từ kho.
  const [modifyTarget, setModifyTarget] = useState<string | null>(null);
  const openModify = useCallback((order: Order) => setModifyTarget(order.id), []);
  const closeModify = useCallback(() => setModifyTarget(null), []);

  useEffect(() => {
    if (source !== "mock") return;
    try {
      storage.current.setItem(bookStorageKey, bookOpen ? "open" : "closed");
    } catch {
      /* không lưu được thì thôi */
    }
  }, [bookOpen, source]);

  // Tab đang mở: lưu trong khoá chính. Tab bị tắt với nguồn này thì quay về VN30.
  const activeTab: BoardTab = tabEnabled(prefs.tab, source) ? prefs.tab : "vn30";

  // Cấu hình order/sort của từng tab. VN30 dùng prefs.order/prefs.sort; ba tab kia dùng state riêng,
  // nạp từ khoá `<khoá chính>:tab:<tab>` khi đổi tab.
  // Tab đang mở lúc tải trang phải được nạp ngay, nếu không effect lưu bên dưới sẽ ghi đè
  // cấu hình đã lưu của tab đó bằng giá trị rỗng.
  const [tabViews, setTabViews] = useState<Record<string, { order: string[]; sort: SortState | null }>>(() => {
    const initialTab = prefs.tab;
    if (initialTab === "vn30" || !tabEnabled(initialTab, source)) return {};
    const saved = loadTabView(storage.current, source, initialTab);
    const sort = saved.sort && SORT_GETTERS[saved.sort.columnId] ? saved.sort : null;
    return { [initialTab]: { order: saved.order, sort } };
  });

  // Form đặt lệnh nháp: giữ mã, nháp và ô đã bấm đúp để Esc trả con trỏ về đúng chỗ.
  const [orderForm, setOrderForm] = useState<{
    symbol: string;
    cell: CellKind;
    seed: NonNullable<ReturnType<typeof draftFromCell>>;
    opener: HTMLElement | null;
  } | null>(null);
  const orderOpen = orderForm !== null;

  // Mã của tab đang mở, theo thứ tự mặc định (chưa xếp, chưa kéo).
  const baseSymbols = useMemo(
    () => symbolsForTab(activeTab, source, instruments, watchlist, vn30Symbols),
    [activeTab, source, instruments, watchlist, vn30Symbols],
  );

  // Order/sort đang dùng cho tab này.
  const view = activeTab === "vn30"
    ? { order: prefs.order, sort: prefs.sort }
    : tabViews[activeTab] ?? { order: [], sort: null };

  // Tab không phải VN30: thứ tự nền là baseSymbols đã đối chiếu, và order đã lưu chỉ áp cho tab đó.
  const baseOrder = useMemo(() => {
    const saved = view.order.length > 0 ? sanitizeOrder(view.order, baseSymbols) : baseSymbols;
    return saved;
  }, [view.order, baseSymbols]);

  // Lúc mở trang kho còn trống, nên cách xếp đã lưu phải chạy lại một lần khi dữ liệu đầu tiên về đủ:
  // mọi mã đã có giá tham chiếu, chờ thêm 500ms cho các kênh giá khớp và dư mua bán tới.
  const [dataEpoch, setDataEpoch] = useState(0);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribers: Array<() => void> = [];
    const stop = () => unsubscribers.splice(0).forEach((unsubscribe) => unsubscribe());
    const check = () => {
      if (timer || !baseSymbols.every((symbol) => getQuote(symbol).ref > 0)) return;
      stop();
      timer = setTimeout(() => setDataEpoch((epoch) => epoch + 1), 500);
    };
    for (const symbol of baseSymbols) unsubscribers.push(quoteStore.subscribeSymbol(symbol, check));
    check();
    return () => {
      stop();
      clearTimeout(timer);
    };
  }, [baseSymbols]);

  // Thứ tự hiển thị tính ngay trong lúc render, không qua useEffect, để chỉ số dòng luôn khớp thứ tự nền.
  // Đang xếp thì chỉ tính lại khi đổi cột, chiều, thứ tự nền hoặc khi dữ liệu đầu tiên về; giá đổi không làm dòng nhảy.
  const displayOrder = useMemo(
    () => (view.sort ? sortSymbols(baseOrder, getQuote, view.sort, SORT_GETTERS) : baseOrder),
    // dataEpoch chỉ dùng để buộc tính lại một lần khi dữ liệu đầu tiên về.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view.sort, baseOrder, dataEpoch],
  );

  // Lưu mỗi khi cấu hình đổi.
  useEffect(() => {
    savePrefs(storage.current, source, { ...prefs, tab: activeTab });
  }, [prefs, source, activeTab]);

  // Tab không phải VN30: lưu order/sort riêng vào khoá của tab đó.
  useEffect(() => {
    if (activeTab === "vn30") return;
    saveTabView(storage.current, source, activeTab, view);
  }, [activeTab, source, view.order, view.sort]);

  useEffect(() => {
    saveWatchlist(storage.current, source, watchlist);
  }, [watchlist, source]);

  // Nguồn mock cần danh sách mã để biết sàn và để lọc tab HNX/UPCOM.
  useEffect(() => {
    if (source !== "mock") {
      setInstrumentsState("ready");
      return;
    }
    let cancelled = false;
    setInstrumentsState("loading");
    fetch("/api/instruments")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((raw) => {
        if (cancelled) return;
        const list = instrumentsFromApi(raw);
        setInstruments(list);
        // Giờ mới biết đủ 50 mã: bỏ khỏi danh mục những mã không có ở nguồn này.
        const known = list.map((instrument) => instrument.symbol);
        setWatchlist((current) => sanitizeWatchlist(current, known));
        setInstrumentsState("ready");
      })
      .catch(() => {
        if (!cancelled) setInstrumentsState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  useEffect(() => {
    if (source === "ysflex") {
      // ysflex không có tin đợt: tính từ giờ Việt Nam, làm lại mỗi 15 giây.
      startClockPhase();
      startYsflexSource(VN30_YSFLEX);
    } else {
      startMockSource(VN30_MOCK);
    }
  }, [source]);

  // Đổi tab thì đăng ký mã mới, huỷ mã cũ (chỉ nguồn mock). Nhóm VN30 giữ đăng ký riêng.
  // Với ysflex, cả bốn tab dùng chung 30 mã VN30 nên không gửi thêm SUB_REQ.
  useEffect(() => {
    if (source !== "mock") return;
    setMockTabSymbols(baseSymbols, VN30_MOCK);
  }, [source, baseSymbols]);

  // Esc bỏ chọn dòng.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Esc khi đang mở hộp thoại chỉ đóng hộp thoại, không bỏ chọn dòng.
      if (event.key === "Escape" && !configOpen && !orderOpen && !loginOpen && !detailSymbol) setSelected(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [configOpen, orderOpen, loginOpen, detailSymbol]);

  // Sắp xếp / kéo thả của tab đang mở: VN30 ghi vào prefs, ba tab kia ghi vào tabViews.
  const setView = useCallback((updater: (current: { order: string[]; sort: SortState | null }) => { order: string[]; sort: SortState | null }) => {
    if (activeTab === "vn30") {
      setPrefs((current) => {
        const next = updater({ order: current.order, sort: current.sort });
        return { ...current, order: next.order, sort: next.sort };
      });
      return;
    }
    setTabViews((current) => ({
      ...current,
      [activeTab]: updater(current[activeTab] ?? { order: [], sort: null }),
    }));
  }, [activeTab]);

  const handleSort = useCallback((columnId: string) => {
    setView((current) => ({ ...current, sort: nextSort(current.sort, columnId) }));
  }, [setView]);

  // Dời theo mã, không theo chỉ số: nhấn giữ Alt+↓ có thể gửi phím mới trước khi bảng kịp vẽ lại.
  const handleMove = useCallback((symbol: string, to: number) => {
    setView((current) => {
      if (current.sort) return current;
      const base = current.order.length > 0 ? sanitizeOrder(current.order, baseSymbols) : baseSymbols;
      return { ...current, order: moveSymbol(base, symbol, to) };
    });
  }, [setView, baseSymbols]);

  const handleMoveBy = useCallback((symbol: string, delta: number) => {
    setView((current) => {
      if (current.sort) return current;
      const base = current.order.length > 0 ? sanitizeOrder(current.order, baseSymbols) : baseSymbols;
      const to = base.indexOf(symbol) + delta;
      return { ...current, order: moveSymbol(base, symbol, to) };
    });
  }, [setView, baseSymbols]);

  // Đổi tab. Tab bị tắt với nguồn này thì không đổi. Bỏ chọn dòng để không trỏ sang mã của tab khác.
  const handleTabChange = useCallback((tab: BoardTab) => {
    if (!tabEnabled(tab, source)) return;
    if (tab !== "vn30" && !tabViews[tab]) {
      // Nạp order/sort đã lưu của tab này lần đầu mở.
      const saved = loadTabView(storage.current, source, tab);
      setTabViews((current) => ({ ...current, [tab]: { order: saved.order, sort: saved.sort } }));
    }
    setPrefs((current) => ({ ...current, tab }));
    setSelected(null);
  }, [source, tabViews]);

  const closeConfig = useCallback(() => {
    setConfigOpen(false);
    gearRef.current?.focus();
  }, []);

  const applyColumns = useCallback((hidden: string[]) => {
    // Ẩn đúng cột đang xếp thì bỏ xếp, nếu không bảng bị xếp theo một cột không nhìn thấy.
    setPrefs((current) => ({
      ...current,
      hidden,
      sort: current.sort && hidden.includes(current.sort.columnId) ? null : current.sort,
    }));
    setConfigOpen(false);
    gearRef.current?.focus();
  }, []);

  const toggleCollapse = useCallback(() => {
    setPrefs((current) => ({ ...current, collapsed: !current.collapsed }));
  }, []);

  const toggleSelect = useCallback((symbol: string) => {
    setSelected((current) => (current === symbol ? null : symbol));
  }, []);

  // Mã hợp lệ của nguồn: ysflex chỉ 30 mã VN30; mock là 50 mã của server.
  const knownSymbols = useMemo(
    () => (source === "ysflex" ? VN30_YSFLEX : instruments.map((instrument) => instrument.symbol)),
    [source, instruments],
  );

  // Thêm mã vào danh mục quan tâm.
  const handleAddSymbol = useCallback(() => {
    const text = symbolInput;
    const symbolName = text.trim().toUpperCase();
    if (!symbolName) return;

    // Nguồn ysflex chỉ nhận 30 mã VN30; báo đúng câu riêng thay vì "Không có mã".
    if (source === "ysflex" && !VN30_YSFLEX.includes(symbolName)) {
      setWatchlistError("Nguồn YSFlex chỉ có 30 mã VN30");
      return;
    }
    // Mock chưa tải xong danh sách thì chưa biết mã nào có.
    if (source === "mock" && knownSymbols.length === 0) {
      setWatchlistError("Chưa tải được danh sách mã");
      return;
    }

    const result = addSymbol(watchlist, symbolName, knownSymbols);
    setWatchlistError(result.error);
    if (result.error) return;
    setWatchlist(result.list);
    setSymbolInput("");
    if (activeTab !== "watchlist") {
      setWatchlistNotice(`Đã thêm ${symbolName} vào DM quan tâm`);
    }
  }, [symbolInput, source, knownSymbols, watchlist, activeTab]);

  // Thông báo ngắn tự tắt sau 2 giây.
  useEffect(() => {
    if (!watchlistNotice) return;
    const timer = setTimeout(() => setWatchlistNotice(null), 2000);
    return () => clearTimeout(timer);
  }, [watchlistNotice]);

  // Thông báo ngắn tự tắt sau 3 giây (dùng chung cho thêm mã và gửi lệnh).
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleRemoveSymbol = useCallback((symbol: string) => {
    setWatchlist((current) => removeSymbol(current, symbol));
    setWatchlistError(null);
  }, []);

  // Callback ổn định, nhận mã: mở / đóng form không làm cả bảng vẽ lại.
  // `opener` là phần tử đã nhận cú bấm đúp, để Esc / Đóng trả con trỏ về đúng chỗ.
  const openOrderForm = useCallback((symbol: string, cell: CellKind, opener?: HTMLElement | null) => {
    const seed = draftFromCell(cell, getQuote(symbol));
    if (!seed) return;
    const fallback = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setOrderForm({ symbol, cell, seed, opener: opener ?? fallback });
  }, []);

  // MUA trong popup: giá bán tốt nhất (Giá 1 dư bán); BÁN: giá mua tốt nhất. Chưa có thì theo giá khớp.
  const orderFromDetail = useCallback((symbol: string, side: Side) => {
    const quote = getQuote(symbol);
    const book = side === "BUY" ? quote.asks : quote.bids;
    const cell: CellKind = book[0]?.[0] ? { kind: side === "BUY" ? "ask" : "bid", level: 0 } : { kind: "symbol" };
    openOrderForm(symbol, cell);
  }, [openOrderForm]);

  // Esc / Đóng trả con trỏ về ô đã bấm đúp. Đọc qua ref để không gọi focus
  // bên trong hàm cập nhật state (hàm đó phải thuần, React có thể gọi hai lần).
  const orderFormRef = useRef(orderForm);
  orderFormRef.current = orderForm;
  const closeOrderForm = useCallback(() => {
    const opener = orderFormRef.current?.opener;
    setOrderForm(null);
    opener?.focus();
  }, []);

  const vn30View = useMemo(() => ({
    value: stats.index.value,
    change: stats.index.change,
    changePct: stats.index.changePct,
    up: stats.movers.up,
    flat: stats.movers.flat,
    down: stats.movers.down,
    totalVolume: stats.totalVolume,
    totalValue: stats.turnover,
    points: stats.points,
  }), [stats]);

  return (
    <div className={`pb-app${prefs.collapsed ? " is-collapsed" : ""}`}>
      <TopBar
        totalValue={stats.turnover}
        session={loggedIn ? sessionState.session : null}
        onLogin={source === "mock" ? openLogin : undefined}
        onLogout={() => void logout()}
      />
      <MainMenu />
      {!prefs.collapsed && <IndexStrip vn30={vn30View} />}
      <BoardTabs
        collapsed={prefs.collapsed}
        onToggleCollapse={toggleCollapse}
        onOpenColumnConfig={() => setConfigOpen(true)}
        gearRef={gearRef}
        source={source}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        symbolInput={symbolInput}
        onSymbolInput={setSymbolInput}
        onAddSymbol={handleAddSymbol}
        watchlistError={watchlistError}
        watchlistNotice={watchlistNotice}
      />
      <div className={`pb-workspace${bookOpen && loggedIn ? " has-book" : ""}`}>
        <main className="pb-board-wrap" aria-label="Bảng giá">
          <PriceBoard
            symbols={displayOrder}
            hidden={prefs.hidden}
            sort={view.sort}
            onSort={handleSort}
            onMove={handleMove}
            onMoveBy={handleMoveBy}
            selected={selected}
            onSelect={toggleSelect}
            onOpenOrder={openOrderForm}
            onOpenDetail={openDetail}
            showRemove={activeTab === "watchlist"}
            onRemove={handleRemoveSymbol}
            emptyMessage={
              baseSymbols.length === 0
                ? (activeTab === "watchlist"
                  ? "Chưa có mã nào. Gõ mã vào ô Nhập mã CK để thêm."
                  : instrumentsState === "loading"
                    ? "Đang tải danh sách mã..."
                    : instrumentsState === "error"
                      ? "Chưa tải được danh sách mã"
                      : "Chưa có mã nào.")
                : null
            }
          />
        </main>
        {/* Sổ lệnh chỉ với nguồn mock; mở thì vùng bảng giá ngắn lại, không che bảng. */}
        {bookOpen && loggedIn && (
          <OrderBookPanel source={source} onModify={openModify} />
        )}
      </div>
      <FooterBar
        status={status as ConnectionStatusView}
        source={source}
        phase={phase}
        bookOpen={bookOpen}
        bookCount={bookCount}
        onToggleBook={loggedIn ? () => setBookOpen((current) => !current) : undefined}
      />
      {configOpen && (
        <ColumnConfigDialog
          hidden={prefs.hidden}
          onApply={applyColumns}
          onClose={closeConfig}
        />
      )}
      {/* Popup chi tiết vẽ trước form đặt lệnh: hai lớp cùng z-index, lớp sau nằm trên, nên MUA/BÁN mở form đè lên popup. */}
      {detailSymbol && (
        <SymbolDetailDialog
          symbol={detailSymbol}
          name={instruments.find((item) => item.symbol === detailSymbol)?.name ?? detailSymbol}
          covered={orderOpen || loginOpen}
          onOrder={orderFromDetail}
          onClose={closeDetail}
        />
      )}
      {orderForm && (
        <OrderDialog
          key={`${orderForm.symbol}-${orderForm.cell.kind}-${orderForm.cell.level ?? 0}`}
          symbol={orderForm.symbol}
          seed={orderForm.seed}
          source={source}
          onPlaced={(summary) => setToast(summary)}
          onClose={closeOrderForm}
          loggedIn={loggedIn}
          onRequestLogin={() => { closeOrderForm(); openLogin(); }}
        />
      )}
      {loginOpen && source === "mock" && (
        <LoginDialog expired={sessionState.expired} onClose={closeLogin} />
      )}
      {modifyTarget && loggedIn && (
        <ModifyOrderDialog
          orderId={modifyTarget}
          source={source}
          onClose={closeModify}
        />
      )}
      {toast && (
        <div className="pb-toast" role="status" data-testid="app-toast">{toast}</div>
      )}
    </div>
  );
}
