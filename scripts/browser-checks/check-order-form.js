// Kiểm tra form đặt lệnh nháp, chạy trong trang với nguồn mock (mặc định).
// Trả về danh sách { id, pass, detail } (F1 đến F11). Chạy xong thì đóng form và trả đợt về CONTINUOUS.
// Không gửi lệnh: chỉ bấm nút "Kiểm tra lệnh" và đọc giao diện.
(async () => {
  const results = [];
  const push = (id, pass, detail) => results.push({ id, pass: Boolean(pass), detail });
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const dialog = () => document.querySelector(".pb-order-dialog");
  const q = (sel) => dialog()?.querySelector(sel) ?? null;
  const qa = (sel) => [...(dialog()?.querySelectorAll(sel) ?? [])];
  const rows = () => [...document.querySelectorAll(".pb-table tbody tr")];

  const setPhase = async (phase) => {
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase }),
    });
    await sleep(400);
    return res.status;
  };

  const closeForm = async () => {
    if (dialog()) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await sleep(250);
    }
  };

  // Ô giá theo data-testid của cột: tìm ô td thứ n trong dòng đầu.
  const openFromCell = async (symbol, cellIndex) => {
    await closeForm();
    const row = rows().find((tr) => tr.getAttribute("data-symbol") === symbol);
    if (!row) return null;
    const cell = row.querySelectorAll("td")[cellIndex];
    if (!cell) return null;
    cell.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await sleep(300);
    return cell;
  };

  const priceValue = () => (q("#pb-order-price")?.value ?? "").trim();
  const setInput = async (selector, value) => {
    const input = q(selector);
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(150);
  };
  const check = async () => {
    q('[data-testid="order-check"]')?.click();
    await sleep(250);
  };
  const errors = () => qa('[role="alert"]').map((el) => (el.textContent || "").trim());

  try {
    await setPhase("CONTINUOUS");
    const first = rows()[0]?.getAttribute("data-symbol");
    const second = rows()[1]?.getAttribute("data-symbol");

    // F1: bấm đúp Giá 1 dư bán mở form Mua đúng giá ô đó (cột 15).
    const askCell = await openFromCell(first, 15);
    const expectAsk = (askCell?.textContent || "").trim();
    const buyOn = q(".pb-order-side.is-buy")?.getAttribute("aria-pressed") === "true";
    push(
      "F1",
      Boolean(dialog()) && buyOn && priceValue() === expectAsk,
      `mở=${Boolean(dialog())}, Mua=${buyOn}, giá nhập "${priceValue()}", giá ô "${expectAsk}"`,
    );

    // F2: giá cao hơn trần một bước thì báo lỗi ở ô giá, có chữ "trần".
    const limitTexts = qa(".pb-order-limits span").map((el) => (el.textContent || "").trim());
    const ceilText = (limitTexts.find((t) => t.startsWith("Trần")) || "").replace(/[^\d.]/g, "");
    const ceilValue = Number(ceilText);
    const above = (Math.floor(ceilValue * 1000) + 1000) / 1000;
    await setInput("#pb-order-price", above.toFixed(2));
    await check();
    const priceErr = errors().find((text) => text.includes("trần")) || "";
    push("F2", Boolean(priceErr), `giá nhập ${above.toFixed(2)}, trần ${ceilText}; lỗi: "${priceErr}"`);

    // F3: mã giá 10.000–50.000 trên HOSE, nhập giá lẻ 10 đồng -> báo sai bước giá 50.
    await closeForm();
    // Tìm một mã HOSE có TC trong khoảng 10.000..50.000 từ dòng đầu tiên phù hợp.
    let stepSymbol = null;
    for (const tr of rows()) {
      const refText = (tr.querySelector('[data-cell="symbol"]')
        ? [...tr.querySelectorAll("td")].map((td) => (td.textContent || "").trim())
        : [])[4] || "";
      const refValue = Number(refText.replace(/,/g, ""));
      if (refValue >= 10 && refValue < 50) { stepSymbol = tr.getAttribute("data-symbol"); break; }
    }
    if (stepSymbol) {
      const row = rows().find((tr) => tr.getAttribute("data-symbol") === stepSymbol);
      const ask = row.querySelectorAll("td")[15];
      ask.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      await sleep(300);
      // Giá trên 10.000 đồng: bước 50 đồng. Lẻ 10 đồng bằng cách cộng 0.01 vào giá hiện tại.
      const base = Number(priceValue());
      await setInput("#pb-order-price", (base + 0.01).toFixed(2));
      await check();
      const stepErr = errors().find((text) => text.includes("bước giá")) || "";
      push("F3", Boolean(stepErr) && stepErr.includes("50"), `${stepSymbol}: lỗi "${stepErr}"`);
    } else {
      push("F3", false, "không tìm được mã HOSE có TC trong 10.000..50.000");
    }

    // F4: khối lượng 150 -> lỗi bội số 100.
    await setInput("#pb-order-quantity", "150");
    await check();
    const lotErr = errors().find((text) => text.includes("bội số của 100")) || "";
    push("F4", Boolean(lotErr), `KL 150: "${lotErr}"`);

    // F5: KL 50 với LO hợp lệ; đổi sang MTL thì báo lô lẻ.
    await closeForm();
    const f5Cell = await openFromCell(first, 15);
    const f5Price = (f5Cell?.textContent || "").trim();
    await setInput("#pb-order-quantity", "50");
    await setInput("#pb-order-price", f5Price);
    await check();
    const loErrors = errors();
    const loOk = loErrors.length === 0 && Boolean(q('[data-testid="order-valid"]'));
    const mtlButton = qa(".pb-order-type").find((b) => (b.textContent || "").trim() === "MTL");
    let mtlErr = "";
    if (mtlButton && !mtlButton.disabled) {
      mtlButton.click();
      await sleep(250);
      mtlErr = errors().find((text) => text.includes("Lô lẻ")) || "";
    }
    // Trả về LO để các ca sau dùng giá.
    qa(".pb-order-type").find((b) => (b.textContent || "").trim() === "LO")?.click();
    await sleep(200);
    push("F5", loOk && Boolean(mtlErr), `giá ${f5Price}, KL 50; LO hợp lệ=${loOk}, lỗi LO=${JSON.stringify(loErrors)}; MTL lỗi: "${mtlErr}"`);

    // F6: đợt ATO -> chỉ LO, ATO bật; MTL, ATC tắt.
    await closeForm();
    await setPhase("ATO");
    await openFromCell(first, 15);
    const typeState = Object.fromEntries(
      qa(".pb-order-type").map((b) => [(b.textContent || "").trim(), !b.disabled]),
    );
    push(
      "F6",
      typeState.LO && typeState.ATO && !typeState.MTL && !typeState.ATC,
      `LO=${typeState.LO}, ATO=${typeState.ATO}, MTL=${typeState.MTL}, ATC=${typeState.ATC}`,
    );

    // F7: đợt CLOSED -> lỗi chung có chữ "đóng cửa".
    await closeForm();
    await setPhase("CLOSED");
    await openFromCell(first, 15);
    await check();
    const closedErr = errors().find((text) => text.includes("đóng cửa")) || "";
    push("F7", Boolean(closedErr), `"${closedErr}"`);

    // F8: lệnh hợp lệ hiện "Lệnh hợp lệ", không có request tới /api/orders.
    await closeForm();
    await setPhase("CONTINUOUS");
    let orderRequests = 0;
    const nativeFetch = window.fetch;
    window.fetch = function (...args) {
      const url = String(args[0] ?? "");
      if (url.includes("/api/orders")) orderRequests += 1;
      return nativeFetch.apply(this, args);
    };
    await openFromCell(first, 15);
    await setInput("#pb-order-quantity", "100");
    await check();
    const validOk = Boolean(q('[data-testid="order-valid"]'));
    const currentErrors = errors();
    window.fetch = nativeFetch;
    push("F8", validOk && orderRequests === 0 && currentErrors.length === 0,
      `hợp lệ=${validOk}, lỗi=${currentErrors.length}, request /api/orders=${orderRequests}`);

    // F9: Esc đóng form và trả con trỏ về ô đã bấm đúp.
    await closeForm();
    const opener = await openFromCell(second, 15);
    opener?.focus();
    const before = document.activeElement === opener;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(300);
    const closed = !dialog();
    const returned = document.activeElement === opener;
    push("F9", closed && (returned || !before), `đóng=${closed}, con trỏ về ô bấm=${returned}`);

    // F10: Esc khi đang mở form chỉ đóng form, dòng đang chọn vẫn còn chọn.
    document.querySelector(`tr[data-symbol="${second}"] td:nth-child(5)`)?.click();
    await sleep(100);
    const selectedSymbol = document.querySelector("tr.is-selected")?.dataset.symbol ?? null;
    await openFromCell(second, 15);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(300);
    const stillSelected = document.querySelector("tr.is-selected")?.dataset.symbol ?? null;
    push("F10", selectedSymbol !== null && stillSelected === selectedSymbol,
      `trước=${selectedSymbol}, sau Esc=${stillSelected}`);
    if (stillSelected) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await sleep(100);
    }

    // F11: giá lệch bước thì ▲ lên mức hợp lệ gần nhất; đổi sang MTL rồi về LO vẫn giữ giá.
    await openFromCell(first, 15);
    const priceInput = q("#pb-order-price");
    const startPrice = Number(priceInput.value);
    const offTick = (Math.floor(startPrice * 1000 / 50) * 50 + 20) / 1000; // lệch 20 đồng so với bước 50
    await setInput("#pb-order-price", offTick.toFixed(2));
    q('[aria-label="Tăng một bước giá"]').click();
    await sleep(100);
    const stepped = q("#pb-order-price").value;
    const expected = ((Math.ceil(offTick * 1000 / 50) * 50) / 1000).toFixed(2);
    qa(".pb-order-type").find((b) => b.textContent === "MTL")?.click();
    await sleep(50);
    qa(".pb-order-type").find((b) => b.textContent === "LO")?.click();
    await sleep(50);
    const kept = q("#pb-order-price").value;
    push("F11", stepped === expected && kept === stepped,
      `${offTick.toFixed(2)} ▲ ra ${stepped} (mong ${expected}); về LO còn ${kept}`);
  } finally {
    await closeForm();
    await setPhase("CONTINUOUS");
  }

  window.__checkOrderFormResult = results;
  return results;
})()
