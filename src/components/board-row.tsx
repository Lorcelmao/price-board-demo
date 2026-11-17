import { memo, useCallback, useEffect, useRef, type RefObject } from "react";
import type { BoardQuote } from "../lib/quote-store-core";
import { type ColumnDef, type RowContext } from "../lib/columns";
import type { CellKind } from "../lib/order-draft";
import { priceClass } from "../net/format";
import { useQuote } from "../lib/quote-store";

// Nháy ô: bật màu ngay, giữ tới mốc 0.625, tắt dần hết ở mốc 1. Tổng 400ms.
// Ô đang nháy mà có số mới thì huỷ lần cũ trước, nhờ vậy mỗi ô tối đa một animation.
const FLASH_DURATION_MS = 400;
const GAP_KEYS = [0, 0.625, 1] as const;

const flashColor = (token: string, fallback: string): string =>
  (typeof window !== "undefined" && getComputedStyle(document.documentElement).getPropertyValue(token).trim()) || fallback;

function useBlink<T extends HTMLElement>(value: number | null, ref: number): RefObject<T | null> {
  const element = useRef<T>(null);
  const previous = useRef(value);
  const running = useRef<Animation | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = value;
    // Bỏ qua lần có dữ liệu đầu tiên (null hoặc 0): đó là nạp dữ liệu, không phải giá đổi.
    if (before === null || value === null || before === 0 || before === value || ref === 0) return;
    const node = element.current;
    if (!node) return;
    running.current?.cancel();
    const color = value > before ? flashColor("--flash-up", "#21b985") : flashColor("--flash-down", "#b8232c");
    const animation = node.animate(
      [
        { backgroundColor: color, offset: GAP_KEYS[0] },
        { backgroundColor: color, offset: GAP_KEYS[1] },
        { backgroundColor: "transparent", offset: GAP_KEYS[2] },
      ],
      { duration: FLASH_DURATION_MS, easing: "linear" },
    );
    running.current = animation;
    animation.onfinish = () => {
      if (running.current === animation) running.current = null;
    };
  }, [value, ref]);

  return element;
}

export type DropMark = "before" | "after" | null;

interface BoardRowProps {
  symbol: string;
  columns: ColumnDef[];
  selected: boolean;
  sorting: boolean;
  // Vạch thả của riêng dòng này, không phải vị trí thả chung: nhờ vậy dòng khác không phải vẽ lại.
  dropMark: DropMark;
  rowIndex: number;
  // Các callback đều ổn định và nhận tham số, không phải hàm mới tạo mỗi lần vẽ.
  onSelect: (symbol: string) => void;
  onDragStart: (symbol: string) => void;
  onDragOver: (event: React.DragEvent<HTMLTableRowElement>, rowIndex: number) => void;
  onDrop: (event: React.DragEvent<HTMLTableRowElement>) => void;
  onDragEnd: () => void;
  onMoveBy: (symbol: string, delta: number) => void;
  // Bấm đúp vào ô có `opens` thì mở form đặt lệnh nháp.
  // `opener` là chính ô đã bấm, để Esc / Đóng trả con trỏ về đó.
  onOpenOrder: (symbol: string, cell: CellKind, opener?: HTMLElement | null) => void;
  onOpenDetail?: (symbol: string) => void;
  // Tab DM quan tâm: cột kéo có nút × để bỏ mã.
  showRemove?: boolean;
  onRemove?: (symbol: string) => void;
}

// memo cộng useQuote: dòng này chỉ render lại khi đúng mã của nó có tin mới,
// hoặc khi chính dòng này đổi trạng thái chọn / vạch thả.
export const BoardRow = memo(function BoardRow({
  symbol,
  columns,
  selected,
  sorting,
  dropMark,
  rowIndex,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onMoveBy,
  onOpenOrder,
  onOpenDetail,
  showRemove = false,
  onRemove,
}: BoardRowProps) {
  const quote: BoardQuote = useQuote(symbol);
  const { ref, ceil, floor } = quote;
  // Một giá duy nhất cho màu, +/- và %: giá dự khớp nếu có phiên ATO/ATC, ngược lại giá khớp.
  const shown = quote.expectedPrice ?? quote.last;
  const hasPrice = shown !== null && shown !== 0;
  const change = ref === 0 || !hasPrice ? 0 : shown - ref;
  const changePct = ref === 0 || !hasPrice ? 0 : (change / ref) * 100;
  // Giá bằng TC thì bảng giá thường để trống cả +/- và %, không hiện "0.00".
  const showChange = ref !== 0 && hasPrice && change !== 0;

  const lastCell = useBlink<HTMLTableCellElement>(shown, ref);
  const totalCell = useBlink<HTMLTableCellElement>(quote.totalVolume, ref);

  // Bấm đúp chỉ mở form khi ô có `opens`; truyền chính ô làm chỗ trả con trỏ khi đóng.
  const openOrder = useCallback(
    (cell: CellKind, opener: HTMLElement) => onOpenOrder(symbol, cell, opener),
    [onOpenOrder, symbol],
  );

  const ctx: RowContext = {
    quote,
    shown,
    hasPrice,
    change,
    changePct,
    showChange,
    tone: priceClass(shown, ref, ceil, floor),
    ref,
    ceil,
    floor,
    lastCell,
    totalCell,
    onOpenOrder: openOrder,
    onOpenDetail: onOpenDetail ? () => onOpenDetail(symbol) : undefined,
  };

  const classes = ["pb-row-data"];
  if (selected) classes.push("is-selected");
  if (dropMark === "before") classes.push("drop-before");
  if (dropMark === "after") classes.push("drop-after");

  const handleClick = useCallback(() => onSelect(symbol), [onSelect, symbol]);
  const handleRowDragOver = useCallback(
    (event: React.DragEvent<HTMLTableRowElement>) => onDragOver(event, rowIndex),
    [onDragOver, rowIndex],
  );
  const handleHandleDragStart = useCallback((event: React.DragEvent<HTMLButtonElement>) => {
    if (sorting) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    // Ảnh kéo nhỏ lấy chính tay kéo, tránh trình duyệt vẽ cả dòng.
    event.dataTransfer.setDragImage(event.currentTarget, 8, 10);
    onDragStart(symbol);
  }, [onDragStart, sorting, symbol]);
  const handleHandleKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    // Đang sắp xếp thì thứ tự do cột quyết định, không cho đổi bằng phím.
    if (!event.altKey || sorting) return;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      onMoveBy(symbol, -1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      onMoveBy(symbol, 1);
    }
  }, [onMoveBy, sorting, symbol]);

  return (
    <tr
      data-symbol={symbol}
      className={classes.join(" ")}
      aria-selected={selected}
      // -1 để bấm chuột vào dòng thì dòng nhận con trỏ, nhờ vậy Enter mở được form ngay sau khi chọn.
      // Chỉ dòng đang chọn nằm trong thứ tự Tab.
      tabIndex={selected ? 0 : -1}
      onClick={handleClick}
      onKeyDown={(event) => {
        // Enter trên dòng đang chọn mở form như bấm đúp vào Mã CK.
        if (event.key === "Enter" && selected && !event.altKey) {
          event.preventDefault();
          const row = event.currentTarget as HTMLElement;
          const symbolCell = row.querySelector<HTMLElement>('[data-cell="symbol"]');
          onOpenOrder(symbol, { kind: "symbol" }, symbolCell ?? row);
        }
      }}
      onDragOver={handleRowDragOver}
      onDrop={onDrop}
    >
      {columns.map((column) =>
        column.id === "drag"
          ? (
            <td key={column.id} className="drag">
              {showRemove ? (
                // Tab DM quan tâm: nút × thay chỗ tay kéo.
                <button
                  type="button"
                  className="pb-remove"
                  aria-label={`Bỏ ${symbol} khỏi danh mục`}
                  title={`Bỏ ${symbol} khỏi danh mục`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove?.(symbol);
                  }}
                >
                  ×
                </button>
              ) : (
                <button
                  type="button"
                  className={`pb-drag-handle${sorting ? " is-disabled" : ""}`}
                  draggable={!sorting}
                  aria-label={`Kéo để đổi thứ tự ${symbol}`}
                  title={sorting ? "Bỏ sắp xếp để kéo thả" : "Kéo để đổi thứ tự"}
                  onClick={(event) => event.stopPropagation()}
                  onDragStart={handleHandleDragStart}
                  onDragEnd={onDragEnd}
                  onKeyDown={handleHandleKeyDown}
                >
                  ⋮⋮
                </button>
              )}
            </td>
          )
          : column.render(ctx),
      )}
    </tr>
  );
});
