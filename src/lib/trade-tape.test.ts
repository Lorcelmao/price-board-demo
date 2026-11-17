import { describe, expect, it } from "vitest";
import { nextTape, profileFromTrades, TAPE_LIMIT, volumeByHour } from "./trade-tape";

describe("danh sách khớp lệnh", () => {
  it("Tổng KL tăng thì thêm một lần khớp ở giá mới nhất, mới nhất ở đầu", () => {
    const first = nextTape([], { last: 52_700, totalVolume: 1_000 }, { last: 52_800, totalVolume: 1_300 }, 10);
    const second = nextTape(first, { last: 52_800, totalVolume: 1_300 }, { last: 52_900, totalVolume: 1_500 }, 20);
    expect(second).toEqual([
      { time: 20, price: 52_900, volume: 200 },
      { time: 10, price: 52_800, volume: 300 },
    ]);
  });

  it("chưa có quote trước, Tổng KL không đổi hay giảm, chưa có giá khớp thì không thêm", () => {
    expect(nextTape([], null, { last: 1, totalVolume: 5 }, 0)).toEqual([]);
    expect(nextTape([], { last: 1, totalVolume: 5 }, { last: 1, totalVolume: 5 }, 0)).toEqual([]);
    expect(nextTape([], { last: 1, totalVolume: 5 }, { last: 1, totalVolume: 3 }, 0)).toEqual([]);
    expect(nextTape([], { last: null, totalVolume: 0 }, { last: null, totalVolume: 9 }, 0)).toEqual([]);
  });

  it("giữ tối đa 50 lần khớp", () => {
    let tape = nextTape([], { last: 1, totalVolume: 0 }, { last: 1, totalVolume: 1 }, 0);
    for (let i = 1; i <= 60; i += 1) tape = nextTape(tape, { last: 1, totalVolume: i }, { last: 1, totalVolume: i + 1 }, i);
    expect(tape).toHaveLength(TAPE_LIMIT);
    expect(tape[0].time).toBe(60);
  });
});

describe("khối lượng theo giờ", () => {
  it("gộp theo giờ từ 08h đến 16h, bỏ phút ngoài khung", () => {
    const hours = volumeByHour([
      { minute: "08:59", volume: 100 },
      { minute: "09:00", volume: 200 },
      { minute: "09:30", volume: 300 },
      { minute: "07:59", volume: 999 },
      { minute: "16:10", volume: 50 },
    ]);
    expect(hours).toHaveLength(9);
    expect(hours[0]).toEqual({ hour: 8, volume: 100 });
    expect(hours[1]).toEqual({ hour: 9, volume: 500 });
    expect(hours[8]).toEqual({ hour: 16, volume: 50 });
  });
});

describe("profileFromTrades", () => {
  it("cộng khối lượng theo mức giá, giá cao ở trên", () => {
    expect(profileFromTrades([
      { price: 48_500, volume: 100 },
      { price: 48_600, volume: 50 },
      { price: 48_500, volume: 200 },
    ])).toEqual([{ price: 48_600, volume: 50 }, { price: 48_500, volume: 300 }]);
  });

  it("không có lệnh khớp thì rỗng", () => {
    expect(profileFromTrades([])).toEqual([]);
  });
});
