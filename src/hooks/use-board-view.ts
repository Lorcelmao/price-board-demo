import { useCallback, useEffect, useMemo, useState } from "react";
import type { SourceView } from "../components/footer-bar";
import {
  loadPrefs,
  loadTabView,
  moveSymbol,
  nextSort,
  sanitizeOrder,
  savePrefs,
  saveTabView,
  sortSymbols,
  type BoardPrefs,
  type SortState,
  type StorageLike,
} from "../lib/board-prefs";
import { symbolsForTab, tabEnabled, type BoardTab } from "../lib/board-tabs-data";
import { COLUMNS } from "../lib/columns";
import { getQuote, quoteStore } from "../lib/quote-store";
import type { Instrument } from "../../shared/protocol";

type TabView = { order: string[]; sort: SortState | null };

// Bảng hàm lấy giá trị sắp xếp, lấy từ định nghĩa cột duy nhất.
const SORT_GETTERS = Object.fromEntries(
  COLUMNS.filter((column) => column.sortValue).map((column) => [column.id, column.sortValue!]),
);

// Cột sắp xếp đã lưu mà không còn tồn tại thì bỏ, nếu không tay kéo bị khoá mà không có biểu tượng nào.
const validSort = (sort: SortState | null): SortState | null => (sort && SORT_GETTERS[sort.columnId] ? sort : null);

interface BoardViewInput {
  storage: StorageLike;
  source: SourceView;
  instruments: Instrument[];
  watchlist: string[];
  vn30Symbols: string[];
}

// Cấu hình bảng giá: tab đang mở, cột ẩn, thu gọn, thứ tự và cách xếp của từng tab, kèm phần lưu lại.
export function useBoardView({ storage, source, instruments, watchlist, vn30Symbols }: BoardViewInput) {
  // Cấu hình đọc một lần lúc mở trang; đối chiếu với danh sách mã của nguồn đang dùng.
  const [prefs, setPrefs] = useState<BoardPrefs>(() => {
    const saved = loadPrefs(storage, source);
    return { ...saved, sort: validSort(saved.sort), order: sanitizeOrder(saved.order, vn30Symbols) };
  });

  // Tab đang mở: lưu trong khoá chính. Tab bị tắt với nguồn này thì quay về VN30.
  const activeTab: BoardTab = tabEnabled(prefs.tab, source) ? prefs.tab : "vn30";

  // Cấu hình order/sort của từng tab. VN30 dùng prefs.order/prefs.sort; các tab khác dùng state riêng,
  // nạp từ khoá `<khoá chính>:tab:<tab>` khi đổi tab.
  // Tab đang mở lúc tải trang phải được nạp ngay, nếu không effect lưu bên dưới sẽ ghi đè
  // cấu hình đã lưu của tab đó bằng giá trị rỗng.
  const [tabViews, setTabViews] = useState<Record<string, TabView>>(() => {
    const initialTab = prefs.tab;
    if (initialTab === "vn30" || !tabEnabled(initialTab, source)) return {};
    const saved = loadTabView(storage, source, initialTab);
    return { [initialTab]: { order: saved.order, sort: validSort(saved.sort) } };
  });

  // Mã của tab đang mở, theo thứ tự mặc định (chưa xếp, chưa kéo).
  const baseSymbols = useMemo(
    () => symbolsForTab(activeTab, source, instruments, watchlist, vn30Symbols),
    [activeTab, source, instruments, watchlist, vn30Symbols],
  );

  // Order/sort đang dùng cho tab này.
  const view: TabView = activeTab === "vn30"
    ? { order: prefs.order, sort: prefs.sort }
    : tabViews[activeTab] ?? { order: [], sort: null };

  // Thứ tự nền là baseSymbols đã đối chiếu; order đã lưu chỉ áp cho tab đó.
  const baseOrder = useMemo(
    () => (view.order.length > 0 ? sanitizeOrder(view.order, baseSymbols) : baseSymbols),
    [view.order, baseSymbols],
  );

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
    savePrefs(storage, source, { ...prefs, tab: activeTab });
  }, [storage, prefs, source, activeTab]);

  // Tab không phải VN30: lưu order/sort riêng vào khoá của tab đó.
  useEffect(() => {
    if (activeTab === "vn30") return;
    saveTabView(storage, source, activeTab, view);
    // view là object mới mỗi lần render; chỉ lưu khi order hoặc sort đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage, activeTab, source, view.order, view.sort]);

  // Sắp xếp / kéo thả của tab đang mở: VN30 ghi vào prefs, các tab khác ghi vào tabViews.
  const setView = useCallback((updater: (current: TabView) => TabView) => {
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

  const sortBy = useCallback((columnId: string) => {
    setView((current) => ({ ...current, sort: nextSort(current.sort, columnId) }));
  }, [setView]);

  // Dời theo mã, không theo chỉ số: nhấn giữ Alt+↓ có thể gửi phím mới trước khi bảng kịp vẽ lại.
  const moveTo = useCallback((symbol: string, to: number) => {
    setView((current) => {
      if (current.sort) return current;
      const base = current.order.length > 0 ? sanitizeOrder(current.order, baseSymbols) : baseSymbols;
      return { ...current, order: moveSymbol(base, symbol, to) };
    });
  }, [setView, baseSymbols]);

  const moveBy = useCallback((symbol: string, delta: number) => {
    setView((current) => {
      if (current.sort) return current;
      const base = current.order.length > 0 ? sanitizeOrder(current.order, baseSymbols) : baseSymbols;
      return { ...current, order: moveSymbol(base, symbol, base.indexOf(symbol) + delta) };
    });
  }, [setView, baseSymbols]);

  // Đổi tab. Trả false khi tab bị tắt với nguồn này (không đổi gì).
  const changeTab = useCallback((tab: BoardTab): boolean => {
    if (!tabEnabled(tab, source)) return false;
    if (tab !== "vn30" && !tabViews[tab]) {
      // Nạp order/sort đã lưu của tab này lần đầu mở.
      const saved = loadTabView(storage, source, tab);
      setTabViews((current) => ({ ...current, [tab]: { order: saved.order, sort: saved.sort } }));
    }
    setPrefs((current) => ({ ...current, tab }));
    return true;
  }, [storage, source, tabViews]);

  // Ẩn đúng cột đang xếp thì bỏ xếp, nếu không bảng bị xếp theo một cột không nhìn thấy.
  const setHidden = useCallback((hidden: string[]) => {
    setPrefs((current) => ({
      ...current,
      hidden,
      sort: current.sort && hidden.includes(current.sort.columnId) ? null : current.sort,
    }));
  }, []);

  const toggleCollapse = useCallback(() => {
    setPrefs((current) => ({ ...current, collapsed: !current.collapsed }));
  }, []);

  return {
    hidden: prefs.hidden,
    collapsed: prefs.collapsed,
    activeTab,
    sort: view.sort,
    baseSymbols,
    displayOrder,
    sortBy,
    moveTo,
    moveBy,
    changeTab,
    setHidden,
    toggleCollapse,
  };
}
