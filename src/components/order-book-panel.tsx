import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canCancelOrModify } from "../../shared/market-rules";
import { isOpenOrder, type Fill, type Order } from "../../shared/order-merge";
import { SESSION_LABEL } from "../../shared/protocol";
import type { SessionPhase } from "../../shared/market-rules";
import { formatPrice } from "../net/format";
import { formatVolumeBoard } from "../lib/format-board";
import { useAccountState } from "../lib/account-store";
import { cancelOrder } from "../lib/order-api";
import { ordersForTab, statusLabel, type BookTab } from "../lib/order-book-view";
import { useSessionPhase } from "../lib/session-phase";
import type { SourceKey } from "../lib/board-prefs";

// Sổ lệnh. Chỉ hiện với nguồn mock.
// Đọc kho tài khoản riêng; không đăng ký gì vào kho của bảng giá, nên mở sổ hay có lần khớp
// không làm bảng giá vẽ lại.

const money = (value: number): string => Math.round(value).toLocaleString("en-US");
const timeLabel = (time: number): string =>
  new Date(time).toLocaleTimeString("vi-VN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });

// Mảng rỗng dùng chung, để dòng chưa có lần khớp không nhận mảng mới mỗi lần vẽ (giữ memo).
const NO_FILLS: Fill[] = [];

const CANCEL_DISABLED_HINT = "Chỉ huỷ, sửa được trong đợt khớp liên tục";

// Nháy dòng khi lệnh vừa có bản khớp: 400ms, giống nháy ô của bảng giá.
function useRowFlash(orderId: string, recentFill: { id: string; at: number } | null) {
  const row = useRef<HTMLTableRowElement>(null);
  // Bắt đầu từ lần khớp đã có lúc dòng xuất hiện: mở sổ lệnh không làm dòng cũ nháy.
  const lastSeen = useRef(recentFill?.id === orderId ? recentFill.at : 0);
  useEffect(() => {
    if (!recentFill || recentFill.id !== orderId) return;
    if (recentFill.at === lastSeen.current) return;
    lastSeen.current = recentFill.at;
    row.current?.animate(
      [{ backgroundColor: "var(--flash-up)" }, { backgroundColor: "transparent" }],
      { duration: 400, easing: "linear" },
    );
  }, [orderId, recentFill]);
  return row;
}

interface RowProps {
  order: Order;
  phase: SessionPhase;
  expanded: boolean;
  onToggle: (id: string) => void;
  onCancel: (id: string) => Promise<string | null>;
  onModify: (order: Order) => void;
  recentFill: { id: string; at: number } | null;
  fills: Fill[];
}

const BookRow = memo(function BookRow({
  order, phase, expanded, onToggle, onCancel, onModify, recentFill, fills,
}: RowProps) {
  const row = useRowFlash(order.id, recentFill);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Cờ chống gửi hai lần, kiểm ngay đầu hàm.
  const busyRef = useRef(false);

  const handleCancel = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const message = await onCancel(order.id);
      setError(message);
      setConfirming(false);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const priceLabel = order.type === "LO" ? formatPrice(order.price) : order.type;
  // Huỷ và Sửa chỉ có ở lệnh đang chờ; lệnh đã kết thúc thì server trả 409 nên không hiện nút.
  const open = isOpenOrder(order);
  // Theo sàn của từng lệnh: HNX, UPCOM khớp liên tục cả trong đợt mở cửa (effectivePhase).
  const phaseAllowsEdit = canCancelOrModify(order.exchange, phase);

  return (
    <>
      <tr
        ref={row}
        className="pb-book-row"
        data-order-id={order.id}
        data-status={order.status}
        onClick={() => onToggle(order.id)}
        title={order.status === "Rejected" && order.rejectReason ? order.rejectReason : undefined}
      >
        <td>{timeLabel(order.createdAt)}</td>
        <td className="pb-book-symbol">{order.symbol}</td>
        <td className={order.side === "BUY" ? "px-up" : "px-down"}>{order.side === "BUY" ? "Mua" : "Bán"}</td>
        <td>{order.type}</td>
        <td>{priceLabel}</td>
        <td>{formatVolumeBoard(order.quantity)}</td>
        <td data-cell="filled">{formatVolumeBoard(order.filledQty)}</td>
        <td data-cell="avg">{order.avgFillPrice ? formatPrice(order.avgFillPrice) : ""}</td>
        <td className={`pb-book-status status-${order.status}`}>{statusLabel(order)}</td>
        <td className="pb-book-actions" onClick={(event) => event.stopPropagation()}>
          {!open ? null : confirming ? (
            <span className="pb-book-confirm">
              Huỷ lệnh này?
              <button type="button" className="pb-book-btn" disabled={busy} onClick={() => void handleCancel()}>
                {busy ? "Đang gửi..." : "Có"}
              </button>
              <button type="button" className="pb-book-btn" disabled={busy} onClick={() => setConfirming(false)}>
                Không
              </button>
            </span>
          ) : (
            <>
              <button
                type="button"
                className="pb-book-btn"
                disabled={!phaseAllowsEdit}
                title={phaseAllowsEdit ? undefined : CANCEL_DISABLED_HINT}
                onClick={() => { setError(null); setConfirming(true); }}
              >
                Huỷ
              </button>
              {order.type === "LO" && (
                <button
                  type="button"
                  className="pb-book-btn"
                  disabled={!phaseAllowsEdit}
                  title={phaseAllowsEdit ? undefined : CANCEL_DISABLED_HINT}
                  onClick={() => onModify(order)}
                >
                  Sửa
                </button>
              )}
            </>
          )}
          {error && <span className="pb-book-error" role="alert">{error}</span>}
        </td>
      </tr>
      {expanded && (
        <tr className="pb-book-detail">
          <td colSpan={10}>
            {fills.length === 0 ? (
              <span className="pb-book-empty-detail">Chưa có lần khớp nào.</span>
            ) : (
              <ul className="pb-book-fills">
                {fills.map((fill) => (
                  <li key={fill.id}>
                    {timeLabel(fill.time)} · {formatPrice(fill.price)} · {formatVolumeBoard(fill.quantity)}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
});

interface OrderBookPanelProps {
  source: SourceKey;
  onModify: (order: Order) => void;
}

export function OrderBookPanel({ source, onModify }: OrderBookPanelProps) {
  const account = useAccountState();
  const phase = useSessionPhase();
  const [tab, setTab] = useState<BookTab>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const orders = useMemo(() => ordersForTab(account.book, tab), [account.book, tab]);

  const handleToggle = useCallback((id: string) => {
    setExpanded((current) => (current === id ? null : id));
  }, []);

  const handleCancel = useCallback(async (id: string): Promise<string | null> => {
    const result = await cancelOrder(source, id);
    if (result.kind === "ok") return null;
    if (result.kind === "conflict") return result.message;
    if (result.kind === "network") return result.message;
    if (result.kind === "forbidden" || result.kind === "unauthorized") return result.message;
    // 422 không xảy ra khi huỷ, nhưng vẫn hiện câu lỗi đầu tiên nếu có.
    return Object.values(result.errors)[0] ?? "Không huỷ được lệnh.";
  }, [source]);

  return (
    <section className="pb-book" aria-label="Sổ lệnh" data-testid="order-book">
      <div className="pb-book-head">
        <span className="pb-book-title">Sổ lệnh</span>
        <span className="pb-book-balance" data-testid="book-balance">
          {account.account
            ? `Sức mua ${money(account.account.buyingPower)} · Tiền mặt ${money(account.account.cash)} · Đang giữ ${money(account.account.holdFunds)}`
            : "Chưa tải được tài khoản"}
        </span>
        <span className="pb-book-phase">{SESSION_LABEL[phase]}</span>
      </div>

      <div className="pb-book-tabs" role="tablist" aria-label="Lọc sổ lệnh">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "all"}
          data-testid="book-tab-all"
          className={`pb-book-tab${tab === "all" ? " is-active" : ""}`}
          onClick={() => setTab("all")}
        >
          Lệnh trong ngày
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "open"}
          data-testid="book-tab-open"
          className={`pb-book-tab${tab === "open" ? " is-active" : ""}`}
          onClick={() => setTab("open")}
        >
          Chờ khớp
        </button>
      </div>

      <div className="pb-book-scroll">
        <table className="pb-book-table">
          <thead>
            <tr>
              <th>Giờ đặt</th>
              <th>Mã</th>
              <th>Mua/Bán</th>
              <th>Loại</th>
              <th>Giá</th>
              <th>KL đặt</th>
              <th>KL khớp</th>
              <th>Giá khớp TB</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr className="pb-book-empty-row">
                <td colSpan={10}>Chưa có lệnh nào trong ngày.</td>
              </tr>
            ) : (
              orders.map((order) => (
                <BookRow
                  // Khoá theo id, không theo version: dòng giữ câu hỏi "Huỷ lệnh này?" và lỗi 409
                  // khi lệnh có bản cập nhật mới (ví dụ vừa khớp thêm đúng lúc bấm huỷ).
                  key={order.id}
                  order={order}
                  phase={phase}
                  expanded={expanded === order.id}
                  onToggle={handleToggle}
                  onCancel={handleCancel}
                  onModify={onModify}
                  recentFill={account.recentFillOrderId}
                  fills={account.book.fills[order.id] ?? NO_FILLS}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
