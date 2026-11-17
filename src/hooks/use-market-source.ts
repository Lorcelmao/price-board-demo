import { useEffect } from "react";
import type { SourceView } from "../components/footer-bar";
import { setTabSymbols, startMarketSource } from "../lib/market-source";
import { startClockPhase } from "../lib/session-phase";
import { VN30_MOCK, VN30_YSFLEX } from "../lib/vn30";

// Mở nguồn giá một lần, rồi đăng ký thêm mã của tab đang mở. Cả hai nguồn đều qua gateway của server.
export function useMarketSource(source: SourceView, tabSymbols: string[]): void {
  const base = source === "ysflex" ? VN30_YSFLEX : VN30_MOCK;

  useEffect(() => {
    // Yuanta không gửi tin đợt phiên: tính từ giờ Việt Nam, làm lại mỗi 15 giây.
    if (source === "ysflex") startClockPhase();
    startMarketSource(source, base);
  }, [source, base]);

  // Đổi tab thì đăng ký mã mới, huỷ mã cũ. Nhóm VN30 giữ đăng ký riêng.
  // Với Yuanta, mọi tab dùng chung 30 mã VN30 nên không có mã thêm.
  useEffect(() => {
    setTabSymbols(tabSymbols, base);
  }, [tabSymbols, base]);
}
