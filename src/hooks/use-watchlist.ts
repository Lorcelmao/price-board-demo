import { useCallback, useEffect, useMemo, useState } from "react";
import type { SourceView } from "../components/footer-bar";
import type { StorageLike } from "../lib/board-prefs";
import type { BoardTab } from "../lib/board-tabs-data";
import { VN30_YSFLEX } from "../lib/vn30";
import {
  addSymbol,
  initialWatchlist,
  loadWatchlist,
  removeSymbol,
  sanitizeWatchlist,
  saveWatchlist,
} from "../lib/watchlist";
import type { Instrument } from "../../shared/protocol";
import { useAutoClear } from "./use-auto-clear";

// Danh mục quan tâm và ô "Nhập mã CK".
export function useWatchlist(storage: StorageLike, source: SourceView, instruments: Instrument[]) {
  // Đọc một lần rồi đối chiếu với danh sách mã của nguồn.
  // Với mock, danh sách 50 mã chỉ có sau khi tải `/api/instruments`, nên lúc mở trang chỉ bỏ trùng và
  // dữ liệu sai kiểu; việc bỏ mã lạ làm sau khi tải xong (effect bên dưới). Không được đối chiếu với
  // VN30_MOCK: làm vậy sẽ xoá mất mã ngoài VN30 như SHS, PNJ rồi ghi đè vào kho lưu.
  const [watchlist, setWatchlist] = useState<string[]>(() =>
    initialWatchlist(loadWatchlist(storage, source), source, VN30_YSFLEX));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [input, setInput] = useState("");

  // Mã hợp lệ của nguồn: ysflex chỉ 30 mã VN30; mock là 50 mã của server.
  const knownSymbols = useMemo(
    () => (source === "ysflex" ? VN30_YSFLEX : instruments.map((instrument) => instrument.symbol)),
    [source, instruments],
  );

  // Giờ mới biết đủ 50 mã: bỏ khỏi danh mục những mã không có ở nguồn này.
  useEffect(() => {
    if (source === "mock" && instruments.length > 0) setWatchlist((current) => sanitizeWatchlist(current, knownSymbols));
  }, [source, instruments, knownSymbols]);

  useEffect(() => {
    saveWatchlist(storage, source, watchlist);
  }, [storage, watchlist, source]);

  useAutoClear(notice, () => setNotice(null), 2000);

  // Thêm mã đang gõ. Đang ở tab khác thì báo ngắn để người dùng biết mã đã vào danh mục.
  const add = useCallback((activeTab: BoardTab) => {
    const symbolName = input.trim().toUpperCase();
    if (!symbolName) return;

    // Nguồn ysflex chỉ nhận 30 mã VN30; báo đúng câu riêng thay vì "Không có mã".
    if (source === "ysflex" && !VN30_YSFLEX.includes(symbolName)) {
      setError("Nguồn YSFlex chỉ có 30 mã VN30");
      return;
    }
    // Mock chưa tải xong danh sách thì chưa biết mã nào có.
    if (source === "mock" && knownSymbols.length === 0) {
      setError("Chưa tải được danh sách mã");
      return;
    }

    const result = addSymbol(watchlist, symbolName, knownSymbols);
    setError(result.error);
    if (result.error) return;
    setWatchlist(result.list);
    setInput("");
    if (activeTab !== "watchlist") setNotice(`Đã thêm ${symbolName} vào DM quan tâm`);
  }, [input, source, knownSymbols, watchlist]);

  const remove = useCallback((symbol: string) => {
    setWatchlist((current) => removeSymbol(current, symbol));
    setError(null);
  }, []);

  return { watchlist, error, notice, input, setInput, add, remove };
}
