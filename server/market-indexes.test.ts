import { describe, expect, it } from "vitest";
import { MarketIndexes } from "./market-indexes";
import { MarketSimulator, seededRandom } from "./market-simulator";

// 10:30 giờ Việt Nam = 03:30 UTC.
const AT_1030 = () => Date.UTC(2026, 10, 17, 3, 30, 20);
const AT_2000 = () => Date.UTC(2026, 10, 17, 13, 0, 0);

describe("MarketIndexes", () => {
  it("có đủ năm chỉ số, mỗi chỉ số có mốc và số mã", () => {
    const indexes = new MarketIndexes(new MarketSimulator(seededRandom(1)), AT_1030);
    const codes = indexes.snapshots().map((snapshot) => snapshot.code);
    expect(codes).toEqual(["VNI", "VN30", "HNX", "UPCOM", "HNX30"]);
    for (const snapshot of indexes.snapshots()) {
      expect(snapshot.ref).toBeGreaterThan(0);
      expect(snapshot.up + snapshot.flat + snapshot.down).toBeGreaterThan(0);
    }
  });

  it("trong giờ: lịch sử từ 09:00 tới phút hiện tại, điểm cuối bằng giá trị hiện tại", () => {
    const indexes = new MarketIndexes(new MarketSimulator(seededRandom(2)), AT_1030);
    const points = indexes.history("VNI")!;
    expect(points[0].time).toBe("09:00");
    expect(points[points.length - 1].time).toBe("10:30");
    expect(points).toHaveLength(91);
    expect(points[points.length - 1].value).toBe(indexes.snapshots()[0].value);
  });

  it("ngoài giờ: đủ một ngày, bỏ giờ nghỉ trưa", () => {
    const points = new MarketIndexes(new MarketSimulator(seededRandom(3)), AT_2000).history("HNX")!;
    expect(points[points.length - 1].time).toBe("15:00");
    expect(points.some((point) => point.time === "12:00")).toBe(false);
  });

  it("update() ghép giá mới vào phút hiện tại", () => {
    const market = new MarketSimulator(seededRandom(4));
    const indexes = new MarketIndexes(market, AT_1030);
    for (let i = 0; i < 20; i += 1) market.tick();
    const [vni] = indexes.update();
    const points = indexes.history("VNI")!;
    expect(points[points.length - 1]).toMatchObject({ time: "10:30", value: vni.value });
  });

  it("mã chỉ số lạ thì không có lịch sử", () => {
    expect(new MarketIndexes(new MarketSimulator(seededRandom(5)), AT_1030).history("XYZ")).toBeUndefined();
  });
});
