import { useEffect, useRef, useState, type FormEvent } from "react";
import { login } from "../lib/session";

// Màn đăng nhập phủ toàn trang.
// Chỉ có hai ô và nút đăng nhập; các mục "Lưu đăng nhập", "Quên mật khẩu", "Tạo tài khoản" không làm.

interface LoginDialogProps {
  // true khi màn mở vì phiên cũ mất hiệu lực, để nói rõ lý do.
  expired: boolean;
  onClose: () => void;
}

export function LoginDialog({ expired, onClose }: LoginDialogProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const userInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    userInput.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sendingRef.current) return;
    if (!username.trim() || !password) {
      setError("Nhập tên đăng nhập và mật khẩu.");
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setError(null);
    const result = await login(username.trim(), password);
    sendingRef.current = false;
    setSending(false);
    if (result.ok) onClose();
    else setError(result.error);
  };

  return (
    <div className="ui-login" role="dialog" aria-modal="true" aria-labelledby="ui-login-title">
      <button type="button" className="ui-login-close" aria-label="Đóng" onClick={onClose}>✕</button>
      <form className="ui-login-form" onSubmit={(event) => void submit(event)} noValidate>
        <div className="ui-login-brand">Price Board Demo</div>
        <h2 id="ui-login-title" className="ui-login-title">Đăng nhập tài khoản thử (mock server trên máy)</h2>
        {expired && (
          <p className="ui-login-notice" role="status" data-testid="login-expired">
            Phiên đăng nhập đã hết hạn hoặc đã đăng nhập ở nơi khác. Vui lòng đăng nhập lại.
          </p>
        )}
        <label className="ui-login-field">
          <span>Tên đăng nhập</span>
          <input
            ref={userInput}
            type="text"
            autoComplete="username"
            value={username}
            data-testid="login-username"
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label className="ui-login-field">
          <span>Mật khẩu</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            data-testid="login-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p className="ui-login-error" role="alert" data-testid="login-error">{error}</p>}
        <button type="submit" className="ui-login-submit" disabled={sending} data-testid="login-submit">
          {sending ? "Đang đăng nhập..." : "Đăng Nhập"}
        </button>
        <p className="ui-login-hint">Tài khoản demo nằm trong <code>server/mock-users.ts</code>.</p>
      </form>
    </div>
  );
}
