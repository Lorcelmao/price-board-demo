import { useEffect, useState } from "react";
import type { SessionInfo } from "../lib/session";

// Vùng 1: thanh đầu trang cao 45px. Đồng hồ chạy mỗi giây; Tổng GTGD do app truyền vào.
interface TopBarProps {
  totalValue: number;
  // Chỉ nguồn mock có đăng nhập; ysflex không truyền onLogin nên không có nút.
  session?: SessionInfo | null;
  onLogin?: () => void;
  onLogout?: () => void;
}

export function TopBar({ totalValue, session, onLogin, onLogout }: TopBarProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const clock = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
  const turnover = totalValue.toLocaleString("en-US");

  return (
    <header className="pb-top">
      <div className="pb-top-left">
        <span className="pb-logo">Price Board Demo</span>
        <label className="pb-search">
          <span className="pb-search-icon" aria-hidden="true" />
          <input type="text" placeholder="Xem chi tiết mã" aria-label="Xem chi tiết mã" />
        </label>
        <span className="pb-total">
          Tổng GTGD: <b>{turnover}</b> Tỷ VNĐ
        </span>
      </div>
      <div className="pb-top-center" aria-label="Đồng hồ">
        {clock}
      </div>
      <div className="pb-top-right">
        <button type="button" className="pb-pill">English</button>
        <span className="pb-switch">
          <span className="pb-switch-track" aria-hidden="true" />
          <span className="pb-switch-label">Giao diện sáng</span>
        </span>
        <button type="button" className="pb-icon-btn" aria-label="Thông báo">
          Thông báo
        </button>
        {session ? (
          <span className="pb-account" data-testid="top-account">
            <b>{session.accountId}</b> · {session.displayName}
            <button type="button" className="pb-login" data-testid="top-logout" onClick={onLogout}>Đăng xuất</button>
          </span>
        ) : onLogin ? (
          <button type="button" className="pb-login" data-testid="top-login" onClick={onLogin}>Đăng nhập</button>
        ) : null}
      </div>
    </header>
  );
}
