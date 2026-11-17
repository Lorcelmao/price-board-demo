import { useEffect } from "react";
import type { SourceView } from "../components/footer-bar";
import { setMockTabSymbols, startMockSource } from "../lib/mock-source";
import { startClockPhase } from "../lib/session-phase";
import { VN30_MOCK, VN30_YSFLEX } from "../lib/vn30";
import { startYsflexSource } from "../lib/ysflex-source";

// Mở nguồn giá một lần, và với mock thì đăng ký thêm mã của tab đang mở.
export function useMarketSource(source: SourceView, tabSymbols: string[]): void {
  useEffect(() => {
    if (source === "ysflex") {
      // ysflex không có tin đợt: tính từ giờ Việt Nam, làm lại mỗi 15 giây.
      startClockPhase();
      startYsflexSource(VN30_YSFLEX);
    } else {
      startMockSource(VN30_MOCK);
    }
  }, [source]);

  // Đổi tab thì đăng ký mã mới, huỷ mã cũ (chỉ nguồn mock). Nhóm VN30 giữ đăng ký riêng.
  // Với ysflex, mọi tab dùng chung 30 mã VN30 nên không gửi thêm SUB_REQ.
  useEffect(() => {
    if (source !== "mock") return;
    setMockTabSymbols(tabSymbols, VN30_MOCK);
  }, [source, tabSymbols]);
}
