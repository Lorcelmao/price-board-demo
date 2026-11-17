import type { BoardQuote } from "./quote-store-core";
import type { BoardTab } from "./board-tabs-data";

// Logic thuần cho tương tác bảng: sắp xếp, kéo thả, đọc và ghi cấu hình.
// Không đụng React hay DOM, nên test được bằng Node. Đặc tả mục 8, 10.5.

export type SortDirection = "asc" | "desc";

export interface SortState {
  columnId: string;
  direction: SortDirection;
}

export interface BoardPrefs {
  order: string[];
  sort: SortState | null;
  hidden: string[];
  collapsed: boolean;
  // Tab đang mở. Khoá cũ vẫn giữ đúng bốn trường trên; đây là trường thêm.
  tab: BoardTab;
}

export const DEFAULT_PREFS: BoardPrefs = {
  order: [],
  sort: null,
  hidden: [],
  collapsed: false,
  tab: "vn30",
};

// `tab` chỉ nhận bốn giá trị hợp lệ; giá trị lạ thì về VN30.
const isTab = (value: unknown): value is BoardTab =>
  value === "vn30" || value === "hnx" || value === "upcom" || value === "watchlist";

// Chu trình: chưa xếp → giảm dần → tăng dần → bỏ xếp. Bấm cột khác thì bắt đầu lại từ giảm dần.
export function nextSort(current: SortState | null, columnId: string): SortState | null {
  if (!current || current.columnId !== columnId) return { columnId, direction: "desc" };
  if (current.direction === "desc") return { columnId, direction: "asc" };
  return null;
}

export type SortValueGetter = (quote: BoardQuote) => number | string | null | undefined;

// Sắp xếp một lần theo giá trị lúc bấm. Ô trống, 0 hoặc không có luôn nằm cuối ở cả hai chiều.
// Sắp xếp ổn định: giá trị bằng nhau giữ thứ tự trong `order`.
export function sortSymbols(
  order: string[],
  getQuote: (symbol: string) => BoardQuote,
  sort: SortState | null,
  getters: Record<string, SortValueGetter>,
): string[] {
  if (!sort) return order.slice();
  const getter = getters[sort.columnId];
  if (!getter) return order.slice();

  const empties: string[] = [];
  const present: Array<{ symbol: string; value: number | string; index: number }> = [];

  order.forEach((symbol, index) => {
    const raw = getter(getQuote(symbol));
    const empty = raw === null || raw === undefined || raw === "" || raw === 0;
    if (empty) empties.push(symbol);
    else present.push({ symbol, value: raw as number | string, index });
  });

  const sign = sort.direction === "desc" ? -1 : 1;
  present.sort((a, b) => {
    const result = typeof a.value === "number" && typeof b.value === "number"
      ? a.value - b.value
      : String(a.value).localeCompare(String(b.value));
    // Bằng nhau thì giữ thứ tự ban đầu.
    return result === 0 ? a.index - b.index : result * sign;
  });

  return [...present.map((item) => item.symbol), ...empties];
}

// Chuyển một mã tới vị trí mới. Vị trí không hợp lệ thì trả nguyên mảng.
export function moveSymbol(order: string[], symbol: string, toIndex: number): string[] {
  const from = order.indexOf(symbol);
  if (from < 0) return order.slice();
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= order.length) return order.slice();
  if (from === toIndex) return order.slice();
  const next = order.slice();
  next.splice(from, 1);
  next.splice(toIndex, 0, symbol);
  return next;
}

// Đối chiếu thứ tự đã lưu với danh sách mã hiện có: bỏ mã không còn, thêm mã mới vào cuối,
// bỏ mã trùng. Mảng rỗng hoặc sai kiểu thì dùng danh sách hiện có.
export function sanitizeOrder(saved: unknown, symbols: string[]): string[] {
  if (!Array.isArray(saved) || saved.length === 0) return symbols.slice();
  if (!saved.every((item) => typeof item === "string")) return symbols.slice();

  const known = new Set(symbols);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const symbol of saved as string[]) {
    if (!known.has(symbol) || seen.has(symbol)) continue;
    seen.add(symbol);
    result.push(symbol);
  }
  for (const symbol of symbols) {
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    result.push(symbol);
  }
  return result;
}

// localStorage có thể bị chặn hoặc báo lỗi; chỉ cần ba hàm này.
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type SourceKey = "ysflex" | "mock";

export const storageKey = (source: SourceKey): string => `price-board-demo:bang-gia:v1:${source}`;

const isSortState = (value: unknown): value is SortState => {
  if (!value || typeof value !== "object") return false;
  const { columnId, direction } = value as Record<string, unknown>;
  return typeof columnId === "string"
    && (direction === "asc" || direction === "desc");
};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string") ? (value as string[]) : [];

// Đọc cấu hình. Dữ liệu hỏng, sai kiểu hoặc storage ném lỗi đều trả mặc định, không ném.
export function loadPrefs(storage: StorageLike, source: SourceKey): BoardPrefs {
  try {
    const raw = storage.getItem(storageKey(source));
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_PREFS };
    return {
      order: stringArray(parsed.order),
      sort: isSortState(parsed.sort) ? parsed.sort : null,
      hidden: stringArray(parsed.hidden),
      collapsed: parsed.collapsed === true,
      tab: isTab(parsed.tab) ? parsed.tab : "vn30",
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

// Ghi cấu hình. Lỗi (storage bị chặn, hết chỗ) bị nuốt để không làm sập trang.
export function savePrefs(storage: StorageLike, source: SourceKey, prefs: BoardPrefs): void {
  try {
    storage.setItem(storageKey(source), JSON.stringify(prefs));
  } catch {
    /* không lưu được thì thôi, trang vẫn chạy */
  }
}

// Trình duyệt có thể chặn localStorage ngay khi truy cập; trả về bộ nhớ tạm trong trường hợp đó.
export function safeStorage(): StorageLike {
  try {
    const probe = "__price_board_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const memory = new Map<string, string>();
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => void memory.set(key, value),
      removeItem: (key) => void memory.delete(key),
    };
  }
}

// Thứ tự và cách xếp riêng của một tab. Tab VN30 dùng trường order/sort
// trong khoá chính; các tab khác dùng khoá riêng để dữ liệu đã lưu từ
// bản trước vẫn giữ đúng thứ tự cũ ở VN30.
export interface TabView {
  order: string[];
  sort: SortState | null;
}

export const NOT_VN30_TABS = ["hnx", "upcom", "watchlist"] as const;

export const tabStorageKey = (source: SourceKey, tab: BoardTab): string =>
  `${storageKey(source)}:tab:${tab}`;

export function loadTabView(storage: StorageLike, source: SourceKey, tab: BoardTab): TabView {
  try {
    const raw = storage.getItem(tabStorageKey(source, tab));
    if (!raw) return { order: [], sort: null };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return { order: [], sort: null };
    return {
      order: stringArray(parsed.order),
      sort: isSortState(parsed.sort) ? parsed.sort : null,
    };
  } catch {
    return { order: [], sort: null };
  }
}

export function saveTabView(storage: StorageLike, source: SourceKey, tab: BoardTab, view: TabView): void {
  try {
    storage.setItem(tabStorageKey(source, tab), JSON.stringify({ order: view.order, sort: view.sort }));
  } catch {
    /* không lưu được thì thôi */
  }
}
