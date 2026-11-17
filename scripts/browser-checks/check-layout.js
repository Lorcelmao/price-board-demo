// Kiểm tra bố cục bảng giá, chạy trong trang. Trả về danh sách { id, pass, detail }.
// Cách dùng: dán vào console, hoặc nạp bằng evaluate_script; script tự chạy, kết quả ở window.__checkLayoutResult.
// Chạy với cả nguồn mặc định (mock) và ?nguon=ysflex.
// Chạy sau khi xoá localStorage (localStorage.clear() rồi tải lại) để có cấu hình mặc định:
// cột ẩn, thứ tự đã kéo hay trạng thái thu gọn sẽ làm C2, C3, C4 trượt.
(() => {
  const MOCK_SYMBOLS = ["ACB", "BID", "CTG", "FPT", "GAS", "GVR", "HDB", "HPG", "LPB", "MBB", "MSN", "MWG", "PLX", "POW", "SHB", "SSI", "STB", "TCB", "TPB", "VCB", "VHM", "VIB", "VIC", "VNM", "VPB", "VRE"];
  const YSFLEX_SYMBOLS = ["ACB", "BID", "BSR", "CTG", "FPT", "GAS", "GVR", "HDB", "HPG", "LPB", "MBB", "MCH", "MSN", "MWG", "SAB", "SHB", "SSB", "SSI", "STB", "TCB", "TCX", "VCB", "VHM", "VIB", "VIC", "VJC", "VNM", "VPB", "VPL", "VRE"];

  // Tiêu đề cột tầng dưới mong đợi. Ô gộp hai tầng thuộc cả hai tầng.
  const EXPECTED_TITLES = [
    "", "Mã CK", "Trần", "Sàn", "TC",
    "Giá 3", "KL 3", "Giá 2", "KL 2", "Giá 1", "KL 1",
    "Giá", "KL", "+/-", "%",
    "Giá 1", "KL 1", "Giá 2", "KL 2", "Giá 3", "KL 3",
    "Tổng KL", "TB", "Thấp", "Cao", "Mở cửa",
    "KL mua", "GT mua", "KL bán", "GT bán",
  ];
  const EXPECTED_GROUPS = ["Thông tin dư mua", "Khớp lệnh", "Thông tin dư bán", "Giá", "Nhà ĐTNN"];
  const EXPECTED_UNITS = "Đơn vị giá x1000VND - Khối lượng x100CP";

  const results = [];
  const push = (id, pass, detail) => results.push({ id, pass: Boolean(pass), detail });

  // C1: thứ tự vùng 1..6 từ trên xuống.
  const regionSelectors = [".pb-top", ".pb-menu", ".pb-index-strip", ".pb-tabs", ".pb-board-wrap", ".pb-foot"];
  const tops = regionSelectors.map((sel) => {
    const el = document.querySelector(sel);
    return el ? Math.round(el.getBoundingClientRect().top) : null;
  });
  const missingRegion = regionSelectors.filter((_, i) => tops[i] === null);
  const ordered = tops.every((top, i) => i === 0 || (top !== null && tops[i - 1] !== null && top > tops[i - 1]));
  push("C1", missingRegion.length === 0 && ordered, missingRegion.length ? `thiếu vùng ${missingRegion.join(", ")}` : `top theo thứ tự: ${tops.join(" < ")}`);

  // C2: tiêu đề cột. Dựng danh sách cột hiệu dụng của hai tầng đầu bảng,
  // tôn trọng rowSpan của ô gộp hai tầng và colSpan của ô nhóm.
  const thead = document.querySelector(".pb-table thead");
  const effectiveTitles = [];
  if (thead) {
    const rows = [...thead.querySelectorAll("tr")];
    // Lưới ô theo (row, col). Ô rowSpan=2 ở hàng đầu phủ cả hai tầng.
    const grid = [];
    rows.forEach((row, rowIndex) => {
      grid[rowIndex] = grid[rowIndex] || [];
      let col = 0;
      for (const cell of row.children) {
        while (grid[rowIndex][col]) col += 1;
        const rowSpan = Number(cell.getAttribute("rowspan") || 1);
        const colSpan = Number(cell.getAttribute("colspan") || 1);
        for (let dr = 0; dr < rowSpan; dr += 1) {
          grid[rowIndex + dr] = grid[rowIndex + dr] || [];
          for (let dc = 0; dc < colSpan; dc += 1) grid[rowIndex + dr][col + dc] = { cell, rowIndex };
        }
        col += colSpan;
      }
    });
    // Tầng dưới: mỗi cột lấy ô của hàng cuối, hoặc ô rowSpan=2 nếu không có ô riêng ở hàng cuối.
    const lastRow = grid[rows.length - 1] || [];
    for (let col = 0; col < lastRow.length; col += 1) {
      const hit = lastRow[col];
      if (!hit) continue;
      effectiveTitles.push((hit.cell.textContent || "").trim());
    }
  }
  const titlesMatch = effectiveTitles.length === EXPECTED_TITLES.length
    && effectiveTitles.every((title, i) => title === EXPECTED_TITLES[i]);
  const firstMismatch = titlesMatch ? -1 : EXPECTED_TITLES.findIndex((title, i) => title !== effectiveTitles[i]);
  push(
    "C2",
    titlesMatch,
    titlesMatch
      ? `${effectiveTitles.length} tiêu đề khớp`
      : `cột ${firstMismatch}: mong "${EXPECTED_TITLES[firstMismatch]}", thấy "${effectiveTitles[firstMismatch] ?? "(thiếu)"}"; tổng ${effectiveTitles.length}/${EXPECTED_TITLES.length}`,
  );

  // C3: đúng 5 nhóm ở tầng trên.
  const groupCells = [...document.querySelectorAll(".pb-head-groups th.pb-group")].map((el) => (el.textContent || "").trim());
  const groupsMatch = groupCells.length === EXPECTED_GROUPS.length && groupCells.every((name, i) => name === EXPECTED_GROUPS[i]);
  push("C3", groupsMatch, `nhóm: ${groupCells.join(" | ")}`);

  // C4: số dòng, đúng mã, xếp theo bảng chữ cái.
  const source = new URLSearchParams(location.search).get("nguon") === "ysflex" ? "ysflex" : "mock";
  const expectedSymbols = source === "mock" ? MOCK_SYMBOLS : YSFLEX_SYMBOLS;
  const rows = [...document.querySelectorAll(".pb-table tbody tr")];
  const actualSymbols = rows.map((tr) => (tr.getAttribute("data-symbol") || "").trim());
  const sortedExpected = [...expectedSymbols].sort((a, b) => a.localeCompare(b));
  const sameSet = actualSymbols.length === expectedSymbols.length
    && actualSymbols.every((symbol, i) => symbol === sortedExpected[i]);
  push(
    "C4",
    sameSet,
    sameSet
      ? `${actualSymbols.length} dòng, nguồn ${source}, đúng thứ tự bảng chữ cái`
      : `nguồn ${source}: ${actualSymbols.length}/${expectedSymbols.length} dòng; thấy ${actualSymbols.slice(0, 6).join(",")}...`,
  );

  // C5: màu ô Trần, Sàn, TC ở dòng đầu bằng token --ceil, --floor, --ref.
  const tokenColor = (name) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const hex = value.match(/^#(\w{2})(\w{2})(\w{2})$/);
    return hex ? `rgb(${parseInt(hex[1], 16)}, ${parseInt(hex[2], 16)}, ${parseInt(hex[3], 16)})` : value;
  };
  const firstCells = rows[0] ? [...rows[0].querySelectorAll("td")] : [];
  const colorOf = (index) => (firstCells[index] ? getComputedStyle(firstCells[index]).color : null);
  const colorChecks = [
    { name: "Trần", index: 2, want: tokenColor("--ceil") },
    { name: "Sàn", index: 3, want: tokenColor("--floor") },
    { name: "TC", index: 4, want: tokenColor("--ref") },
  ];
  const colorPass = rows.length > 0 && colorChecks.every((check) => colorOf(check.index) === check.want);
  push(
    "C5",
    colorPass,
    colorChecks.map((check) => `${check.name}=${colorOf(check.index)}${colorOf(check.index) === check.want ? "" : ` (mong ${check.want})`}`).join(", "),
  );

  // C6: logo đầu trang dùng tên riêng của dự án, không mượn thương hiệu của công ty nào.
  const logo = (document.querySelector(".pb-logo")?.textContent || "").trim();
  push("C6", logo === "Price Board Demo", `logo: "${logo}"`);

  // C7: đúng chữ đơn vị ở chân trang.
  const footText = (document.querySelector(".pb-foot")?.innerText || "").replace(/\s+/g, " ");
  push("C7", footText.includes(EXPECTED_UNITS), footText.split("\n")[0]);

  // C8: màu ô Mã CK bằng màu ô giá khớp ở mọi dòng có giá.
  // Cột lấy theo data-cell, không theo chỉ số, để còn đúng khi người dùng ẩn bớt cột.
  const colorRows = rows.map((tr) => {
    const symbolCell = tr.querySelector('[data-cell="symbol"]');
    const lastCell = tr.querySelector('[data-cell="last"]');
    if (!symbolCell || !lastCell) return null;
    const lastText = (lastCell.textContent || "").trim();
    if (!lastText) return null;
    return {
      symbol: tr.getAttribute("data-symbol"),
      symbolColor: getComputedStyle(symbolCell).color,
      lastColor: getComputedStyle(lastCell).color,
    };
  }).filter(Boolean);
  const mismatched = colorRows.filter((row) => row.symbolColor !== row.lastColor);
  push(
    "C8",
    colorRows.length > 0 && mismatched.length === 0,
    mismatched.length === 0
      ? `${colorRows.length}/${colorRows.length} dòng có màu Mã CK trùng màu giá khớp`
      : `${mismatched.length}/${colorRows.length} dòng lệch, ví dụ ${mismatched[0].symbol}: mã ${mismatched[0].symbolColor} vs giá ${mismatched[0].lastColor}`,
  );

  // C9: chữ tiêu đề không trôi khi sắp xếp, và cột Mã CK thẳng hàng.
  // Mọi nút sắp xếp phải có ô mũi tên cùng độ rộng (cột đang xếp hay không), nên vị trí chữ không đổi.
  // Chữ đầu "Mã CK" phải cùng lề trái với chữ đầu của mã ở dòng đầu (lệch tối đa 1px).
  const textLeft = (node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return range.getBoundingClientRect().left;
  };
  const icons = [...document.querySelectorAll(".pb-table button.pb-sort")].map((b) => b.querySelector(".pb-sort-icon"));
  const iconWidths = [...new Set(icons.map((i) => (i ? Math.round(i.getBoundingClientRect().width) : -1)))];
  const symHeadText = document.querySelector('.pb-table thead th[data-col="symbol"] button.pb-sort')?.firstChild;
  const symCell = rows[0]?.querySelector('[data-cell="symbol"]');
  const alignDiff = symHeadText && symCell ? Math.abs(textLeft(symHeadText) - textLeft(symCell)) : NaN;
  push(
    "C9",
    icons.length > 0 && !icons.includes(null) && iconWidths.length === 1 && iconWidths[0] > 0 && alignDiff <= 1,
    `${icons.length} nút sắp xếp, độ rộng ô mũi tên ${iconWidths.join("/")}px; lệch lề Mã CK ${Number.isNaN(alignDiff) ? "?" : alignDiff.toFixed(1)}px`,
  );

  // C10: bốn thẻ chỉ số VNI, VN30, HNX, UPCOM đều có biểu đồ đã vẽ, và giá trị trên thẻ khớp dòng cùng mã
  // ở bảng "Chỉ số chính". Chạy khi dải chỉ số đang mở (chưa thu gọn) và đã có số.
  const cards = [...document.querySelectorAll(".pb-index-card[data-index]")];
  const cardCodes = cards.map((card) => card.getAttribute("data-index"));
  const cardIssues = cards.flatMap((card) => {
    const code = card.getAttribute("data-index");
    const canvas = card.querySelector(".pb-index-canvas canvas");
    // Số trên thẻ là chữ của ô giá trị trừ phần (+/- %) trong thẻ small; mũi tên ↑↓ bỏ đi.
    const valueEl = card.querySelector(`[data-testid="index-value-${code}"]`);
    const small = valueEl?.querySelector("small")?.textContent || "";
    const value = (valueEl?.textContent || "").replace(small, "").replace(/[↑↓]/g, "").trim();
    const row = document.querySelector(`.pb-main-index-row[data-index="${code}"] span:nth-child(2)`);
    const rowValue = (row?.textContent || "").trim().split(" ")[0];
    const issues = [];
    if (!canvas || canvas.width === 0) issues.push(`${code}: chưa vẽ biểu đồ`);
    if (!value) issues.push(`${code}: chưa có số`);
    else if (value !== rowValue) issues.push(`${code}: thẻ ${value} khác bảng ${rowValue}`);
    return issues;
  });
  const codesOk = cardCodes.join(",") === "VNI,VN30,HNX,UPCOM";
  push("C10", codesOk && cardIssues.length === 0, codesOk ? (cardIssues.join("; ") || "4 thẻ có biểu đồ, số khớp bảng") : `thẻ: ${cardCodes.join(",")}`);

  window.__checkLayoutResult = results;
  return results;
})()
