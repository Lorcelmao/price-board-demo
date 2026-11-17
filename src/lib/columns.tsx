import type { ReactNode, RefObject } from "react";
import type { BoardQuote } from "./quote-store-core";
import type { CellKind } from "./order-draft";
import { displayPrice } from "../../shared/protocol";
import { formatPrice, priceClass } from "../net/format";
import { foreignTradeText } from "./derived";
import { formatChange, formatPercent, formatVolumeBoard } from "./format-board";

// Định nghĩa duy nhất của 30 cột. price-board.tsx dùng để dựng đầu bảng,
// board-row.tsx dùng để vẽ ô. Nhờ vậy ẩn cột và sắp xếp theo cột chỉ cần một nguồn.
// Cột kéo (drag) không có sortValue; Mã CK không ẩn được.

export const GROUP_ORDER = ["Thông tin dư mua", "Khớp lệnh", "Thông tin dư bán", "Giá", "Nhà ĐTNN"] as const;
export type GroupName = (typeof GROUP_ORDER)[number];

// Giá trị đã tính sẵn cho cả dòng, để mỗi ô không tính lại.
export interface RowContext {
  quote: BoardQuote;
  shown: number | null;
  hasPrice: boolean;
  change: number;
  changePct: number;
  showChange: boolean;
  tone: string;
  ref: number;
  ceil: number;
  floor: number;
  lastCell: RefObject<HTMLTableCellElement | null>;
  totalCell: RefObject<HTMLTableCellElement | null>;
  // Mở form đặt lệnh nháp khi bấm đúp. Chỉ dùng cho cột có `opens`.
  // Truyền chính ô đã bấm để Esc / Đóng trả con trỏ về đó.
  onOpenOrder?: (cell: CellKind, opener: HTMLElement) => void;
  // Bấm một lần vào ô Mã CK mở popup chi tiết mã.
  onOpenDetail?: () => void;
}

export interface ColumnDef {
  id: string;
  title: string;
  group?: GroupName;
  width?: number;
  // Giá trị dùng để sắp xếp. Không có thì cột không sắp xếp được.
  sortValue?: (quote: BoardQuote) => number | string | null;
  // Bấm đúp vào ô của cột này thì mở form đặt lệnh nháp.
  // Cột khối lượng không khai báo nên bấm đúp vào đó không mở gì.
  opens?: CellKind;
  render: (ctx: RowContext) => ReactNode;
}

const priceCell = (value: number, ctx: RowContext, key: string, opens?: CellKind): ReactNode => (
  <td
    key={key}
    className={priceClass(value, ctx.ref, ctx.ceil, ctx.floor)}
    tabIndex={opens ? -1 : undefined}
    onDoubleClick={opens && ctx.onOpenOrder ? (event) => ctx.onOpenOrder!(opens, event.currentTarget) : undefined}
    title={opens ? "Bấm đúp để mở form đặt lệnh nháp" : undefined}
  >
    {formatPrice(value)}
  </td>
);

const volumeCell = (value: number, price: number, ctx: RowContext, key: string): ReactNode => (
  <td key={key} className={priceClass(price, ctx.ref, ctx.ceil, ctx.floor)}>
    {formatVolumeBoard(value)}
  </td>
);

const level = (levels: [number, number][], index: number): [number, number] => levels[index] ?? [0, 0];

// Cột giá hiển thị: từ 0 hoặc trống thì trả null để luôn nằm cuối khi sắp xếp.
const sortablePrice = (value: number | null | undefined): number | null =>
  value === null || value === undefined || value === 0 ? null : value;

export const COLUMNS: ColumnDef[] = [
  {
    id: "drag",
    title: "",
    width: 34,
    render: () => <td key="drag" className="drag">⋮⋮</td>,
  },
  {
    id: "symbol",
    title: "Mã CK",
    width: 78,
    sortValue: (quote) => quote.symbol,
    opens: { kind: "symbol" },
    render: (ctx) => (
      <td
        key="symbol"
        className={`sym ${ctx.tone}`}
        data-cell="symbol"
        tabIndex={-1}
        onClick={ctx.onOpenDetail ? (event) => { event.stopPropagation(); ctx.onOpenDetail!(); } : undefined}
        title="Bấm để xem chi tiết mã"
      >
        {ctx.quote.symbol}
      </td>
    ),
  },
  {
    id: "ceil",
    title: "Trần",
    sortValue: (quote) => sortablePrice(quote.ceil),
    render: (ctx) => <td key="ceil" className="px-ceil">{formatPrice(ctx.ceil)}</td>,
  },
  {
    id: "floor",
    title: "Sàn",
    sortValue: (quote) => sortablePrice(quote.floor),
    render: (ctx) => <td key="floor" className="px-floor">{formatPrice(ctx.floor)}</td>,
  },
  {
    id: "ref",
    title: "TC",
    sortValue: (quote) => sortablePrice(quote.ref),
    render: (ctx) => <td key="ref" className="px-ref">{formatPrice(ctx.ref)}</td>,
  },
  {
    id: "bid3p",
    title: "Giá 3",
    group: "Thông tin dư mua",
    sortValue: (quote) => sortablePrice(level(quote.bids, 2)[0]),
    opens: { kind: "bid", level: 2 },
    render: (ctx) => priceCell(level(ctx.quote.bids, 2)[0], ctx, "bid3p", { kind: "bid", level: 2 }),
  },
  {
    id: "bid3v",
    title: "KL 3",
    group: "Thông tin dư mua",
    sortValue: (quote) => level(quote.bids, 2)[1] || null,
    render: (ctx) => {
      const [price, volume] = level(ctx.quote.bids, 2);
      return volumeCell(volume, price, ctx, "bid3v");
    },
  },
  {
    id: "bid2p",
    title: "Giá 2",
    group: "Thông tin dư mua",
    sortValue: (quote) => sortablePrice(level(quote.bids, 1)[0]),
    opens: { kind: "bid", level: 1 },
    render: (ctx) => priceCell(level(ctx.quote.bids, 1)[0], ctx, "bid2p", { kind: "bid", level: 1 }),
  },
  {
    id: "bid2v",
    title: "KL 2",
    group: "Thông tin dư mua",
    sortValue: (quote) => level(quote.bids, 1)[1] || null,
    render: (ctx) => {
      const [price, volume] = level(ctx.quote.bids, 1);
      return volumeCell(volume, price, ctx, "bid2v");
    },
  },
  {
    id: "bid1p",
    title: "Giá 1",
    group: "Thông tin dư mua",
    sortValue: (quote) => sortablePrice(level(quote.bids, 0)[0]),
    opens: { kind: "bid", level: 0 },
    render: (ctx) => priceCell(level(ctx.quote.bids, 0)[0], ctx, "bid1p", { kind: "bid", level: 0 }),
  },
  {
    id: "bid1v",
    title: "KL 1",
    group: "Thông tin dư mua",
    sortValue: (quote) => level(quote.bids, 0)[1] || null,
    render: (ctx) => {
      const [price, volume] = level(ctx.quote.bids, 0);
      return volumeCell(volume, price, ctx, "bid1v");
    },
  },
  {
    id: "last",
    title: "Giá",
    group: "Khớp lệnh",
    sortValue: (quote) => sortablePrice(displayPrice(quote)),
    opens: { kind: "last" },
    render: (ctx) => (
      <td
        key="last"
        ref={ctx.lastCell}
        className={`pb-last ${ctx.tone}`}
        data-cell="last"
        tabIndex={-1}
        onDoubleClick={ctx.onOpenOrder ? (event) => ctx.onOpenOrder!({ kind: "last" }, event.currentTarget) : undefined}
        title="Bấm đúp để mở form đặt lệnh nháp"
      >
        {ctx.quote.expectedPrice ? `*${formatPrice(ctx.quote.expectedPrice)}` : formatPrice(ctx.shown)}
      </td>
    ),
  },
  {
    id: "lastVolume",
    title: "KL",
    group: "Khớp lệnh",
    sortValue: (quote) => quote.lastVolume || null,
    render: (ctx) => (
      <td key="lastVolume" className={ctx.tone}>{formatVolumeBoard(ctx.quote.lastVolume)}</td>
    ),
  },
  {
    id: "change",
    title: "+/-",
    group: "Khớp lệnh",
    sortValue: (quote) => {
      const shown = displayPrice(quote);
      if (!quote.ref || !shown) return null;
      const change = shown - quote.ref;
      return change === 0 ? null : change;
    },
    render: (ctx) => (
      <td key="change" className={ctx.tone}>{ctx.showChange ? formatChange(ctx.change) : ""}</td>
    ),
  },
  {
    id: "changePct",
    title: "%",
    group: "Khớp lệnh",
    sortValue: (quote) => {
      const shown = displayPrice(quote);
      if (!quote.ref || !shown) return null;
      const pct = ((shown - quote.ref) / quote.ref) * 100;
      return pct === 0 ? null : pct;
    },
    render: (ctx) => (
      <td key="changePct" className={ctx.tone}>{ctx.showChange ? formatPercent(ctx.changePct) : ""}</td>
    ),
  },
  {
    id: "ask1p",
    title: "Giá 1",
    group: "Thông tin dư bán",
    sortValue: (quote) => sortablePrice(level(quote.asks, 0)[0]),
    opens: { kind: "ask", level: 0 },
    render: (ctx) => priceCell(level(ctx.quote.asks, 0)[0], ctx, "ask1p", { kind: "ask", level: 0 }),
  },
  {
    id: "ask1v",
    title: "KL 1",
    group: "Thông tin dư bán",
    sortValue: (quote) => level(quote.asks, 0)[1] || null,
    render: (ctx) => {
      const [price, volume] = level(ctx.quote.asks, 0);
      return volumeCell(volume, price, ctx, "ask1v");
    },
  },
  {
    id: "ask2p",
    title: "Giá 2",
    group: "Thông tin dư bán",
    sortValue: (quote) => sortablePrice(level(quote.asks, 1)[0]),
    opens: { kind: "ask", level: 1 },
    render: (ctx) => priceCell(level(ctx.quote.asks, 1)[0], ctx, "ask2p", { kind: "ask", level: 1 }),
  },
  {
    id: "ask2v",
    title: "KL 2",
    group: "Thông tin dư bán",
    sortValue: (quote) => level(quote.asks, 1)[1] || null,
    render: (ctx) => {
      const [price, volume] = level(ctx.quote.asks, 1);
      return volumeCell(volume, price, ctx, "ask2v");
    },
  },
  {
    id: "ask3p",
    title: "Giá 3",
    group: "Thông tin dư bán",
    sortValue: (quote) => sortablePrice(level(quote.asks, 2)[0]),
    opens: { kind: "ask", level: 2 },
    render: (ctx) => priceCell(level(ctx.quote.asks, 2)[0], ctx, "ask3p", { kind: "ask", level: 2 }),
  },
  {
    id: "ask3v",
    title: "KL 3",
    group: "Thông tin dư bán",
    sortValue: (quote) => level(quote.asks, 2)[1] || null,
    render: (ctx) => {
      const [price, volume] = level(ctx.quote.asks, 2);
      return volumeCell(volume, price, ctx, "ask3v");
    },
  },
  {
    id: "totalVolume",
    title: "Tổng KL",
    width: 72,
    sortValue: (quote) => quote.totalVolume || null,
    render: (ctx) => (
      <td key="totalVolume" ref={ctx.totalCell} data-cell="total">{formatVolumeBoard(ctx.quote.totalVolume)}</td>
    ),
  },
  {
    id: "avg",
    title: "TB",
    group: "Giá",
    sortValue: (quote) => sortablePrice(quote.avgPrice),
    render: (ctx) => priceCell(ctx.quote.avgPrice, ctx, "avg"),
  },
  {
    id: "low",
    title: "Thấp",
    group: "Giá",
    sortValue: (quote) => sortablePrice(quote.low),
    render: (ctx) => priceCell(ctx.quote.low, ctx, "low"),
  },
  {
    id: "high",
    title: "Cao",
    group: "Giá",
    sortValue: (quote) => sortablePrice(quote.high),
    render: (ctx) => priceCell(ctx.quote.high, ctx, "high"),
  },
  {
    id: "open",
    title: "Mở cửa",
    group: "Giá",
    sortValue: (quote) => sortablePrice(quote.open),
    render: (ctx) => priceCell(ctx.quote.open, ctx, "open"),
  },
  {
    id: "foreignBuy",
    title: "KL mua",
    group: "Nhà ĐTNN",
    width: 64,
    sortValue: (quote) => quote.foreignBuy || null,
    render: (ctx) => <td key="foreignBuy">{formatVolumeBoard(ctx.quote.foreignBuy)}</td>,
  },
  {
    id: "foreignBuyValue",
    title: "GT mua",
    group: "Nhà ĐTNN",
    width: 64,
    sortValue: (quote) => quote.foreignBuy || null,
    render: (ctx) => (
      <td key="foreignBuyValue" data-cell="foreign-buy-value">{foreignTradeText(ctx.quote, "buy")}</td>
    ),
  },
  {
    id: "foreignSell",
    title: "KL bán",
    group: "Nhà ĐTNN",
    width: 64,
    sortValue: (quote) => quote.foreignSell || null,
    render: (ctx) => <td key="foreignSell">{formatVolumeBoard(ctx.quote.foreignSell)}</td>,
  },
  {
    id: "foreignSellValue",
    title: "GT bán",
    group: "Nhà ĐTNN",
    width: 64,
    sortValue: (quote) => quote.foreignSell || null,
    render: (ctx) => (
      <td key="foreignSellValue" data-cell="foreign-sell-value">{foreignTradeText(ctx.quote, "sell")}</td>
    ),
  },
];

// Mã CK luôn hiện: bảng không có mã thì không đọc được.
export const ALWAYS_VISIBLE = new Set(["symbol"]);

export const columnsById = (): Map<string, ColumnDef> =>
  new Map(COLUMNS.map((column) => [column.id, column]));

export interface ColumnGroup {
  name: GroupName;
  span: number;
  startIndex: number;
}

// Nhóm chỉ tính trên các cột đang hiện: ẩn hết cột của một nhóm thì nhóm đó biến mất.
export function columnGroups(columns: ColumnDef[] = COLUMNS): ColumnGroup[] {
  const groups: ColumnGroup[] = [];
  columns.forEach((column, index) => {
    if (!column.group) return;
    const last = groups[groups.length - 1];
    if (last && last.name === column.group) last.span += 1;
    else groups.push({ name: column.group, span: 1, startIndex: index });
  });
  return groups;
}

// Danh sách cột đang hiện theo thứ tự gốc. Cột trong `hidden` bị bỏ, trừ Mã CK.
export function visibleColumns(hidden: Iterable<string> = []): ColumnDef[] {
  const hiddenSet = new Set(hidden);
  return COLUMNS.filter((column) => ALWAYS_VISIBLE.has(column.id) || !hiddenSet.has(column.id));
}

export const visibleColumnIds = (hidden: Iterable<string> = []): string[] =>
  visibleColumns(hidden).map((column) => column.id);
