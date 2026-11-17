import { useCallback, useEffect, useRef, useState } from "react";
import { BoardTabs } from "./components/board-tabs";
import { ColumnConfigDialog } from "./components/column-config-dialog";
import { FooterBar, type ConnectionStatusView, type SourceView } from "./components/footer-bar";
import { IndexStrip } from "./components/index-strip";
import { LoginDialog } from "./components/login-dialog";
import { MainMenu } from "./components/main-menu";
import { ModifyOrderDialog } from "./components/modify-order-dialog";
import { OrderBookPanel } from "./components/order-book-panel";
import { OrderDialog } from "./components/order-dialog";
import { PriceBoard } from "./components/price-board";
import { SymbolDetailDialog } from "./components/symbol-detail-dialog";
import { TopBar } from "./components/top-bar";
import { useAutoClear } from "./hooks/use-auto-clear";
import { useBoardView } from "./hooks/use-board-view";
import { useInstruments, type InstrumentsState } from "./hooks/use-instruments";
import { useMarketSource } from "./hooks/use-market-source";
import { useOrderBookToggle } from "./hooks/use-order-book-toggle";
import { useOrderForm } from "./hooks/use-order-form";
import { useWatchlist } from "./hooks/use-watchlist";
import { useOpenOrderCount } from "./lib/account-store";
import { safeStorage } from "./lib/board-prefs";
import type { BoardTab } from "./lib/board-tabs-data";
import { useVn30Stats } from "./lib/derived";
import { useConnectionStatus } from "./lib/quote-store";
import { logout, useSession } from "./lib/session";
import { useSessionPhase } from "./lib/session-phase";
import { VN30_MOCK, VN30_YSFLEX } from "./lib/vn30";

// Mặc định dùng thị trường giả lập. ?nguon=ysflex chuyển sang giá thật của Yuanta, đi qua gateway của server
// (chỉ đọc, 30 mã VN30); nút nhỏ ở chân trang đổi qua lại giữa hai nguồn.
const readSource = (): SourceView =>
  new URLSearchParams(location.search).get("nguon") === "ysflex" ? "ysflex" : "mock";

// Dòng chữ khi tab không có mã nào.
function emptyMessage(count: number, tab: BoardTab, instruments: InstrumentsState): string | null {
  if (count > 0) return null;
  if (tab === "watchlist") return "Chưa có mã nào. Gõ mã vào ô Nhập mã CK để thêm.";
  if (instruments === "loading") return "Đang tải danh sách mã...";
  if (instruments === "error") return "Chưa tải được danh sách mã";
  return "Chưa có mã nào.";
}

export function App() {
  // Chốt nguồn một lần lúc mở trang để nhãn chân trang khớp đúng nguồn đang chạy.
  const [source] = useState<SourceView>(readSource);
  const storage = useRef(safeStorage()).current;
  const status = useConnectionStatus();
  const phase = useSessionPhase();

  // Tổng GTGD ở thanh trên luôn tính trên nhóm VN30, không theo tab đang mở.
  const vn30Symbols = source === "ysflex" ? VN30_YSFLEX : VN30_MOCK;
  const stats = useVn30Stats(vn30Symbols);

  const { instruments, state: instrumentsState } = useInstruments(source);
  const watch = useWatchlist(storage, source, instruments);
  const board = useBoardView({ storage, source, instruments, watchlist: watch.watchlist, vn30Symbols });
  useMarketSource(source, board.baseSymbols);

  const [selected, setSelected] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const gearRef = useRef<HTMLButtonElement | null>(null);
  const orderForm = useOrderForm();

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

  // Sổ lệnh: chỉ đọc số lệnh đang chờ, nên App không vẽ lại theo từng lần khớp.
  const bookCount = useOpenOrderCount();
  const [bookOpen, toggleBook] = useOrderBookToggle(storage, source);
  // Giữ id, không giữ bản chụp lệnh: hộp thoại sửa tự đọc lệnh mới nhất từ kho.
  const [modifyTarget, setModifyTarget] = useState<string | null>(null);
  const openModify = useCallback((order: { id: string }) => setModifyTarget(order.id), []);
  const closeModify = useCallback(() => setModifyTarget(null), []);

  // Thông báo ngắn sau khi gửi lệnh thành công, tự tắt sau 3 giây.
  const [toast, setToast] = useState<string | null>(null);
  useAutoClear(toast, () => setToast(null), 3000);

  // Esc bỏ chọn dòng. Esc khi đang mở hộp thoại chỉ đóng hộp thoại, không bỏ chọn dòng.
  const orderOpen = orderForm.form !== null;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !configOpen && !orderOpen && !loginOpen && !detailSymbol) setSelected(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [configOpen, orderOpen, loginOpen, detailSymbol]);

  // Đổi tab thì bỏ chọn dòng để không trỏ sang mã của tab khác.
  const { changeTab, setHidden } = board;
  const handleTabChange = useCallback((tab: BoardTab) => {
    if (changeTab(tab)) setSelected(null);
  }, [changeTab]);

  const closeConfig = useCallback(() => {
    setConfigOpen(false);
    gearRef.current?.focus();
  }, []);
  const applyColumns = useCallback((hidden: string[]) => {
    setHidden(hidden);
    closeConfig();
  }, [setHidden, closeConfig]);

  const toggleSelect = useCallback((symbol: string) => {
    setSelected((current) => (current === symbol ? null : symbol));
  }, []);

  return (
    <div className={`pb-app${board.collapsed ? " is-collapsed" : ""}`}>
      <TopBar
        totalValue={stats.turnover}
        session={loggedIn ? sessionState.session : null}
        onLogin={source === "mock" ? openLogin : undefined}
        onLogout={() => void logout()}
      />
      <MainMenu />
      {!board.collapsed && <IndexStrip phase={phase} />}
      <BoardTabs
        collapsed={board.collapsed}
        onToggleCollapse={board.toggleCollapse}
        onOpenColumnConfig={() => setConfigOpen(true)}
        gearRef={gearRef}
        source={source}
        activeTab={board.activeTab}
        onTabChange={handleTabChange}
        symbolInput={watch.input}
        onSymbolInput={watch.setInput}
        onAddSymbol={() => watch.add(board.activeTab)}
        watchlistError={watch.error}
        watchlistNotice={watch.notice}
      />
      <div className={`pb-workspace${bookOpen && loggedIn ? " has-book" : ""}`}>
        <main className="pb-board-wrap" aria-label="Bảng giá">
          <PriceBoard
            symbols={board.displayOrder}
            hidden={board.hidden}
            sort={board.sort}
            onSort={board.sortBy}
            onMove={board.moveTo}
            onMoveBy={board.moveBy}
            selected={selected}
            onSelect={toggleSelect}
            onOpenOrder={orderForm.open}
            onOpenDetail={openDetail}
            showRemove={board.activeTab === "watchlist"}
            onRemove={watch.remove}
            emptyMessage={emptyMessage(board.baseSymbols.length, board.activeTab, instrumentsState)}
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
        onToggleBook={loggedIn ? toggleBook : undefined}
      />
      {configOpen && (
        <ColumnConfigDialog hidden={board.hidden} onApply={applyColumns} onClose={closeConfig} />
      )}
      {/* Popup chi tiết vẽ trước form đặt lệnh: hai lớp cùng z-index, lớp sau nằm trên, nên MUA/BÁN mở form đè lên popup. */}
      {detailSymbol && (
        <SymbolDetailDialog
          symbol={detailSymbol}
          name={instruments.find((item) => item.symbol === detailSymbol)?.name ?? detailSymbol}
          covered={orderOpen || loginOpen}
          onOrder={orderForm.openFromDetail}
          onClose={closeDetail}
        />
      )}
      {orderForm.form && (
        <OrderDialog
          key={`${orderForm.form.symbol}-${orderForm.form.cell.kind}-${orderForm.form.cell.level ?? 0}`}
          symbol={orderForm.form.symbol}
          seed={orderForm.form.seed}
          source={source}
          onPlaced={setToast}
          onClose={orderForm.close}
          loggedIn={loggedIn}
          onRequestLogin={() => { orderForm.close(); openLogin(); }}
        />
      )}
      {loginOpen && source === "mock" && (
        <LoginDialog expired={sessionState.expired} onClose={closeLogin} />
      )}
      {modifyTarget && loggedIn && (
        <ModifyOrderDialog orderId={modifyTarget} source={source} onClose={closeModify} />
      )}
      {toast && (
        <div className="pb-toast" role="status" data-testid="app-toast">{toast}</div>
      )}
    </div>
  );
}
