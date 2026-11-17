import { useCallback, useEffect, useRef, useState } from "react";
import { isOpenOrder, type Order } from "../../shared/order-merge";
import { formatPrice } from "../net/format";
import { formatVolumeBoard } from "../lib/format-board";
import { modifyChange } from "../lib/order-book-view";
import { modifyOrder } from "../lib/order-api";
import { useOrder } from "../lib/account-store";
import type { SourceKey } from "../lib/board-prefs";

// Hộp thoại sửa lệnh. Dùng lại khung hộp thoại có sẵn.
// Mỗi lần chỉ sửa giá hoặc khối lượng; kiểm bằng modifyChange trước khi gửi.

interface ModifyOrderDialogProps {
  orderId: string;
  source: SourceKey;
  onClose: () => void;
}

const money = (value: number): string => Math.round(value).toLocaleString("en-US");

// Đọc lệnh mới nhất từ kho theo id: lệnh có thể khớp thêm hay kết thúc trong lúc hộp thoại đang mở.
export function ModifyOrderDialog({ orderId, source, onClose }: ModifyOrderDialogProps) {
  const order = useOrder(orderId);
  // Lệnh không còn trong kho (hiếm, ví dụ vừa đổi nguồn) thì đóng luôn.
  useEffect(() => {
    if (!order) onClose();
  }, [order, onClose]);
  if (!order) return null;
  return <ModifyOrderForm order={order} source={source} onClose={onClose} />;
}

function ModifyOrderForm({ order, source, onClose }: { order: Order; source: SourceKey; onClose: () => void }) {
  const [priceText, setPriceText] = useState(order.price === null ? "" : (order.price / 1000).toFixed(2));
  const [quantityText, setQuantityText] = useState(String(order.quantity));
  const [error, setError] = useState<string | null>(null);
  // Chống gửi hai lần: cờ trong ref, kiểm ngay đầu hàm gửi.
  const sendingRef = useRef(false);
  const [sending, setSending] = useState(false);
  const submitRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    submitRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lệnh đã khớp hết, đã huỷ hay bị từ chối trong lúc mở hộp thoại thì không sửa được nữa.
  const open = isOpenOrder(order);

  const submit = useCallback(async () => {
    if (sendingRef.current) return;
    if (!open) return;
    const result = modifyChange(order, priceText, quantityText);
    if (result.error || !result.change) {
      setError(result.error ?? "Không có thay đổi.");
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      const response = await modifyOrder(source, order.id, result.change);
      if (response.kind === "ok") {
        onClose();
        return;
      }
      if (response.kind === "conflict") {
        setError(response.message);
        return;
      }
      if (response.kind === "rejected") {
        setError(Object.values(response.errors)[0] ?? "Lệnh không hợp lệ.");
        return;
      }
      setError(response.message);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [open, source, order, priceText, quantityText, onClose]);

  return (
    <div
      className="pb-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={dialogRef} className="pb-dialog pb-modify-dialog" role="dialog" aria-modal="true" aria-labelledby="pb-modify-title">
        <h2 id="pb-modify-title" className="pb-dialog-title">Sửa lệnh {order.symbol}</h2>
        <div className="pb-dialog-body">
          <p className="pb-modify-hint">
            Mỗi lần chỉ sửa giá <b>hoặc</b> khối lượng. Đã khớp {formatVolumeBoard(order.filledQty) || "0"} / {formatVolumeBoard(order.quantity)}.
          </p>

          <div className="pb-order-row">
            <label className="pb-order-label" htmlFor="pb-modify-price">Giá</label>
            <input
              id="pb-modify-price"
              className="pb-order-input"
              type="text"
              inputMode="decimal"
              value={priceText}
              data-testid="modify-price"
              aria-invalid={Boolean(error)}
              onChange={(event) => { setError(null); setPriceText(event.target.value); }}
            />
          </div>

          <div className="pb-order-row">
            <label className="pb-order-label" htmlFor="pb-modify-quantity">Khối lượng</label>
            <input
              id="pb-modify-quantity"
              className="pb-order-input"
              type="text"
              inputMode="numeric"
              value={quantityText}
              data-testid="modify-quantity"
              aria-invalid={Boolean(error)}
              onChange={(event) => { setError(null); setQuantityText(event.target.value); }}
            />
          </div>

          <p className="pb-modify-current">Giá hiện tại {formatPrice(order.price)} · {money(order.quantity)} cổ phiếu</p>
          {!open && (
            <p className="pb-order-error" role="alert" data-testid="modify-closed">
              Lệnh đã kết thúc, không sửa được nữa.
            </p>
          )}
          {error && <p className="pb-order-error" role="alert" data-testid="modify-error">{error}</p>}
        </div>

        <div className="pb-dialog-actions">
          <span className="pb-dialog-spacer" />
          <button type="button" className="pb-dialog-btn" onClick={onClose}>Đóng</button>
          <button
            ref={submitRef}
            type="button"
            className="pb-dialog-btn is-primary"
            data-testid="modify-submit"
            disabled={sending || !open}
            onClick={() => void submit()}
          >
            {sending ? "Đang gửi..." : "Sửa lệnh"}
          </button>
        </div>
      </div>
    </div>
  );
}
