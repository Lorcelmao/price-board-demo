import { describe, expect, it } from "vitest";
import { mapYsflexMessage } from "./ysflex-map";

// Tin mẫu GIẢ, cùng cấu trúc với luồng /market (tên kênh, tên trường), số liệu tự đặt.
const ST = "KRXMDDS|ST|G1|AAA";
const SI = "KRXMDDS|SI|G1|AAA";
const TP = "KRXMDDS|TP|G1|AAA";
const MD = "KRXMDDS|MD|G1|AAA";

const stream = (topic: string, data: Record<string, unknown>) => mapYsflexMessage("onFOSStream", { topic, data });

const ST_DATA = { t55: "AAA", t207: "HO", t20013: 20000, t1149: 21400, t1148: 18600, t140: 20000, t15: "VND" };
const SI_DATA = {
  t55: "AAA", t270: 20100, t271: 300, t387: 500000, t381: 10050000000,
  t30562: 20300, t30563: 19900, t30561: 20000, t40001: 20100, t30557: 1000000000, t30558: 500000000,
};
const TP_DATA = {
  t55: "AAA",
  TPBID: [
    { t290: 1, t270: 20050, t271: 1000 },
    { t290: 2, t270: 20000, t271: 2000 },
    { t290: 3, t270: 19950, t271: 3000 },
  ],
  TPOFFER: [
    { t290: 1, t270: 20100, t271: 1500 },
    { t290: 2, t270: 20150, t271: 2500 },
    { t290: 3, t270: 20200, t271: 3500 },
  ],
};
const MD_DATA = { t55: "AAA", t270: 20100, t271: 300 };

describe("ysflex-map: ST (thông tin tĩnh)", () => {
  it("lấy mã, trần, sàn, TC", () => {
    const result = stream(ST, ST_DATA);
    expect(result).not.toBeNull();
    expect(result!.symbol).toBe("AAA");
    expect(result!.patch.ref).toBe(20000);
    expect(result!.patch.ceil).toBe(21400);
    expect(result!.patch.floor).toBe(18600);
  });

  it("ánh xạ sàn HO sang HOSE", () => {
    expect(stream(ST, ST_DATA)!.patch.exchange).toBe("HOSE");
  });
});

describe("ysflex-map: SI (khớp lệnh)", () => {
  it("lấy giá khớp, KL khớp, tổng KL", () => {
    const result = stream(SI, SI_DATA);
    expect(result!.symbol).toBe("AAA");
    expect(result!.patch.last).toBe(20100);
    expect(result!.patch.lastVolume).toBe(300);
    expect(result!.patch.totalVolume).toBe(500000);
  });

  it("giá khớp lấy t270, không lấy t20026", () => {
    // t20026 có thể đứng yên trong khi t270 đi theo từng lần khớp; giá trên màn hình theo t270.
    const result = stream(SI, { t55: "AAA", t20026: 20000, t270: 20150, t271: 100, t387: 500100 });
    expect(result!.patch.last).toBe(20150);
  });

  it("tin SI không có t270 thì không đổi giá khớp", () => {
    const result = stream(SI, { t55: "AAA", t20026: 20000, t387: 500100 });
    expect(result!.patch).not.toHaveProperty("last");
    expect(result!.patch.totalVolume).toBe(500100);
  });

  it("lấy giá trung bình, cao, thấp, mở cửa", () => {
    const result = stream(SI, SI_DATA);
    expect(result!.patch.avgPrice).toBe(20100);
    expect(result!.patch.high).toBe(20300);
    expect(result!.patch.low).toBe(19900);
    expect(result!.patch.open).toBe(20000);
  });

  it("lấy giá trị khối ngoại có sẵn trong luồng", () => {
    const result = stream(SI, SI_DATA);
    expect(result!.patch.foreignBuyValue).toBe(1000000000);
    expect(result!.patch.foreignSellValue).toBe(500000000);
  });
});

describe("ysflex-map: TP (ba mức dư mua, dư bán)", () => {
  it("xếp dư mua từ mức 1 đến mức 3", () => {
    expect(stream(TP, TP_DATA)!.patch.bids).toEqual([[20050, 1000], [20000, 2000], [19950, 3000]]);
  });

  it("xếp dư bán từ mức 1 đến mức 3", () => {
    expect(stream(TP, TP_DATA)!.patch.asks).toEqual([[20100, 1500], [20150, 2500], [20200, 3500]]);
  });
});

describe("ysflex-map: MD (khớp gần nhất)", () => {
  it("lấy giá và KL khớp", () => {
    const result = stream(MD, MD_DATA);
    expect(result!.patch.last).toBe(20100);
    expect(result!.patch.lastVolume).toBe(300);
  });
});

// Tin cập nhật có thể chỉ mang một phần dữ liệu. Bản vá không được chứa trường vắng mặt,
// nếu không, khi trộn đè lên dữ liệu đang có, trường đó sẽ thành undefined.
describe("ysflex-map: tin chỉ có một phần", () => {
  it("TP chỉ có dư mua thì bản vá không có khoá asks", () => {
    const result = stream(TP, { TPBID: [{ t290: 1, t270: 20050, t271: 1000 }] });
    expect(result!.patch.bids).toEqual([[20050, 1000]]);
    expect("asks" in result!.patch).toBe(false);
  });

  it("ST chỉ có trần thì bản vá không có khoá ref, floor, exchange", () => {
    expect(stream(ST, { t1149: 21400 })!.patch).toEqual({ ceil: 21400 });
  });

  it("MD chỉ có giá thì bản vá không có khoá lastVolume", () => {
    expect(stream(MD, { t270: 20100 })!.patch).toEqual({ last: 20100 });
  });

  it("trộn bản vá một phần không làm mất dữ liệu cũ", () => {
    const current = { bids: [[20000, 1000]], asks: [[20100, 500]] };
    const result = stream(TP, { TPBID: [{ t290: 1, t270: 20050, t271: 2000 }] });
    expect({ ...current, ...result!.patch }.asks).toEqual([[20100, 500]]);
  });
});

describe("ysflex-map: tin không nhận ra", () => {
  it("topic lạ thì trả null, không ném lỗi", () => {
    expect(stream("KRXMDDS|XX|G1|ZZZ", { t55: "ZZZ" })).toBeNull();
  });

  it("sự kiện không phải onFOSStream thì trả null", () => {
    expect(mapYsflexMessage("SUB_RES", { Result: 1, Data: "" })).toBeNull();
    expect(mapYsflexMessage("SUB_REQ", { topic: ["KRXMDDS|SI|G1"], value: ["AAA"] })).toBeNull();
  });

  it("payload hỏng thì trả null", () => {
    expect(mapYsflexMessage("onFOSStream", null)).toBeNull();
    expect(mapYsflexMessage("onFOSStream", {})).toBeNull();
    expect(mapYsflexMessage("onFOSStream", { topic: 12 })).toBeNull();
  });
});
