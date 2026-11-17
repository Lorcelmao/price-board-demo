// Kiểm tra tương tác của bảng , chạy trong trang. Trả về danh sách { id, pass, detail }.
// Cách dùng: dán vào console hoặc nạp bằng evaluate_script; script tự chạy, kết quả ở window.__checkInteractionsResult.
// Script tự trả trang về trạng thái ban đầu khi chạy xong: bỏ sắp xếp, mở lại dải chỉ số,
// và không đụng vào localStorage (mọi thao tác đều hoàn tác).
(async () => {
  const results = [];
  const push = (id, pass, detail) => results.push({ id, pass: Boolean(pass), detail });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const headCells = () => [...document.querySelectorAll(".pb-table thead th")];
  const titleOf = (el) => (el.textContent || "").replace(/[▲▼]/g, "").trim();
  const pctHeader = () => headCells().find((el) => titleOf(el) === "%");
  const symbols = () => [...document.querySelectorAll(".pb-table tbody tr")].map((tr) => tr.getAttribute("data-symbol"));
  const pctTexts = () => [...document.querySelectorAll(".pb-table tbody tr")]
    .map((tr) => [...tr.querySelectorAll("td")].map((td) => (td.textContent || "").trim()))
    .map((cells) => cells.find((text) => /^-?\d+\.\d{2}%$/.test(text)) || "");

  // Trạng thái đầu vào để khôi phục: cột % có đang xếp không.
  const initialSort = pctHeader()?.getAttribute("aria-sort") ?? "none";
  const initialCollapsed = !document.querySelector(".pb-index-strip");
  const collapseButton = () => document.querySelector(".pb-collapse");
  const pctButton = () => pctHeader()?.querySelector("button");

  // Đưa về trạng thái không xếp trước khi kiểm I1.
  const clicksToNone = (current) => {
    if (current === "descending") return 2; // desc -> asc -> none
    if (current === "ascending") return 1;  // asc -> none
    return 0;
  };
  for (let i = 0; i < clicksToNone(initialSort); i += 1) {
    pctButton()?.click();
    await sleep(120);
  }

  // I1: chu trình sắp xếp của cột "%": giảm dần, tăng dần, về mặc định.
  const cycle = [];
  for (let i = 0; i < 3; i += 1) {
    pctButton()?.click();
    await sleep(160);
    cycle.push({
      aria: pctHeader()?.getAttribute("aria-sort"),
      icon: pctHeader()?.querySelector(".pb-sort-icon")?.textContent ?? "",
    });
  }
  const cycleOk = cycle[0].aria === "descending" && cycle[0].icon === "▼"
    && cycle[1].aria === "ascending" && cycle[1].icon === "▲"
    && cycle[2].aria === "none" && cycle[2].icon === "";
  push("I1", Boolean(pctButton()) && cycleOk, cycle.map((step) => `${step.aria}/${step.icon || "-"}`).join(" → "));

  // I2: aria-sort chỉ đặt cho cột đang xếp, mọi cột sắp xếp được khác là "none".
  // Ô tiêu đề nhóm không mang aria-sort (không bấm được), nên chỉ xét các ô có thuộc tính này.
  pctButton()?.click();
  await sleep(160);
  const sorts = [...document.querySelectorAll(".pb-table thead th[aria-sort]")]
    .map((el) => ({ title: titleOf(el), aria: el.getAttribute("aria-sort") }));
  const active = sorts.filter((item) => item.aria !== "none");
  const othersNone = sorts.every((item) => item.aria === "none" || item.title === "%");
  push(
    "I2",
    active.length === 1 && active[0].title === "%" && active[0].aria === "descending" && othersNone,
    `${sorts.length} cột có aria-sort; đang xếp: ${active.map((item) => `${item.title}=${item.aria}`).join(", ") || "không có"}; cột khác đều none=${othersNone}`,
  );

  // I3: thứ tự không nhảy sau 5 giây khi đang xếp, dù giá chạy.
  const before = symbols();
  const beforePct = pctTexts();
  await sleep(5000);
  const after = symbols();
  const afterPct = pctTexts();
  const orderStable = JSON.stringify(before) === JSON.stringify(after);
  const valuesMoved = JSON.stringify(beforePct) !== JSON.stringify(afterPct);
  push(
    "I3",
    orderStable,
    `thứ tự giữ nguyên=${orderStable}; giá trị có đổi trong 5 giây=${valuesMoved}`,
  );

  // I4: nháy ô tổng 400ms, mỗi ô tối đa một animation.
  const blinks = [];
  const nativeAnimate = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    const animation = nativeAnimate.call(this, keyframes, options);
    if (this instanceof HTMLElement && (this.dataset.cell === "last" || this.dataset.cell === "total")) {
      blinks.push({
        node: this,
        duration: options && options.duration,
        easing: options && options.easing,
        offsets: Array.isArray(keyframes) ? keyframes.map((frame) => frame.offset) : null,
        running: this.getAnimations().filter((item) => item.playState === "running").length,
      });
    }
    return animation;
  };
  await sleep(4000);
  Element.prototype.animate = nativeAnimate;
  const durations = [...new Set(blinks.map((blink) => blink.duration))];
  const easings = [...new Set(blinks.map((blink) => blink.easing))];
  const maxRunning = Math.max(0, ...blinks.map((blink) => blink.running));
  const offsetsOk = blinks.every((blink) => JSON.stringify(blink.offsets) === JSON.stringify([0, 0.625, 1]));
  push(
    "I4",
    blinks.length > 0 && durations.length === 1 && durations[0] === 400
      && easings.length === 1 && easings[0] === "linear" && offsetsOk && maxRunning === 1,
    `${blinks.length} lần nháy; duration=${durations.join(",")}; easing=${easings.join(",")}; mốc đúng=${offsetsOk}; tối đa animation mỗi ô=${maxRunning}`,
  );

  // I5: thu gọn thì vùng bảng cao thêm khoảng 190px, nút đổi chữ.
  const boardHeight = () => Math.round(document.querySelector(".pb-board-wrap").getBoundingClientRect().height);
  const heightBefore = boardHeight();
  const labelBefore = (collapseButton()?.textContent || "").trim();
  const wasCollapsed = !document.querySelector(".pb-index-strip");
  if (wasCollapsed) {
    collapseButton()?.click();
    await sleep(250);
  }
  const heightOpen = boardHeight();
  collapseButton()?.click();
  await sleep(250);
  const heightCollapsed = boardHeight();
  const labelCollapsed = (collapseButton()?.textContent || "").trim();
  const indexHidden = !document.querySelector(".pb-index-strip");
  const delta = heightCollapsed - heightOpen;
  push(
    "I5",
    indexHidden && delta >= 170 && delta <= 210 && labelCollapsed !== labelBefore,
    `mở=${heightOpen}px, thu gọn=${heightCollapsed}px, thêm ${delta}px; nút: "${labelBefore}" → "${labelCollapsed}"`,
  );

  // Trả trang về trạng thái ban đầu.
  collapseButton()?.click();
  await sleep(250);
  const nowSort = pctHeader()?.getAttribute("aria-sort") ?? "none";
  for (let i = 0; i < clicksToNone(nowSort); i += 1) {
    pctButton()?.click();
    await sleep(120);
  }
  if (initialCollapsed === Boolean(document.querySelector(".pb-index-strip"))) {
    collapseButton()?.click();
    await sleep(200);
  }

  window.__checkInteractionsResult = results;
  return results;
})()
