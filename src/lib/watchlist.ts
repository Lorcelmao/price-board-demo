import type { SourceKey, StorageLike } from "./board-prefs";

export type { StorageLike };

// Danh mục quan tâm. Hàm thuần: trả lỗi bằng giá trị, không ném.
// Mã được chuẩn hoá về chữ hoa, bỏ khoảng trắng hai đầu.

export const MAX_WATCHLIST = 30;

export const normalizeSymbol = (text: string): string => text.trim().toUpperCase();

export interface AddResult {
  list: string[];
  error: string | null;
}

// Thêm một mã vào danh mục. `known` là các mã của nguồn đang dùng.
export function addSymbol(list: string[], text: string, known: string[]): AddResult {
  const symbol = normalizeSymbol(text);
  if (!symbol) return { list, error: null };

  if (!known.includes(symbol)) return { list, error: `Không có mã ${symbol}` };
  if (list.includes(symbol)) return { list, error: `${symbol} đã có trong danh mục` };
  if (list.length >= MAX_WATCHLIST) {
    return { list, error: `Danh mục chỉ chứa tối đa ${MAX_WATCHLIST} mã.` };
  }
  return { list: [...list, symbol], error: null };
}

export function removeSymbol(list: string[], symbol: string): string[] {
  return list.includes(symbol) ? list.filter((item) => item !== symbol) : list.slice();
}

// Đối chiếu với danh sách mã của nguồn: bỏ mã lạ, bỏ trùng, cắt về giới hạn.
// Sai kiểu hoặc rỗng thì trả mảng rỗng.
export function sanitizeWatchlist(saved: unknown, known: string[]): string[] {
  if (!Array.isArray(saved) || saved.length === 0) return [];
  if (!saved.every((item) => typeof item === "string")) return [];
  const knownSet = new Set(known);
  const result: string[] = [];
  for (const item of saved as string[]) {
    const symbol = normalizeSymbol(item);
    if (!knownSet.has(symbol) || result.includes(symbol)) continue;
    result.push(symbol);
    if (result.length >= MAX_WATCHLIST) break;
  }
  return result;
}

export const watchlistKey = (source: SourceKey): string => `price-board-demo:dm-quan-tam:v1:${source}`;

export function loadWatchlist(storage: StorageLike, source: SourceKey): string[] {
  try {
    const raw = storage.getItem(watchlistKey(source));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) return [];
    return parsed as string[];
  } catch {
    return [];
  }
}

export function saveWatchlist(storage: StorageLike, source: SourceKey, list: string[]): void {
  try {
    storage.setItem(watchlistKey(source), JSON.stringify(list));
  } catch {
    /* không lưu được thì thôi, trang vẫn chạy */
  }
}

// Danh mục lúc mở trang. Với ysflex, danh sách mã (30 mã VN30) có sẵn nên đối chiếu ngay.
// Với mock, 50 mã chỉ có sau khi tải `/api/instruments`: lúc này chỉ bỏ trùng và dữ liệu sai kiểu,
// việc bỏ mã lạ để sau khi tải xong. Đối chiếu sớm với nhóm VN30 sẽ xoá mất mã như SHS, PNJ.
export function initialWatchlist(saved: unknown, source: SourceKey, ysflexSymbols: string[]): string[] {
  if (source === "ysflex") return sanitizeWatchlist(saved, ysflexSymbols);
  const strings = Array.isArray(saved) ? saved.filter((item): item is string => typeof item === "string") : [];
  return sanitizeWatchlist(saved, strings.map(normalizeSymbol));
}
