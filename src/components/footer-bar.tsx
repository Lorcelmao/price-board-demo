import { SESSION_LABEL } from "../../shared/protocol";
import type { SessionPhase } from "../../shared/market-rules";

// Vùng 6: chân trang cao 30px. Trạng thái kết nối, nguồn và đợt hiện tại nhận qua props.
export type ConnectionStatusView = "connecting" | "open" | "reconnecting";
export type SourceView = "ysflex" | "mock";

interface FooterBarProps {
  status: ConnectionStatusView;
  source: SourceView;
  // Đợt hiện tại hiện cạnh trạng thái kết nối.
  phase?: SessionPhase;
  // Nút "Sổ lệnh (n)" chỉ có với nguồn mock.
  bookOpen?: boolean;
  bookCount?: number;
  onToggleBook?: () => void;
}

export function FooterBar({ status, source, phase, bookOpen, bookCount, onToggleBook }: FooterBarProps) {
  const sourceLabel = source === "ysflex" ? "YSFlex" : "mock";
  return (
    <footer className="pb-foot">
      <div className="pb-foot-left">
        <button type="button" className="pb-quick-order">Đặt lệnh nhanh</button>
        {source === "mock" && onToggleBook && (
          <button
            type="button"
            className={`pb-book-toggle${bookOpen ? " is-open" : ""}`}
            data-testid="book-toggle"
            aria-expanded={Boolean(bookOpen)}
            onClick={onToggleBook}
          >
            Sổ lệnh ({bookCount ?? 0})
          </button>
        )}
      </div>
      <div className="pb-foot-right">
        <span className="pb-foot-note">Đơn vị giá x1000VND - Khối lượng x100CP</span>
        <span className="pb-foot-source">Nguồn: {sourceLabel}</span>
        {/* Đổi nguồn bằng đường dẫn: mỗi nguồn khởi động một lần khi tải trang, nên tải lại là cách gọn nhất. */}
        <a
          className="pb-source-switch"
          data-testid="source-switch"
          href={source === "mock" ? "?nguon=ysflex" : "?"}
          title={source === "mock"
            ? "Xem giá từ luồng công khai của YSFlex: chỉ đọc, 30 mã VN30, không đăng nhập và đặt lệnh"
            : "Quay lại mock server trên máy"}
        >
          {source === "mock" ? "Dùng YSFlex" : "Dùng mock"}
        </a>
        {phase && <span className="pb-foot-phase" data-testid="footer-phase">{SESSION_LABEL[phase]}</span>}
        {status === "open" ? (
          <span className="pb-foot-status px-up">
            <i className="pb-wave" aria-hidden="true" />
            Kết nối tốt!
          </span>
        ) : (
          <span className="pb-foot-status px-ref">
            <i className="pb-wave" aria-hidden="true" />
            Đang kết nối lại...
          </span>
        )}
      </div>
    </footer>
  );
}
