// Chỉ số thị trường: kiểu dữ liệu dùng chung cho mock server và hai nguồn ở giao diện,
// cùng các hàm thuần để tính chỉ số giả lập và ghép điểm theo phút.

export type IndexCode = "VNI" | "VN30" | "HNX" | "UPCOM" | "HNX30";

// Bốn chỉ số có biểu đồ ở dải chỉ số, theo thứ tự hiển thị.
export const CHART_INDEXES: IndexCode[] = ["VNI", "VN30", "HNX", "UPCOM"];
// Bảng "Chỉ số chính" bên phải.
export const TABLE_INDEXES: IndexCode[] = ["VNI", "HNX", "UPCOM", "VN30", "HNX30"];

export interface IndexSnapshot {
  code: IndexCode;
  value: number;
  ref: number;
  change: number;
  changePct: number;
  // Tổng khối lượng (cổ phiếu) và tổng giá trị (đồng) trong ngày.
  volume: number;
  turnover: number;
  // Số mã tăng (gồm cả mã trần), trần, đứng giá, giảm (gồm cả mã sàn), sàn.
  up: number;
  ceil: number;
  flat: number;
  down: number;
  floor: number;
  // Giờ Việt Nam "HH:mm:ss" của lần cập nhật.
  time: string;
}

// Một điểm của biểu đồ trong ngày: phút "HH:mm" giờ Việt Nam, giá trị chỉ số, khối lượng trong phút.
export interface IndexPoint {
  time: string;
  value: number;
  volume: number;
}

// VN30 của nguồn mock: các mã có trong mock server. Thành phần VN30 thật có thể khác.
export const VN30_MOCK: string[] = [
  "ACB", "BID", "CTG", "FPT", "GAS", "GVR", "HDB", "HPG", "LPB", "MBB", "MSN", "MWG", "PLX",
  "POW", "SHB", "SSI", "STB", "TCB", "TPB", "VCB", "VHM", "VIB", "VIC", "VNM", "VPB", "VRE",
];

// VN30 của nguồn Yuanta: nguyên văn danh sách trang YSFlex đăng ký (30 mã, theo bảng chữ cái).
export const VN30_YSFLEX: string[] = [
  "ACB", "BID", "BSR", "CTG", "FPT", "GAS", "GVR", "HDB", "HPG", "LPB", "MBB", "MCH", "MSN",
  "MWG", "SAB", "SHB", "SSB", "SSI", "STB", "TCB", "TCX", "VCB", "VHM", "VIB", "VIC", "VJC",
  "VNM", "VPB", "VPL", "VRE",
];

// Giờ biểu đồ: 09:00 tới 15:00, mỗi phút một điểm (gồm cả giờ nghỉ trưa, để trục giờ đều như bảng giá thật).
export const SESSION_OPEN = "09:00";
export const SESSION_CLOSE = "15:00";
const LUNCH_START = "11:30";
const LUNCH_END = "13:00";

export const toMinutes = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const fromMinutes = (total: number): string =>
  `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;

// Mọi phút trên trục biểu đồ, từ 09:00 tới 15:00.
export function chartMinutes(): string[] {
  const result: string[] = [];
  for (let minute = toMinutes(SESSION_OPEN); minute <= toMinutes(SESSION_CLOSE); minute += 1) result.push(fromMinutes(minute));
  return result;
}

// Phút có giao dịch (bỏ giờ nghỉ trưa).
export const isTradingMinute = (time: string): boolean => {
  const minute = toMinutes(time);
  return minute >= toMinutes(SESSION_OPEN) && minute <= toMinutes(SESSION_CLOSE)
    && !(minute > toMinutes(LUNCH_START) && minute < toMinutes(LUNCH_END));
};

// Giờ Việt Nam (UTC+7) của một mốc thời gian, dạng "HH:mm:ss". Không phụ thuộc múi giờ của máy chạy.
export function vnClock(epochMs: number): string {
  const date = new Date(epochMs + 7 * 3_600_000);
  return [date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

// Một mã thành phần, đủ để tính chỉ số giả lập.
export interface MemberQuote {
  ref: number;
  ceil: number;
  floor: number;
  last: number | null;
  totalVolume: number;
  totalValue: number;
}

// Chỉ số giả lập: mốc × (1 + % thay đổi bình quân của các mã đã có giá khớp).
// Đây là GIẢ ĐỊNH cho bản demo, không phải cách tính theo vốn hoá của sở giao dịch.
export function computeIndex(code: IndexCode, base: number, members: MemberQuote[], time: string): IndexSnapshot {
  let pctSum = 0;
  let traded = 0;
  const counts = { up: 0, ceil: 0, flat: 0, down: 0, floor: 0 };
  let volume = 0;
  let turnover = 0;
  for (const member of members) {
    volume += member.totalVolume;
    turnover += member.totalValue;
    const last = member.last;
    if (!last || !member.ref) {
      counts.flat += 1;
      continue;
    }
    traded += 1;
    pctSum += ((last - member.ref) / member.ref) * 100;
    if (last > member.ref) {
      counts.up += 1;
      if (last >= member.ceil) counts.ceil += 1;
    } else if (last < member.ref) {
      counts.down += 1;
      if (last <= member.floor) counts.floor += 1;
    } else {
      counts.flat += 1;
    }
  }
  const changePct = traded ? pctSum / traded : 0;
  const value = round2(base * (1 + changePct / 100));
  return {
    code, value, ref: base, change: round2(value - base), changePct: round2(changePct),
    volume, turnover, ...counts, time,
  };
}

const round2 = (value: number) => Math.round(value * 100) / 100;

// Ghép một lần cập nhật vào chuỗi điểm theo phút.
// - Phút đang có: đổi giá trị, cộng thêm khối lượng mới.
// - Phút mới (có giao dịch): thêm điểm.
// - Ngoài giờ (nghỉ trưa, trước mở, sau đóng): chỉ đổi giá trị điểm cuối, để biểu đồ khớp số trên thẻ.
// `addedVolume` là khối lượng phát sinh từ lần cập nhật trước.
export function mergeIndexTick(points: IndexPoint[], snapshot: IndexSnapshot, addedVolume: number): IndexPoint[] {
  const minute = snapshot.time.slice(0, 5);
  const last = points[points.length - 1];
  const volume = Math.max(0, addedVolume);
  if (!isTradingMinute(minute)) {
    if (!last) return points;
    return [...points.slice(0, -1), { ...last, value: snapshot.value }];
  }
  if (!last || toMinutes(minute) > toMinutes(last.time)) return [...points, { time: minute, value: snapshot.value, volume }];
  if (last.time === minute) return [...points.slice(0, -1), { time: minute, value: snapshot.value, volume: last.volume + volume }];
  return points;
}

// Lịch sử vừa tải ghép với các điểm trực tiếp đã có: giữ lịch sử, thêm những điểm trực tiếp mới hơn.
export function mergeIndexHistory(history: IndexPoint[], live: IndexPoint[]): IndexPoint[] {
  const lastHistory = history[history.length - 1];
  if (!lastHistory) return live;
  const newer = live.filter((point) => toMinutes(point.time) > toMinutes(lastHistory.time));
  return [...history, ...newer];
}
