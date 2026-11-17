import { describe, expect, it } from "vitest";
import { phaseFromClock, vnTimeParts } from "./session-phase";

// Giờ Việt Nam (+07:00). Tạo Date từ chuỗi có offset để test không phụ thuộc múi giờ máy.
const vn = (iso: string) => new Date(iso);

describe("vnTimeParts: đọc giờ Việt Nam, không theo múi giờ máy", () => {
  it("trả đúng giờ và thứ theo +07:00", () => {
    expect(vnTimeParts(vn("2026-11-13T09:00:00+07:00"))).toMatchObject({
      hours: 9, minutes: 0, seconds: 0, weekday: 5,
    });
  });

  it("nửa đêm giờ Việt Nam vẫn là ngày của giờ Việt Nam", () => {
    const parts = vnTimeParts(vn("2026-11-13T00:30:00+07:00"));
    expect(parts.hours).toBe(0);
    expect(parts.minutes).toBe(30);
    expect(parts.weekday).toBe(5);
  });

  it("múi giờ máy đặt khác vẫn ra giờ Việt Nam", () => {
    // 02:00 UTC = 09:00 giờ Việt Nam.
    const parts = vnTimeParts(new Date("2026-11-13T02:00:00Z"));
    expect(parts.hours).toBe(9);
    expect(parts.minutes).toBe(0);
  });
});

describe("phaseFromClock: lịch HOSE", () => {
  const friday = (time: string) => phaseFromClock(vn(`2026-11-13T${time}+07:00`));

  it("trước giờ mở cửa là CLOSED", () => {
    expect(friday("08:59:59")).toBe("CLOSED");
  });

  it("9:00 đến trước 9:15 là ATO", () => {
    expect(friday("09:00:00")).toBe("ATO");
    expect(friday("09:14:59")).toBe("ATO");
  });

  it("9:15 là CONTINUOUS", () => {
    expect(friday("09:15:00")).toBe("CONTINUOUS");
    expect(friday("11:29:59")).toBe("CONTINUOUS");
  });

  it("11:30 đến trước 13:00 là CLOSED (nghỉ trưa)", () => {
    expect(friday("11:30:00")).toBe("CLOSED");
    expect(friday("12:59:59")).toBe("CLOSED");
  });

  it("13:00 là CONTINUOUS", () => {
    expect(friday("13:00:00")).toBe("CONTINUOUS");
    expect(friday("14:29:59")).toBe("CONTINUOUS");
  });

  it("14:30 đến trước 14:45 là ATC", () => {
    expect(friday("14:30:00")).toBe("ATC");
    expect(friday("14:44:59")).toBe("ATC");
  });

  it("14:45 trở đi là CLOSED", () => {
    expect(friday("14:45:00")).toBe("CLOSED");
    expect(friday("20:00:00")).toBe("CLOSED");
  });

  it("thứ bảy và chủ nhật là CLOSED", () => {
    expect(phaseFromClock(vn("2026-11-14T10:00:00+07:00"))).toBe("CLOSED");
    expect(phaseFromClock(vn("2026-11-15T10:00:00+07:00"))).toBe("CLOSED");
  });
});
