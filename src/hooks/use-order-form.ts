import { useCallback, useRef, useState } from "react";
import { draftFromCell, type CellKind } from "../lib/order-draft";
import { getQuote } from "../lib/quote-store";
import type { Side } from "../../shared/market-rules";

export interface OrderFormState {
  symbol: string;
  cell: CellKind;
  seed: NonNullable<ReturnType<typeof draftFromCell>>;
  opener: HTMLElement | null;
}

// Form đặt lệnh nháp: giữ mã, nháp và ô đã bấm đúp để Esc trả con trỏ về đúng chỗ.
export function useOrderForm() {
  const [form, setForm] = useState<OrderFormState | null>(null);

  // Callback ổn định, nhận mã: mở / đóng form không làm cả bảng vẽ lại.
  // `opener` là phần tử đã nhận cú bấm đúp, để Esc / Đóng trả con trỏ về đúng chỗ.
  const open = useCallback((symbol: string, cell: CellKind, opener?: HTMLElement | null) => {
    const seed = draftFromCell(cell, getQuote(symbol));
    if (!seed) return;
    const fallback = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setForm({ symbol, cell, seed, opener: opener ?? fallback });
  }, []);

  // MUA trong popup: giá bán tốt nhất (Giá 1 dư bán); BÁN: giá mua tốt nhất. Chưa có thì theo giá khớp.
  const openFromDetail = useCallback((symbol: string, side: Side) => {
    const quote = getQuote(symbol);
    const book = side === "BUY" ? quote.asks : quote.bids;
    const cell: CellKind = book[0]?.[0] ? { kind: side === "BUY" ? "ask" : "bid", level: 0 } : { kind: "symbol" };
    open(symbol, cell);
  }, [open]);

  // Esc / Đóng trả con trỏ về ô đã bấm đúp. Đọc qua ref để không gọi focus
  // bên trong hàm cập nhật state (hàm đó phải thuần, React có thể gọi hai lần).
  const formRef = useRef(form);
  formRef.current = form;
  const close = useCallback(() => {
    const opener = formRef.current?.opener;
    setForm(null);
    opener?.focus();
  }, []);

  return { form, open, openFromDetail, close };
}
