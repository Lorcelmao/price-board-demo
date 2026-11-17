import { describe, expect, it } from "vitest";
import {
  COLUMNS,
  GROUP_ORDER,
  columnGroups,
  columnsById,
  visibleColumnIds,
} from "./columns";

// Tiêu đề tầng dưới phải khớp EXPECTED_TITLES trong scripts/browser-checks/check-layout.js.
const EXPECTED_TITLES = [
  "", "Mã CK", "Trần", "Sàn", "TC",
  "Giá 3", "KL 3", "Giá 2", "KL 2", "Giá 1", "KL 1",
  "Giá", "KL", "+/-", "%",
  "Giá 1", "KL 1", "Giá 2", "KL 2", "Giá 3", "KL 3",
  "Tổng KL", "TB", "Thấp", "Cao", "Mở cửa",
  "KL mua", "GT mua", "KL bán", "GT bán",
];

describe("columns: danh sách cột", () => {
  it("có đúng 30 cột, tính cả cột kéo", () => {
    expect(COLUMNS).toHaveLength(30);
  });

  it("tiêu đề đúng thứ tự mong đợi", () => {
    expect(COLUMNS.map((column) => column.title)).toEqual(EXPECTED_TITLES);
  });

  it("id không trùng nhau", () => {
    const ids = COLUMNS.map((column) => column.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("có đúng 5 nhóm, đúng thứ tự", () => {
    expect(GROUP_ORDER).toEqual(["Thông tin dư mua", "Khớp lệnh", "Thông tin dư bán", "Giá", "Nhà ĐTNN"]);
    const groups = COLUMNS.filter((column) => column.group).map((column) => column.group);
    expect([...new Set(groups)]).toEqual(GROUP_ORDER);
  });

  it("số cột mỗi nhóm đúng", () => {
    expect(columnGroups().map((group) => ({ name: group.name, span: group.span }))).toEqual([
      { name: "Thông tin dư mua", span: 6 },
      { name: "Khớp lệnh", span: 4 },
      { name: "Thông tin dư bán", span: 6 },
      { name: "Giá", span: 4 },
      { name: "Nhà ĐTNN", span: 4 },
    ]);
  });

  it("cột kéo không sắp xếp được, các cột còn lại đều có sortValue", () => {
    const drag = columnsById().get("drag");
    expect(drag).toBeDefined();
    expect(drag!.sortValue).toBeUndefined();
    expect(drag!.title).toBe("");
    for (const column of COLUMNS) {
      if (column.id === "drag") continue;
      expect(typeof column.sortValue).toBe("function");
    }
  });

  it("mọi cột đều có render trả về một ô", () => {
    for (const column of COLUMNS) expect(typeof column.render).toBe("function");
  });
});

describe("columns: ẩn cột", () => {
  it("không truyền danh sách ẩn thì đủ 30 cột", () => {
    expect(visibleColumnIds()).toHaveLength(30);
  });

  it("ẩn cột thì biến mất, Mã CK không ẩn được", () => {
    const visible = visibleColumnIds(["bid3v", "symbol"]);
    expect(visible).not.toContain("bid3v");
    expect(visible).toContain("symbol");
    expect(visible).toHaveLength(29);
  });
});

describe("columns: ô mở form đặt lệnh nháp", () => {
  it("đúng các cột giá dư mua, dư bán, Mã CK và Giá khớp", () => {
    const openers = COLUMNS.filter((column) => column.opens).map((column) => `${column.id}:${column.opens!.kind}`);
    expect(openers).toEqual([
      "symbol:symbol",
      "bid3p:bid", "bid2p:bid", "bid1p:bid",
      "last:last",
      "ask1p:ask", "ask2p:ask", "ask3p:ask",
    ]);
  });

  it("mức giá đi kèm đúng 3, 2, 1", () => {
    const levels = COLUMNS.filter((column) => column.opens?.kind === "bid").map((column) => column.opens!.level);
    expect(levels).toEqual([2, 1, 0]);
  });

  it("cột khối lượng và cột kéo không mở form", () => {
    for (const id of ["drag", "bid3v", "bid2v", "bid1v", "lastVolume", "ask1v", "ask2v", "ask3v", "totalVolume"]) {
      expect(COLUMNS.find((column) => column.id === id)?.opens).toBeUndefined();
    }
  });
});
