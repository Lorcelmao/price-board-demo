// Đọc trạng thái sổ lệnh để đối chiếu. CHỈ ĐỌC, không bấm gì.
// Nạp vào trang rồi gọi window.__book.read() / .orders() / .fills() / .account().
(() => {
  // Từ khi có đăng nhập: gửi kèm token của phiên đang mở trong tab (sessionStorage).
  const authHeaders = () => {
    try {
      const token = JSON.parse(sessionStorage.getItem("price-board-demo:phien:v1") || "null")?.token;
      return token ? { Authorization: `Bearer ${token}` } : {};
    } catch {
      return {};
    }
  };
  const text = (selector) => {
    const el = document.querySelector(selector);
    return el ? (el.textContent || "").trim() : null;
  };

  const rows = () => [...document.querySelectorAll(".pb-book-row")].map((tr) => {
    const cells = [...tr.querySelectorAll("td")].map((td) => (td.textContent || "").trim());
    return {
      id: tr.getAttribute("data-order-id"),
      status: tr.getAttribute("data-status"),
      symbol: cells[1],
      side: cells[2],
      type: cells[3],
      price: cells[4],
      quantity: cells[5],
      filled: cells[6],
      avg: cells[7],
      statusLabel: cells[8],
      buttons: [...tr.querySelectorAll(".pb-book-btn")].map((b) => ({
        label: (b.textContent || "").trim(),
        disabled: b.disabled,
        title: b.getAttribute("title"),
      })),
      error: (tr.querySelector(".pb-book-error")?.textContent || "").trim() || null,
      note: (tr.querySelector(".pb-book-actions")?.textContent || "").trim(),
    };
  });

  const read = () => ({
    bookOpen: Boolean(document.querySelector('[data-testid="order-book"]')),
    toggle: text('[data-testid="book-toggle"]'),
    toggleExpanded: document.querySelector('[data-testid="book-toggle"]')?.getAttribute("aria-expanded") ?? null,
    activeTab: document.querySelector(".pb-book-tab.is-active")?.textContent?.trim() ?? null,
    balance: text('[data-testid="book-balance"]'),
    rows: rows(),
    empty: Boolean(document.querySelector(".pb-book-empty-row")),
    confirms: [...document.querySelectorAll(".pb-book-confirm")].map((el) => (el.textContent || "").trim()),
    modifyOpen: Boolean(document.querySelector(".pb-modify-dialog")),
    modifyError: text('[data-testid="modify-error"]'),
    modifyPrice: document.querySelector('[data-testid="modify-price"]')?.value ?? null,
    modifyQuantity: document.querySelector('[data-testid="modify-quantity"]')?.value ?? null,
    details: [...document.querySelectorAll(".pb-book-detail .pb-book-fills li")].map((li) => (li.textContent || "").trim()),
    detailEmpty: Boolean(document.querySelector(".pb-book-empty-detail")),
    boardRows: document.querySelectorAll(".pb-table tbody tr.pb-row-data").length,
    bookHeight: document.querySelector(".pb-book")?.getBoundingClientRect().height ?? null,
    boardHeight: document.querySelector(".pb-board-wrap")?.getBoundingClientRect().height ?? null,
  });

  window.__book = {
    read,
    async orders() {
      const res = await fetch("/api/orders", { headers: authHeaders() });
      return res.ok ? res.json() : null;
    },
    async fills() {
      const res = await fetch("/api/fills", { headers: authHeaders() });
      return res.ok ? res.json() : null;
    },
    async account() {
      const res = await fetch("/api/account", { headers: authHeaders() });
      return res.ok ? res.json() : null;
    },
    async session() {
      const res = await fetch("/api/session");
      return res.ok ? res.json() : null;
    },
  };
  return "ok";
})()
