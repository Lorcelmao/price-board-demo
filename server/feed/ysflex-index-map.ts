import type { IndexCode, IndexPoint, IndexSnapshot } from "../../shared/indexes";

// Chỉ số trên luồng /market của YSFlex.
// - Giá trị trực tiếp: SUB_REQ topic "KRXMDDS|IGI|<sàn>", value là mã chỉ số; tin về qua onFOSStream.
// - Lịch sử trong ngày: HIST_REQ topic "INTRADAY_1m|<sàn>", value là mã chỉ số; trả nến 1 phút qua HIST_RES.
export const YSFLEX_INDEXES: Array<{ code: IndexCode; board: string; id: string }> = [
  { code: "VNI", board: "STO", id: "001" },
  { code: "VN30", board: "STO", id: "101" },
  { code: "HNX", board: "STX", id: "002" },
  { code: "UPCOM", board: "UPX", id: "301" },
  { code: "HNX30", board: "STX", id: "100" },
];

const codeOf = (board: unknown, id: unknown): IndexCode | null =>
  YSFLEX_INDEXES.find((item) => item.board === board && item.id === id)?.code ?? null;

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

// "144510021" (HHmmssSSS) thành "14:45:10".
const clockOf = (t60: unknown): string => {
  const text = String(t60 ?? "").padStart(9, "0");
  return `${text.slice(0, 2)}:${text.slice(2, 4)}:${text.slice(4, 6)}`;
};

// Tin IGI thành ảnh chụp chỉ số. Tên trường đối chiếu với màn hình bảng giá cùng lúc:
// t30217 giá trị, t40002 tham chiếu, t40003 thay đổi, t387 tổng KL, t381 tổng GT (đồng),
// t30589 trần, t30590 tăng, t30591 đứng, t30592 giảm, t30593 sàn, t60 giờ.
export function mapIgiMessage(payload: unknown): IndexSnapshot | null {
  if (!payload || typeof payload !== "object") return null;
  const { topic, data } = payload as { topic?: unknown; data?: Record<string, unknown> };
  if (typeof topic !== "string" || !topic.startsWith("KRXMDDS|IGI|") || !data) return null;
  const code = codeOf(data.t30001, data.t30167);
  if (!code) return null;
  const value = num(data.t30217);
  const ref = num(data.t40002);
  if (!value || !ref) return null;
  const change = typeof data.t40003 === "number" ? data.t40003 : value - ref;
  return {
    code,
    value,
    ref,
    change,
    changePct: Math.round((change / ref) * 10_000) / 100,
    volume: num(data.t387),
    turnover: num(data.t381),
    up: num(data.t30590),
    ceil: num(data.t30589),
    flat: num(data.t30591),
    down: num(data.t30592),
    floor: num(data.t30593),
    time: clockOf(data.t60),
  };
}

// Mã chỉ số của một dòng lịch sử, theo topic "INTRADAY_1m|STO|001".
export function historyCodeOf(topic: unknown): IndexCode | null {
  if (typeof topic !== "string" || !topic.startsWith("INTRADAY_1m|")) return null;
  const [, board, id] = topic.split("|");
  return codeOf(board, id);
}

// Các dòng lịch sử (mỗi dòng một nến 1 phút: O, H, L, C, V, T) thành điểm biểu đồ theo từng chỉ số.
export function mapHistoryRows(rows: unknown): Map<IndexCode, IndexPoint[]> {
  const result = new Map<IndexCode, IndexPoint[]>();
  if (!Array.isArray(rows)) return result;
  for (const row of rows) {
    const code = historyCodeOf((row as { topic?: unknown })?.topic);
    const data = (row as { data?: Record<string, unknown> })?.data;
    if (!code || !data || typeof data.T !== "string" || !num(data.C)) continue;
    const list = result.get(code) ?? [];
    list.push({ time: data.T.slice(0, 5), value: num(data.C), volume: num(data.V) });
    result.set(code, list);
  }
  return result;
}
