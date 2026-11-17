import { useEffect, useState } from "react";
import type { SourceView } from "../components/footer-bar";
import type { StorageLike } from "../lib/board-prefs";

const BOOK_STORAGE_KEY = "price-board-demo:so-lenh:v1:mock";

// Sổ lệnh mở hay đóng, nhớ qua các lần tải trang. Chỉ nguồn mock có sổ lệnh.
export function useOrderBookToggle(storage: StorageLike, source: SourceView): [boolean, () => void] {
  const [open, setOpen] = useState<boolean>(() => {
    if (source !== "mock") return false;
    try {
      return storage.getItem(BOOK_STORAGE_KEY) === "open";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (source !== "mock") return;
    try {
      storage.setItem(BOOK_STORAGE_KEY, open ? "open" : "closed");
    } catch {
      /* không lưu được thì thôi */
    }
  }, [storage, open, source]);

  return [open, () => setOpen((current) => !current)];
}
