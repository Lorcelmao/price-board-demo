import type { ClientMessage, MarketWire, ServerMessage } from "../../shared/protocol";

export type ConnectionStatus = "connecting" | "open" | "reconnecting";

const HEARTBEAT_INTERVAL_MS = 5_000;
const HEARTBEAT_TIMEOUT_MS = 3_000;
const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 15_000;

const socketUrl = () => {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${location.host}/ws`;
};

// Client WebSocket của mock server, có đếm số người dùng cho mỗi mã.
// Hai màn cùng xem FPT chỉ tạo một đăng ký, và chỉ huỷ khi màn cuối cùng rời đi.
export class MarketClient {
  private socket: WebSocket | null = null;
  private readonly refCounts = new Map<string, number>();
  private readonly listeners = new Set<(message: ServerMessage) => void>();
  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>();
  private attempts = 0;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private pongTimer?: ReturnType<typeof setTimeout>;
  private accountWanted = false;
  // Token phiên đăng nhập, gửi kèm subAccount; nối lại thì gửi lại đúng token đang dùng.
  private accountToken: string | undefined;
  status: ConnectionStatus = "connecting";

  connect(): void {
    this.setStatus(this.attempts === 0 ? "connecting" : "reconnecting");
    const socket = new WebSocket(socketUrl());
    this.socket = socket;
    socket.onopen = () => {
      this.attempts = 0;
      this.setStatus("open");
      if (this.refCounts.size > 0) this.send({ op: "sub", symbols: [...this.refCounts.keys()] });
      if (this.accountWanted) this.send({ op: "subAccount", token: this.accountToken });
      this.startHeartbeat();
    };
    socket.onmessage = (event) => this.handle(event.data as string);
    socket.onclose = () => {
      this.stopHeartbeat();
      this.setStatus("reconnecting");
      const backoff = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** this.attempts);
      this.attempts += 1;
      setTimeout(() => this.connect(), backoff * (0.7 + Math.random() * 0.6));
    };
  }

  // Trả về hàm huỷ đăng ký, nên dùng thẳng được làm cleanup của useEffect.
  watch(symbols: string[]): () => void {
    const added = symbols.filter((symbol) => {
      const count = this.refCounts.get(symbol) ?? 0;
      this.refCounts.set(symbol, count + 1);
      return count === 0;
    });
    if (added.length > 0) this.send({ op: "sub", symbols: added });

    return () => {
      const removed = symbols.filter((symbol) => {
        const count = (this.refCounts.get(symbol) ?? 1) - 1;
        if (count > 0) this.refCounts.set(symbol, count);
        else this.refCounts.delete(symbol);
        return count === 0;
      });
      if (removed.length > 0) this.send({ op: "unsub", symbols: removed });
    };
  }

  watchAccount(token?: string): void {
    if (this.accountWanted && this.accountToken === token) return;
    this.accountWanted = true;
    this.accountToken = token;
    this.send({ op: "subAccount", token });
  }

  unwatchAccount(): void {
    if (!this.accountWanted) return;
    this.accountWanted = false;
    this.accountToken = undefined;
    this.send({ op: "unsubAccount" });
  }

  onMessage(listener: (message: ServerMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatus(listener: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  private handle(raw: string): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }
    if ("op" in message) {
      clearTimeout(this.pongTimer);
      return;
    }
    for (const listener of this.listeners) listener(message);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.send({ op: "ping", ts: Date.now() });
      this.pongTimer = setTimeout(() => this.socket?.close(), HEARTBEAT_TIMEOUT_MS);
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    clearInterval(this.heartbeatTimer);
    clearTimeout(this.pongTimer);
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }
}

export const isMarketMessage = (message: ServerMessage): message is MarketWire =>
  "t55" in message;
