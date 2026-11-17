import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { MOCK_USERS, type MockUser } from "./mock-users";

// Phiên đăng nhập bản gọn: một token sống 8 giờ, không có refresh token,
// mỗi tài khoản chỉ một phiên (đăng nhập lại thì token cũ mất hiệu lực).
// Lớp thuần, không đụng HTTP; đồng hồ truyền vào để test được hết hạn.

export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

export interface AuthSession {
  token: string;
  accountId: string;
  displayName: string;
  expiresAt: number;
}

export interface LoginResult extends AuthSession {
  // Token cũ của cùng tài khoản vừa bị thay, để server báo cho các socket đang dùng nó.
  replacedToken?: string;
}

const digest = (value: string) => createHash("sha256").update(value).digest();

// So bằng băm để hai chuỗi luôn cùng độ dài, rồi so trong thời gian không đổi.
const sameSecret = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));

export class AuthStore {
  private readonly byToken = new Map<string, AuthSession>();
  private readonly tokenByAccount = new Map<string, string>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly users: MockUser[] = MOCK_USERS,
  ) {}

  login(username: string, password: string): LoginResult | null {
    const user = this.users.find((item) => item.username === username);
    // Vẫn so mật khẩu khi sai tên đăng nhập, để thời gian trả lời không lộ tên nào tồn tại.
    const passwordOk = sameSecret(password ?? "", user?.password ?? "\u0000");
    if (!user || !passwordOk) return null;

    const replacedToken = this.tokenByAccount.get(user.accountId);
    if (replacedToken) this.byToken.delete(replacedToken);

    const session: AuthSession = {
      token: randomUUID(),
      accountId: user.accountId,
      displayName: user.displayName,
      expiresAt: this.now() + SESSION_TTL_MS,
    };
    this.byToken.set(session.token, session);
    this.tokenByAccount.set(user.accountId, session.token);
    return replacedToken ? { ...session, replacedToken } : session;
  }

  verify(token: string | undefined | null): AuthSession | null {
    if (!token) return null;
    const session = this.byToken.get(token);
    if (!session) return null;
    if (this.now() >= session.expiresAt) {
      this.drop(session);
      return null;
    }
    return session;
  }

  logout(token: string | undefined | null): boolean {
    const session = token ? this.byToken.get(token) : undefined;
    if (!session) return false;
    this.drop(session);
    return true;
  }

  private drop(session: AuthSession): void {
    this.byToken.delete(session.token);
    if (this.tokenByAccount.get(session.accountId) === session.token) this.tokenByAccount.delete(session.accountId);
  }
}
