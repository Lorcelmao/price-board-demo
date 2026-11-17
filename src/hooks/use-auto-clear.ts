import { useEffect } from "react";

// Thông báo ngắn tự tắt: có giá trị thì sau `ms` mili giây gọi clear().
export function useAutoClear(value: unknown, clear: () => void, ms: number): void {
  useEffect(() => {
    if (!value) return;
    const timer = setTimeout(clear, ms);
    return () => clearTimeout(timer);
    // clear là hàm set state của React, luôn ổn định.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ms]);
}
