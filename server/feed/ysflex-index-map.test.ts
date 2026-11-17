import { describe, expect, it } from "vitest";
import { historyCodeOf, mapHistoryRows, mapIgiMessage } from "./ysflex-index-map";

// Tin mẫu GIẢ, cùng cấu trúc với kênh chỉ số của luồng /market (tên kênh, tên trường), số liệu tự đặt.
const IGI = {
  topic: "KRXMDDS|IGI|STO|001",
  data: {
    t30001: "STO", t30167: "001", t30217: 1200.5, t40002: 1210, t40003: -9.5,
    t387: 500_000_000, t381: 12_000_000_000_000,
    t30589: 2, t30590: 100, t30591: 60, t30592: 180, t30593: 5, t60: "101502123",
  },
};

describe("mapIgiMessage", () => {
  it("đọc giá trị, tham chiếu, thay đổi, khối lượng, giá trị và số mã tăng giảm", () => {
    expect(mapIgiMessage(IGI)).toEqual({
      code: "VNI", value: 1200.5, ref: 1210, change: -9.5, changePct: -0.79,
      volume: 500_000_000, turnover: 12_000_000_000_000,
      up: 100, ceil: 2, flat: 60, down: 180, floor: 5, time: "10:15:02",
    });
  });

  it("nhận đúng mã của từng sàn", () => {
    const hnx = { topic: "KRXMDDS|IGI|STX|002", data: { ...IGI.data, t30001: "STX", t30167: "002" } };
    const upcom = { topic: "KRXMDDS|IGI|UPX|301", data: { ...IGI.data, t30001: "UPX", t30167: "301" } };
    expect(mapIgiMessage(hnx)?.code).toBe("HNX");
    expect(mapIgiMessage(upcom)?.code).toBe("UPCOM");
  });

  it("chỉ số không theo dõi, chỉ số chưa có số, hay tin khác thì trả null", () => {
    expect(mapIgiMessage({ topic: "KRXMDDS|IGI|STX|003", data: { ...IGI.data, t30001: "STX", t30167: "003" } })).toBeNull();
    expect(mapIgiMessage({ ...IGI, data: { ...IGI.data, t30217: 0 } })).toBeNull();
    expect(mapIgiMessage({ topic: "KRXMDDS|SI|G1|AAA", data: {} })).toBeNull();
    expect(mapIgiMessage(null)).toBeNull();
  });
});

describe("lịch sử trong ngày", () => {
  it("nhận mã từ topic", () => {
    expect(historyCodeOf("INTRADAY_1m|STO|101")).toBe("VN30");
    expect(historyCodeOf("INTRADAY_1m|STO|999")).toBeNull();
    expect(historyCodeOf(5)).toBeNull();
  });

  it("mỗi dòng nến 1 phút thành một điểm, tách theo chỉ số", () => {
    const rows = [
      { topic: "INTRADAY_1m|STO|001", data: { S: "001", O: 1, C: 1201, H: 1, L: 1, V: 10, T: "09:01:00" } },
      { topic: "INTRADAY_1m|STO|001", data: { S: "001", O: 1, C: 1202, H: 1, L: 1, V: 20, T: "09:02:00" } },
      { topic: "INTRADAY_1m|UPX|301", data: { S: "301", O: 1, C: 120, H: 1, L: 1, V: 5, T: "09:01:00" } },
      { topic: "INTRADAY_1m|STO|001", data: { T: "09:03:00" } },
    ];
    const result = mapHistoryRows(rows);
    expect(result.get("VNI")).toEqual([
      { time: "09:01", value: 1201, volume: 10 },
      { time: "09:02", value: 1202, volume: 20 },
    ]);
    expect(result.get("UPCOM")).toEqual([{ time: "09:01", value: 120, volume: 5 }]);
  });

  it("dữ liệu không phải mảng thì trả rỗng", () => {
    expect(mapHistoryRows("").size).toBe(0);
  });
});
