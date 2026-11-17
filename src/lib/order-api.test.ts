import { afterEach, describe, expect, it, vi } from "vitest";
import type { Order } from "../../shared/order-merge";
import { cancelOrder, modifyOrder, placeOrder } from "./order-api";

// fetch giả: ghi lại mọi lời gọi để kiểm cả đường dẫn lẫn số lần gọi.
interface Call {
  url: string;
  method: string;
  body: unknown;
}

const installFetch = (handler: (call: Call) => Response | Promise<Response>) => {
  const calls: Call[] = [];
  const fake = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    return handler(call);
  });
  vi.stubGlobal("fetch", fake);
  return calls;
};

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const ORDER: Order = {
  id: "ORD-1",
  symbol: "FPT",
  exchange: "HOSE",
  side: "BUY",
  type: "LO",
  price: 52_700,
  quantity: 100,
  filledQty: 0,
  avgFillPrice: 0,
  status: "New",
  version: 1,
  createdAt: 1,
  updatedAt: 1,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("rào chắn nguồn: chỉ mock mới được gửi", () => {
  it("ysflex không gọi fetch lần nào", async () => {
    const calls = installFetch(() => jsonResponse(201, { order: ORDER }));
    const result = await placeOrder("ysflex", { symbol: "FPT", side: "BUY", type: "LO", price: 52_700, quantity: 100 });
    expect(calls).toHaveLength(0);
    expect(result.kind).toBe("forbidden");
  });

  it("ysflex cũng không gọi fetch khi huỷ hay sửa", async () => {
    const calls = installFetch(() => jsonResponse(200, {}));
    await cancelOrder("ysflex", "ORD-1");
    await modifyOrder("ysflex", "ORD-1", { price: 52_800 });
    expect(calls).toHaveLength(0);
  });
});

describe("placeOrder với nguồn mock", () => {
  it("201 trả lệnh và gọi đúng /api/orders bằng POST", async () => {
    const calls = installFetch(() => jsonResponse(201, { order: ORDER }));
    const result = await placeOrder("mock", { symbol: "FPT", side: "BUY", type: "LO", price: 52_700, quantity: 100 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/orders");
    expect(calls[0].method).toBe("POST");
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.order.id).toBe("ORD-1");
  });

  it("422 trả lỗi theo từng ô", async () => {
    installFetch(() => jsonResponse(422, { errors: { price: "Giá cao hơn giá trần 56,300." } }));
    const result = await placeOrder("mock", { symbol: "FPT", side: "BUY", type: "LO", price: 60_000, quantity: 100 });
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") expect(result.errors.price).toContain("trần");
  });

  it("422 mà không kèm errors vẫn ra câu lỗi chung", async () => {
    installFetch(() => jsonResponse(422, {}));
    const result = await placeOrder("mock", { symbol: "FPT", side: "BUY", type: "LO", price: 52_700, quantity: 100 });
    expect(result.kind).toBe("rejected");
    if (result.kind === "rejected") expect(result.errors.form).toBeTruthy();
  });

  it("409 trả câu lỗi xung đột", async () => {
    installFetch(() => jsonResponse(409, { error: "Lệnh đã kết thúc, không thể huỷ." }));
    const result = await placeOrder("mock", { symbol: "FPT", side: "BUY", type: "LO", price: 52_700, quantity: 100 });
    expect(result.kind).toBe("conflict");
    if (result.kind === "conflict") expect(result.message).toContain("kết thúc");
  });

  it("fetch ném lỗi thì ra lỗi mạng, không ném ra ngoài", async () => {
    installFetch(() => { throw new TypeError("Failed to fetch"); });
    const result = await placeOrder("mock", { symbol: "FPT", side: "BUY", type: "LO", price: 52_700, quantity: 100 });
    expect(result.kind).toBe("network");
  });
});

describe("cancelOrder và modifyOrder", () => {
  it("huỷ gọi đúng đường dẫn", async () => {
    const calls = installFetch(() => jsonResponse(200, { order: { ...ORDER, status: "Cancelled" } }));
    const result = await cancelOrder("mock", "ORD-1");
    expect(calls[0].url).toBe("/api/orders/ORD-1/cancel");
    expect(calls[0].method).toBe("POST");
    expect(result.kind).toBe("ok");
  });

  it("sửa gọi đúng đường dẫn và gửi thay đổi", async () => {
    const calls = installFetch(() => jsonResponse(200, { order: ORDER }));
    const result = await modifyOrder("mock", "ORD-1", { quantity: 200 });
    expect(calls[0].url).toBe("/api/orders/ORD-1/modify");
    expect(calls[0].body).toEqual({ quantity: 200 });
    expect(result.kind).toBe("ok");
  });

  it("huỷ bị từ chối 409 trả câu lỗi của server", async () => {
    installFetch(() => jsonResponse(409, { error: "Đang trong đợt khớp định kỳ hoặc đóng cửa, chưa được huỷ lệnh." }));
    const result = await cancelOrder("mock", "ORD-1");
    expect(result.kind).toBe("conflict");
    if (result.kind === "conflict") expect(result.message).toContain("chưa được huỷ");
  });

  it("mã lệnh được mã hoá trong đường dẫn", async () => {
    const calls = installFetch(() => jsonResponse(200, { order: ORDER }));
    await cancelOrder("mock", "ORD 1/x");
    expect(calls[0].url).toBe("/api/orders/ORD%201%2Fx/cancel");
  });
});
