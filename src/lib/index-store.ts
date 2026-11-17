import { useSyncExternalStore } from "react";
import {
  mergeIndexHistory,
  mergeIndexTick,
  type IndexCode,
  type IndexPoint,
  type IndexSnapshot,
} from "../../shared/indexes";

// Kho chỉ số dùng chung cho hai nguồn: ảnh chụp mới nhất và chuỗi điểm theo phút của từng chỉ số.
export interface IndexState {
  snapshot: IndexSnapshot | null;
  points: IndexPoint[];
}

const EMPTY: IndexState = { snapshot: null, points: [] };
const states = new Map<IndexCode, IndexState>();
const listeners = new Map<IndexCode, Set<() => void>>();

const notify = (code: IndexCode) => listeners.get(code)?.forEach((listener) => listener());

export const getIndex = (code: IndexCode): IndexState => states.get(code) ?? EMPTY;

// Một lần cập nhật chỉ số: thay ảnh chụp, ghép vào điểm của phút hiện tại.
export function setIndexSnapshot(snapshot: IndexSnapshot): void {
  const current = getIndex(snapshot.code);
  const addedVolume = current.snapshot ? snapshot.volume - current.snapshot.volume : 0;
  states.set(snapshot.code, { snapshot, points: mergeIndexTick(current.points, snapshot, addedVolume) });
  notify(snapshot.code);
}

// Lịch sử trong ngày vừa tải: giữ nguyên các điểm trực tiếp mới hơn lịch sử.
export function setIndexHistory(code: IndexCode, history: IndexPoint[]): void {
  const current = getIndex(code);
  states.set(code, { ...current, points: mergeIndexHistory(history, current.points) });
  notify(code);
}

export function useIndex(code: IndexCode): IndexState {
  return useSyncExternalStore(
    (listener) => {
      const set = listeners.get(code) ?? new Set();
      set.add(listener);
      listeners.set(code, set);
      return () => set.delete(listener);
    },
    () => getIndex(code),
  );
}
