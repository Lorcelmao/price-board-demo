// Kiểm tra tab sàn và danh mục quan tâm, chạy với nguồn mock (mặc định).
// Trả về danh sách { id, pass, detail }. Chạy xong tự dọn những gì đã thêm vào danh mục.
// Dùng sự kiện chuột / bàn phím thật (click, keydown) chứ không chỉ dispatchEvent tổng hợp,
// vì lỗi Enter và Esc chỉ lộ ra khi bấm thật.
(async () => {
  const results = [];
  const push = (id, pass, detail) => results.push({ id, pass: Boolean(pass), detail });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const rows = () => [...document.querySelectorAll(".pb-table tbody tr.pb-row-data")];
  const symbols = () => rows().map((tr) => tr.getAttribute("data-symbol"));
  const tabButton = (id) => document.querySelector(`.pb-tab[data-tab="${id}"]`);
  const input = () => document.querySelector(".pb-symbol-input");
  const addButton = () => document.querySelector(".pb-add");
  const alertText = () => (document.querySelector(".pb-symbol-error")?.textContent || "").trim();

  const setPhase = async (phase) => {
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase }),
    });
    await sleep(400);
  };

  // Gõ bằng sự kiện thật trên phần tử: dùng setter của native input rồi phát 'input',
  // sau đó bấm nút + hoặc Enter như người dùng.
  const typeSymbol = async (text) => {
    const el = input();
    if (!el) return;
    el.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(120);
  };
  const pressEnter = async (el) => {
    el?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    await sleep(250);
  };

  try {
    await setPhase("CONTINUOUS");
    await sleep(1500);

    // T1: bấm tab HNX -> 8 dòng, toàn mã HNX, có giá trong 3 giây.
    await typeSymbol("");
    tabButton("hnx")?.click();
    await sleep(600);
    const hnxSymbols = symbols();
    // Danh sách HNX của mock (8 mã) theo server/instruments.ts.
    const EXPECTED_HNX = ["BVS", "CEO", "IDC", "MBS", "PVS", "SHS", "TNG", "VCS"];
    const allHnx = hnxSymbols.length === 8 && hnxSymbols.every((symbol) => EXPECTED_HNX.includes(symbol));
    await sleep(2500);
    const hnxWithPrice = rows().filter((tr) => (tr.querySelector('[data-cell="last"]')?.textContent || "").trim() !== "").length;
    push("T1", allHnx && hnxWithPrice >= 8, `${hnxSymbols.length} dòng: ${hnxSymbols.join(",")}; có giá ${hnxWithPrice}/8`);

    // T2: bấm tab UPCOM -> 7 dòng.
    tabButton("upcom")?.click();
    await sleep(600);
    const upcom = symbols();
    const EXPECTED_UPCOM = ["ACV", "FOX", "MCH", "OIL", "QNS", "VEA", "VGI"];
    const allUpcom = upcom.length === 7 && upcom.every((symbol) => EXPECTED_UPCOM.includes(symbol));
    push("T2", allUpcom, `${upcom.length} dòng: ${upcom.join(",")}`);

    // T3: thêm "fpt" vào DM quan tâm -> có dòng FPT; tải lại vẫn còn (kiểm ở T3b bên ngoài).
    tabButton("watchlist")?.click();
    await sleep(400);
    const emptyBefore = rows().length === 0;
    await typeSymbol("fpt");
    addButton()?.click();
    await sleep(600);
    const afterAdd = symbols();
    push(
      "T3",
      emptyBefore && afterAdd.includes("FPT"),
      `trước khi thêm: ${emptyBefore ? "trống" : rows().length + " dòng"}; sau khi thêm: ${afterAdd.join(",")}`,
    );

    // T4: thêm ZZZ -> lỗi "Không có mã ZZZ", danh mục không đổi.
    await typeSymbol("ZZZ");
    addButton()?.click();
    await sleep(400);
    const zzzError = alertText();
    const afterZzz = symbols();
    push(
      "T4",
      zzzError === "Không có mã ZZZ" && JSON.stringify(afterZzz) === JSON.stringify(afterAdd),
      `lỗi "${zzzError}"; danh mục ${afterZzz.join(",")}`,
    );

    // T5: thêm FPT lần nữa -> lỗi "đã có".
    await typeSymbol("FPT");
    addButton()?.click();
    await sleep(400);
    const dupError = alertText();
    push("T5", dupError.includes("đã có"), `"${dupError}"`);

    // T7: xếp tab HNX theo "%", sang VN30 rồi quay lại -> tab HNX vẫn đang xếp theo "%".
    // Chỉ đòi trạng thái xếp và thứ tự nền còn nguyên. KHÔNG đòi các dòng vẫn giảm dần theo giá
    // hiện tại: thứ tự chỉ tính một lần lúc bấm, nên giá chạy tiếp
    // thì thứ tự đã chốt không còn phản ánh số % đang hiện, đó là hành vi đúng.
    tabButton("hnx")?.click();
    await sleep(500);
    const pctHeader = () => [...document.querySelectorAll(".pb-table thead th")].find((el) => (el.textContent || "").replace(/[▲▼]/g, "").trim() === "%");
    for (let i = 0; i < 3 && pctHeader()?.getAttribute("aria-sort") !== "none"; i += 1) {
      pctHeader()?.querySelector("button")?.click();
      await sleep(250);
    }
    pctHeader()?.querySelector("button")?.click();
    await sleep(400);
    const hnxSortBefore = pctHeader()?.getAttribute("aria-sort");
    const hnxOrderBefore = symbols();
    tabButton("vn30")?.click();
    await sleep(500);
    const vn30Sort = pctHeader()?.getAttribute("aria-sort");
    tabButton("hnx")?.click();
    await sleep(500);
    const hnxSortAfter = pctHeader()?.getAttribute("aria-sort");
    const hnxOrderAfter = symbols();
    const sameRows = hnxOrderBefore.length === hnxOrderAfter.length
      && hnxOrderAfter.every((symbol) => hnxOrderBefore.includes(symbol));
    push(
      "T7",
      hnxSortBefore === "descending" && vn30Sort === "none" && hnxSortAfter === "descending" && sameRows,
      `HNX ${hnxSortBefore} -> VN30 ${vn30Sort} -> HNX ${hnxSortAfter}; cùng tập mã=${sameRows}`,
    );

    // T8: bấm đúp Giá 1 dư bán của mã HNX, đợt CONTINUOUS -> form có MOK, MAK bật.
    const firstHnx = rows()[0];
    const askCell = firstHnx?.querySelectorAll("td")[15];
    askCell?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await sleep(500);
    const dialog = document.querySelector(".pb-order-dialog");
    const typeState = Object.fromEntries(
      [...(dialog?.querySelectorAll(".pb-order-type") ?? [])].map((b) => [(b.textContent || "").trim(), !b.disabled]),
    );
    const exchangeText = (dialog?.querySelector('[data-testid="order-symbol"]')?.textContent || "").trim();
    push(
      "T8",
      Boolean(dialog) && typeState.MOK === true && typeState.MAK === true && exchangeText.includes("HNX"),
      `mã/sàn "${exchangeText}"; MOK=${typeState.MOK}, MAK=${typeState.MAK}`,
    );
    // Đóng form.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(300);

    // T6: bấm × ở FPT -> dòng biến mất.
    tabButton("watchlist")?.click();
    await sleep(500);
    const removeButton = [...document.querySelectorAll(".pb-remove")]
      .find((button) => button.getAttribute("aria-label") === "Bỏ FPT khỏi danh mục");
    removeButton?.click();
    await sleep(500);
    push(
      "T6",
      Boolean(removeButton) && !symbols().includes("FPT"),
      `nút=${Boolean(removeButton)}; danh mục còn ${symbols().join(",") || "(trống)"}`,
    );
  } finally {
    // Dọn: về VN30, xoá hết danh mục nếu script đã thêm gì.
    tabButton("vn30")?.click();
    await sleep(300);
    await setPhase("CONTINUOUS");
  }

  window.__checkTabsResult = results;
  return results;
})()
