import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import type { ServerMessage } from "../shared/protocol";
import { SESSION_TTL_MS } from "./auth";
import { startMockServer, type MockServer } from "./index";
import { seededRandom } from "./market-simulator";
import { MOCK_USERS } from "./mock-users";

const user = MOCK_USERS[0];
let server: MockServer;
let now = 1_000_000;
let base = "";

beforeEach(async () => {
  now = 1_000_000;
  server = await startMockServer({ port: 0, tickMs: 60_000, random: seededRandom(3), now: () => now });
  base = `http://localhost:${server.port}`;
});

afterEach(async () => {
  await server.close();
});

const login = async (password = user.password) =>
  fetch(`${base}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user.username, password }),
  });

const tokenOf = async () => ((await (await login()).json()) as { token: string }).token;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const placeFpt = (headers: Record<string, string> = {}) =>
  fetch(`${base}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ symbol: "FPT", side: "BUY", type: "LO", price: server.market.get("FPT")!.floor, quantity: 100 }),
  });

// Mở socket, đăng ký tin tài khoản, gom mọi tin nhận được.
async function openSocket(token?: string) {
  const socket = new WebSocket(`ws://localhost:${server.port}/ws`);
  const messages: ServerMessage[] = [];
  socket.on("message", (raw) => messages.push(JSON.parse(String(raw))));
  await new Promise((resolve) => socket.once("open", resolve));
  socket.send(JSON.stringify({ op: "subAccount", token }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { socket, messages };
}
const wait = (ms = 80) => new Promise((resolve) => setTimeout(resolve, ms));

describe("đăng nhập qua HTTP", () => {
  it("sai mật khẩu trả 401", async () => {
    expect((await login("sai")).status).toBe(401);
  });

  it("API tài khoản không token trả 401, có token trả 200", async () => {
    expect((await fetch(`${base}/api/orders`)).status).toBe(401);
    expect((await fetch(`${base}/api/account`, { headers: auth("bua") })).status).toBe(401);
    const token = await tokenOf();
    expect((await fetch(`${base}/api/orders`, { headers: auth(token) })).status).toBe(200);
    const me = await (await fetch(`${base}/api/me`, { headers: auth(token) })).json();
    expect(me.accountId).toBe(user.accountId);
  });

  it("đặt lệnh không token không tạo lệnh", async () => {
    expect((await placeFpt()).status).toBe(401);
    expect(server.engine.orders.size).toBe(0);
    expect((await placeFpt(auth(await tokenOf()))).status).toBe(201);
    expect(server.engine.orders.size).toBe(1);
  });

  it("API thị trường và dựng tình huống vẫn mở", async () => {
    expect((await fetch(`${base}/api/instruments`)).status).toBe(200);
    expect((await fetch(`${base}/api/session`)).status).toBe(200);
  });

  it("đăng nhập lần hai làm token đầu hết hiệu lực", async () => {
    const first = await tokenOf();
    const second = await tokenOf();
    expect((await fetch(`${base}/api/orders`, { headers: auth(first) })).status).toBe(401);
    expect((await fetch(`${base}/api/orders`, { headers: auth(second) })).status).toBe(200);
  });

  it("token hết hạn sau 8 giờ", async () => {
    const token = await tokenOf();
    now += SESSION_TTL_MS;
    expect((await fetch(`${base}/api/orders`, { headers: auth(token) })).status).toBe(401);
  });

  it("đăng xuất làm token hết hiệu lực", async () => {
    const token = await tokenOf();
    expect((await fetch(`${base}/api/logout`, { method: "POST", headers: auth(token) })).status).toBe(204);
    expect((await fetch(`${base}/api/orders`, { headers: auth(token) })).status).toBe(401);
  });

  it("CORS cho phép header Authorization", async () => {
    const response = await fetch(`${base}/api/orders`, { method: "OPTIONS" });
    expect(response.headers.get("access-control-allow-headers")).toContain("Authorization");
  });
});

describe("đăng nhập qua WebSocket", () => {
  it("subAccount không token nhận AUTH expired và không nhận tin lệnh", async () => {
    const { socket, messages } = await openSocket();
    await placeFpt(auth(await tokenOf()));
    await wait();
    expect(messages.some((m) => "topic" in m && m.topic === "AUTH")).toBe(true);
    expect(messages.some((m) => "topic" in m && m.topic === "ACCOUNT|ORDER")).toBe(false);
    socket.close();
  });

  it("subAccount có token nhận tin lệnh", async () => {
    const token = await tokenOf();
    const { socket, messages } = await openSocket(token);
    await placeFpt(auth(token));
    await wait();
    expect(messages.some((m) => "topic" in m && m.topic === "ACCOUNT|ORDER")).toBe(true);
    socket.close();
  });

  it("bị đăng nhập nơi khác đẩy ra thì socket cũ nhận AUTH expired và thôi nhận tin lệnh", async () => {
    const first = await tokenOf();
    const { socket, messages } = await openSocket(first);
    const second = await tokenOf();
    await wait();
    expect(messages.some((m) => "topic" in m && m.topic === "AUTH")).toBe(true);
    await placeFpt(auth(second));
    await wait();
    expect(messages.some((m) => "topic" in m && m.topic === "ACCOUNT|ORDER")).toBe(false);
    socket.close();
  });
});
