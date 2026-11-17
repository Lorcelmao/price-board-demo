import { describe, expect, it } from "vitest";
import { parsePriceInput, parseQuantityInput } from "./order-form-input";

describe("parsePriceInput", () => {
  it("đổi từ nghìn đồng sang đồng, không dính sai số thực", () => {
    expect(parsePriceInput("52.7")).toBe(52_700);
    expect(parsePriceInput("28.35")).toBe(28_350);
    expect(parsePriceInput("2.01")).toBe(2_010);
  });

  it("chấp nhận dấu phẩy thập phân", () => {
    expect(parsePriceInput("52,7")).toBe(52_700);
  });

  it("ô trống là chưa nhập, chữ là không hợp lệ", () => {
    expect(parsePriceInput("  ")).toBeNull();
    expect(parsePriceInput("abc")).toBeNaN();
  });
});

describe("parseQuantityInput", () => {
  it("bỏ dấu phẩy ngăn cách", () => {
    expect(parseQuantityInput("1,000")).toBe(1_000);
    expect(parseQuantityInput("")).toBe(0);
    expect(parseQuantityInput("abc")).toBeNaN();
  });
});
