import type { Instrument } from "../../shared/protocol";
import type { Exchange } from "../../shared/market-rules";
import type { SourceKey } from "./board-prefs";

// Danh sách mã của từng tab và sàn của từng mã.
// Hàm thuần: danh sách instruments được truyền vào, không gọi mạng ở đây.

export type BoardTab = "watchlist" | "vn30" | "hnx" | "upcom";

// Nguồn ysflex chỉ dùng 30 mã VN30, nên HNX và UPCOM chỉ chạy với mock.
export const YSFLEX_TAB_NOTICE =
  "Chỉ có với nguồn mock: phép nối YSFlex chỉ được duyệt cho 30 mã VN30";

export function tabEnabled(tab: BoardTab, source: SourceKey): boolean {
  if (source === "ysflex" && (tab === "hnx" || tab === "upcom")) return false;
  return true;
}

const byExchange = (instruments: Instrument[], exchange: Exchange): string[] =>
  instruments
    .filter((instrument) => instrument.exchange === exchange)
    .map((instrument) => instrument.symbol)
    .sort((a, b) => a.localeCompare(b));

export function symbolsForTab(
  tab: BoardTab,
  source: SourceKey,
  instruments: Instrument[],
  watchlist: string[],
  vn30: string[],
): string[] {
  switch (tab) {
    case "vn30":
      return vn30;
    case "watchlist":
      return watchlist;
    case "hnx":
      return tabEnabled("hnx", source) ? byExchange(instruments, "HNX") : [];
    case "upcom":
      return tabEnabled("upcom", source) ? byExchange(instruments, "UPCOM") : [];
    default:
      return [];
  }
}

export function exchangeOf(symbol: string, source: SourceKey, instruments: Instrument[]): Exchange {
  // Nguồn ysflex: mọi mã đều là HOSE, đúng như tin ST (t207 = HO).
  if (source === "ysflex") return "HOSE";
  return instruments.find((instrument) => instrument.symbol === symbol)?.exchange ?? "HOSE";
}

// GET /api/instruments có thể trả dữ liệu hỏng; chỉ nhận phần tử có đủ trường bắt buộc.
export function instrumentsFromApi(raw: unknown): Instrument[] {
  if (!Array.isArray(raw)) return [];
  const result: Instrument[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return [];
    const entry = item as Partial<Instrument>;
    if (typeof entry.symbol !== "string") return [];
    if (entry.exchange !== "HOSE" && entry.exchange !== "HNX" && entry.exchange !== "UPCOM") continue;
    result.push({
      symbol: entry.symbol,
      name: typeof entry.name === "string" ? entry.name : entry.symbol,
      exchange: entry.exchange,
      ref: Number(entry.ref) || 0,
      ceil: Number(entry.ceil) || 0,
      floor: Number(entry.floor) || 0,
    });
  }
  return result;
}
