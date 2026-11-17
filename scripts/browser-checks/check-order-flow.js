// Đọc kết quả cho các ca O1 đến O9 của luồng đặt lệnh. CHỈ ĐỌC, không bấm gì thay người dùng:
// các ca được thao tác bằng chuột và phím thật qua CDP (Input.dispatchMouseEvent/KeyEvent).
// Dùng: nạp script rồi gọi window.__orderFlow.read() / .orders() / .account().
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
  const dialogOpen = () => Boolean(document.querySelector(".pb-order-dialog"));
  const buttonTestIds = () =>
    [...document.querySelectorAll(".pb-order-dialog [data-testid]")].map((el) => el.getAttribute("data-testid"));

  async function orders() {
    const response = await fetch("/api/orders", { headers: authHeaders() });
    return response.ok ? response.json() : null;
  }

  async function account() {
    const response = await fetch("/api/account", { headers: authHeaders() });
    return response.ok ? response.json() : null;
  }

  async function portfolio() {
    const response = await fetch("/api/portfolio", { headers: authHeaders() });
    return response.ok ? response.json() : null;
  }

  async function fills() {
    const response = await fetch("/api/fills", { headers: authHeaders() });
    return response.ok ? response.json() : null;
  }

  window.__orderFlow = {
    orders,
    account,
    portfolio,
    fills,
    // Trạng thái giao diện hiện tại, đọc từ DOM.
    read() {
      return {
        dialogOpen: dialogOpen(),
        title: text("#pb-order-title"),
        symbol: text('[data-testid="order-symbol"]'),
        notice: text('[data-testid="order-notice"]'),
        accountLine: text('[data-testid="order-account"]'),
        valid: Boolean(document.querySelector('[data-testid="order-valid"]')),
        hasPlaceButton: Boolean(document.querySelector('[data-testid="order-place"]')),
        confirming: Boolean(document.querySelector('[data-testid="order-confirm"]')),
        confirmText: text('[data-testid="order-confirm"] .pb-order-confirm-text'),
        networkError: text('[data-testid="order-network-error"]'),
        alerts: [...document.querySelectorAll('.pb-order-dialog [role="alert"]')]
          .map((el) => (el.textContent || "").trim()),
        toast: text('[data-testid="app-toast"]'),
        price: document.querySelector("#pb-order-price")?.value ?? null,
        quantity: document.querySelector("#pb-order-quantity")?.value ?? null,
        side: document.querySelector('.pb-order-side.is-on')?.textContent?.trim() ?? null,
        activeType: document.querySelector(".pb-order-type.is-on")?.textContent?.trim() ?? null,
        buttons: buttonTestIds(),
      };
    },
    // Tóm tắt nhanh để so trước/sau một thao tác.
    async snapshot() {
      const [orderList, accountDto] = await Promise.all([orders(), account()]);
      return {
        orderCount: Array.isArray(orderList) ? orderList.length : null,
        orders: Array.isArray(orderList)
          ? orderList.map((order) => ({
            id: order.id, symbol: order.symbol, side: order.side, type: order.type,
            quantity: order.quantity, status: order.status,
          }))
          : null,
        buyingPower: accountDto?.buyingPower ?? null,
        cash: accountDto?.cash ?? null,
        holdFunds: accountDto?.holdFunds ?? null,
        ui: window.__orderFlow.read(),
      };
    },
  };
  return "ok";
})()
