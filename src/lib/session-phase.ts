import { useSyncExternalStore } from "react";
import type { SessionPhase } from "../../shared/market-rules";

// Đợt giao dịch hiện tại.
// Nguồn mock: lấy từ tin SESSION của mock server. Nguồn ysflex: tính từ giờ theo lịch HOSE.
// Múi giờ luôn là Việt Nam (+07:00), không theo múi giờ của máy.
// Không import web/lib/market-store.ts: store đó dùng MarketClient riêng, import vào sẽ mở
// thêm một kết nối tới mock server.

const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";

export interface VnClockParts {
  hours: number;
  minutes: number;
  seconds: number;
  // 0 = chủ nhật, 1 = thứ hai, ... 6 = thứ bảy.
  weekday: number;
}

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: VN_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
  hour12: false,
});

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

// Đọc giờ Việt Nam từ một mốc thời gian bất kỳ, không phụ thuộc múi giờ máy.
export function vnTimeParts(date: Date): VnClockParts {
  const parts = formatter.formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  return {
    // en-GB với hour12:false có thể trả "24" cho nửa đêm; chuẩn hoá về 0..23.
    hours: Number(get("hour")) % 24,
    minutes: Number(get("minute")),
    seconds: Number(get("second")),
    weekday: WEEKDAY_INDEX[get("weekday")] ?? 0,
  };
}

// Lịch HOSE. Nghỉ trưa tính là CLOSED (giả định).
// Chưa tính ngày nghỉ lễ.
export function phaseFromClock(date: Date): SessionPhase {
  const { hours, minutes, seconds, weekday } = vnTimeParts(date);
  if (weekday === 0 || weekday === 6) return "CLOSED";

  const time = hours * 3600 + minutes * 60 + seconds;
  const at = (h: number, m = 0) => h * 3600 + m * 60;

  if (time < at(9)) return "CLOSED";
  if (time < at(9, 15)) return "ATO";
  if (time < at(11, 30)) return "CONTINUOUS";
  if (time < at(13)) return "CLOSED";
  if (time < at(14, 30)) return "CONTINUOUS";
  if (time < at(14, 45)) return "ATC";
  return "CLOSED";
}

// Kho đợt hiện tại dùng chung cho cả hai nguồn, cùng cách làm với quote-store.
let phase: SessionPhase = "CONTINUOUS";
const listeners = new Set<() => void>();

export const getSessionPhase = (): SessionPhase => phase;

export const setSessionPhase = (next: SessionPhase): void => {
  if (phase === next) return;
  phase = next;
  for (const listener of listeners) listener();
};

// Nguồn ysflex không có tin đợt, nên tính lại từ giờ mỗi 15 giây.
let clockTimer: ReturnType<typeof setInterval> | undefined;

export function startClockPhase(): void {
  if (clockTimer) return;
  const tick = () => setSessionPhase(phaseFromClock(new Date()));
  tick();
  clockTimer = setInterval(tick, 15_000);
}

export function useSessionPhase(): SessionPhase {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => phase,
  );
}
