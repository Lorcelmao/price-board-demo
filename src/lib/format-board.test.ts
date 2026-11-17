import { describe, expect, it } from "vitest";
import { formatChange, formatPercent, formatVolumeBoard } from "./format-board";

// Số đối chiếu với cách các bảng giá phổ biến hiển thị khối lượng.
describe("formatVolumeBoard: số lô (cổ phiếu ÷ 100), dấu phẩy trước chữ số cuối", () => {
  it("128.900 cổ phiếu = 1.289 lô, hiện 128,9 (YSFlex)", () => {
    expect(formatVolumeBoard(128_900)).toBe("128,9");
  });

  it("1.311.900 cổ phiếu = 13.119 lô, phần trước nhóm theo hàng nghìn: 1,311,9 (YSFlex)", () => {
    expect(formatVolumeBoard(1_311_900)).toBe("1,311,9");
  });

  it("2.254.300 cổ phiếu hiện 2,254,3 (SHB)", () => {
    expect(formatVolumeBoard(2_254_300)).toBe("2,254,3");
  });

  it("dưới 10 lô hiện nguyên số: 400 cổ phiếu hiện 4 (YSFlex)", () => {
    expect(formatVolumeBoard(400)).toBe("4");
  });

  it("đúng 10 lô vẫn có dấu phẩy: 2.000 cổ phiếu hiện 2,0 (HPG)", () => {
    expect(formatVolumeBoard(2_000)).toBe("2,0");
  });

  it("không có dữ liệu thì trả chuỗi rỗng", () => {
    expect(formatVolumeBoard(0)).toBe("");
  });
});

describe("formatChange", () => {
  it("dương có dấu cộng, chia 1000, hai chữ số", () => {
    expect(formatChange(50)).toBe("+0.05");
  });

  it("âm có dấu trừ, chia 1000, hai chữ số", () => {
    expect(formatChange(-1400)).toBe("-1.40");
  });

  it("không đổi thì không có dấu", () => {
    expect(formatChange(0)).toBe("0.00");
  });
});

describe("formatPercent", () => {
  it("hai chữ số thập phân kèm %", () => {
    expect(formatPercent(0.1567)).toBe("0.16%");
  });

  it("âm giữ dấu trừ", () => {
    expect(formatPercent(-1.1717)).toBe("-1.17%");
  });
});
