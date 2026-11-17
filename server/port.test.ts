import { afterEach, describe, expect, it } from "vitest";
import { listenPort, MOCK_PORT } from "./port";

const saved = process.env.PORT;
afterEach(() => {
  if (saved === undefined) delete process.env.PORT;
  else process.env.PORT = saved;
});

describe("listenPort", () => {
  it("chạy cùng Vite (--dev) thì bỏ qua PORT, luôn dùng MOCK_PORT", () => {
    process.env.PORT = "4213";
    expect(listenPort(["node", "index.ts", "--dev"])).toBe(MOCK_PORT);
  });

  it("chạy một mình thì dùng PORT của dịch vụ host", () => {
    process.env.PORT = "10000";
    expect(listenPort(["node", "index.ts"])).toBe(10000);
  });

  it("không có PORT thì dùng MOCK_PORT", () => {
    delete process.env.PORT;
    expect(listenPort(["node", "index.ts"])).toBe(MOCK_PORT);
  });
});
