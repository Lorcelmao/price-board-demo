import { useCallback, useMemo, useRef, useState } from "react";
import { BoardRow, type DropMark } from "./board-row";
import { columnGroups, visibleColumns, type ColumnDef } from "../lib/columns";
import type { CellKind } from "../lib/order-draft";
import type { SortState } from "../lib/board-prefs";

// Đầu bảng hai tầng: tầng trên là tên nhóm, tầng dưới là tên cột. Cột không thuộc nhóm thì gộp hai tầng.
// Định nghĩa cột nằm ở lib/columns.tsx, dùng chung với board-row.tsx.
//
// Mọi callback truyền xuống dòng đều ổn định (useCallback, nhận mã hoặc chỉ số làm tham số),
// và mỗi dòng chỉ nhận vạch thả của riêng nó. Nhờ vậy chọn một dòng hay kéo qua một dòng
// chỉ làm vẽ lại đúng các dòng liên quan, không vẽ lại cả bảng.

interface PriceBoardProps {
  symbols: string[];
  hidden: string[];
  sort: SortState | null;
  onSort: (columnId: string) => void;
  onMove: (symbol: string, to: number) => void;
  onMoveBy: (symbol: string, delta: number) => void;
  selected: string | null;
  onSelect: (symbol: string) => void;
  // Bấm đúp vào ô có `opens`, hoặc Enter trên dòng đang chọn, mở form đặt lệnh nháp.
  onOpenOrder: (symbol: string, cell: CellKind, opener?: HTMLElement | null) => void;
  onOpenDetail?: (symbol: string) => void;
  // Tab DM quan tâm có nút × ở cột kéo để bỏ mã.
  showRemove?: boolean;
  onRemove?: (symbol: string) => void;
  // Dòng hướng dẫn khi tab không có mã nào.
  emptyMessage?: string | null;
}

// aria-sort chỉ đặt cho cột đang xếp; cột khác để "none".
function ariaSortFor(sort: SortState | null, columnId: string): "ascending" | "descending" | "none" {
  if (!sort || sort.columnId !== columnId) return "none";
  return sort.direction === "asc" ? "ascending" : "descending";
}

function HeaderContent({ column, sort, onSort }: { column: ColumnDef; sort: SortState | null; onSort: (id: string) => void }) {
  if (!column.sortValue) return <>{column.title}</>;
  const active = sort?.columnId === column.id;
  return (
    <button type="button" className="pb-sort" onClick={() => onSort(column.id)}>
      {column.title}
      {/* Ô mũi tên luôn có mặt và rộng cố định 8px (CSS); cột không sắp xếp thì để rỗng,
          để chữ tiêu đề không trôi khi bấm sắp xếp và chữ đọc ra vẫn đúng tên cột. */}
      <i className={`pb-sort-icon${active ? " is-on" : ""}`} aria-hidden="true">
        {active ? (sort!.direction === "asc" ? "▲" : "▼") : ""}
      </i>
    </button>
  );
}

// Vị trí thả: chỉ số chèn (0..n) và phía của dòng neo để vẽ vạch.
interface DropPosition {
  index: number;
  after: boolean;
}

export function PriceBoard({
  symbols, hidden, sort, onSort, onMove, onMoveBy, selected, onSelect, onOpenOrder, onOpenDetail,
  showRemove = false, onRemove, emptyMessage = null,
}: PriceBoardProps) {
  const visible = useMemo(() => visibleColumns(hidden), [hidden]);
  const groups = useMemo(() => columnGroups(visible), [visible]);
  const groupAt = useMemo(() => new Map(groups.map((group) => [group.startIndex, group])), [groups]);

  const sorting = sort !== null;

  // Mã đang kéo và vị trí thả để trong ref: handleDrop đọc ref nên không phải tạo lại hàm
  // mỗi lần vạch thả đổi chỗ, và không kéo theo việc vẽ lại cả bảng.
  const dragSymbol = useRef<string | null>(null);
  const dropIndex = useRef<number | null>(null);
  // Vạch chỉ báo cần state để vẽ; chỉ đổi khi vị trí thả thật sự đổi.
  const [dropPos, setDropPos] = useState<DropPosition | null>(null);

  const endDrag = useCallback(() => {
    dragSymbol.current = null;
    dropIndex.current = null;
    setDropPos(null);
  }, []);

  const handleDragStart = useCallback((symbol: string) => {
    dragSymbol.current = symbol;
    dropIndex.current = null;
    setDropPos(null);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLTableRowElement>, rowIndex: number) => {
    if (sorting || dragSymbol.current === null) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    const next = after ? rowIndex + 1 : rowIndex;
    dropIndex.current = next;
    setDropPos((current) => {
      if (current && current.index === next && current.after === after) return current;
      return { index: next, after };
    });
  }, [sorting]);

  const handleDrop = useCallback((event: React.DragEvent<HTMLTableRowElement>) => {
    event.preventDefault();
    const symbol = dragSymbol.current;
    const insertAt = dropIndex.current;
    endDrag();
    if (symbol === null || insertAt === null || sorting) return;
    // Vị trí thả là vị trí chèn trên mảng còn dòng nguồn; nếu nguồn nằm trước thì lùi một.
    const from = symbols.indexOf(symbol);
    if (from < 0) return;
    const target = insertAt > from ? insertAt - 1 : insertAt;
    if (target !== from) onMove(symbol, target);
  }, [endDrag, onMove, sorting, symbols]);

  // Vạch thả của riêng từng dòng: dòng ngay trước vị trí chèn nhận "after",
  // dòng ngay sau nhận "before". Hai vị trí biên chỉ có một dòng.
  const dropMarkFor = useCallback((rowIndex: number): DropMark => {
    if (!dropPos) return null;
    if (dropPos.after && dropPos.index === rowIndex + 1) return "after";
    if (!dropPos.after && dropPos.index === rowIndex) return "before";
    // Thả xuống cuối danh sách: vạch ở đáy dòng cuối.
    if (dropPos.index >= symbols.length && rowIndex === symbols.length - 1) return "after";
    return null;
  }, [dropPos, symbols.length]);

  return (
    <div className="pb-board" role="table" aria-label="Bảng giá VN30">
      <table className="pb-table">
        <colgroup>
          {visible.map((column) => (
            <col key={column.id} style={column.width ? { width: column.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr className="pb-head-groups">
            {visible.map((column, index) => {
              if (column.group) {
                const group = groupAt.get(index);
                return group
                  ? <th key={column.id} colSpan={group.span} className="pb-group">{group.name}</th>
                  : null;
              }
              // Cột không thuộc nhóm thì gộp hai tầng; bấm được nếu sắp xếp được.
              return (
                <th key={column.id} rowSpan={2} className="pb-col" data-col={column.id} aria-sort={ariaSortFor(sort, column.id)}>
                  <HeaderContent column={column} sort={sort} onSort={onSort} />
                </th>
              );
            })}
          </tr>
          <tr className="pb-head-cols">
            {visible.map((column) => {
              if (!column.group) return null;
              return (
                <th key={column.id} className="pb-col" data-col={column.id} aria-sort={ariaSortFor(sort, column.id)}>
                  <HeaderContent column={column} sort={sort} onSort={onSort} />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {symbols.map((symbol, index) => (
            <BoardRow
              key={symbol}
              symbol={symbol}
              columns={visible}
              selected={symbol === selected}
              sorting={sorting}
              dropMark={dropMarkFor(index)}
              rowIndex={index}
              onSelect={onSelect}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={endDrag}
              onMoveBy={onMoveBy}
              onOpenOrder={onOpenOrder}
              onOpenDetail={onOpenDetail}
              showRemove={showRemove}
              onRemove={onRemove}
            />
          ))}
          {symbols.length === 0 && emptyMessage && (
            <tr className="pb-empty-row">
              <td colSpan={visible.length}>{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
