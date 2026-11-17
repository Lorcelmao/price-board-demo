import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SESSION_LABEL } from "../../shared/protocol";
import {
  LOT_SIZE,
  allowedOrderTypes,
  isOnTick,
  priceAbove,
  priceBelow,
  tickSize,
  type OrderType,
  type Side,
} from "../../shared/market-rules";
import {
  hasErrors,
  holdPrice,
  orderCost,
  validateOrder,
  type OrderDraft,
  type OrderErrors,
} from "../../shared/order-validation";
import { parsePriceInput, parseQuantityInput } from "../lib/order-form-input";
import { formatPrice } from "../net/format";
import { formatVolumeBoard } from "../lib/format-board";
import { applyOrderResponse, useAccountState } from "../lib/account-store";
import { contextFor, type DraftSeed } from "../lib/order-draft";
import { placeOrder } from "../lib/order-api";
import { useQuote } from "../lib/quote-store";
import { useSessionPhase } from "../lib/session-phase";
import type { SourceKey } from "../lib/board-prefs";

// Hộp thoại đặt lệnh.
// Với nguồn ysflex: chỉ "Kiểm tra lệnh", không có nút "Đặt lệnh", không gọi mạng.
// Với nguồn mock: có thêm nút "Đặt lệnh" gửi tới mock server chạy trên máy.

const ORDER_TYPES: OrderType[] = ["LO", "ATO", "ATC", "MTL", "MOK", "MAK"];

// Lý do một loại lệnh bị tắt trong đợt hiện tại, để hiện trong title.
const WHY_DISABLED: Partial<Record<OrderType, string>> = {
  ATO: "ATO chỉ dùng trong đợt mở cửa",
  ATC: "ATC chỉ dùng trong đợt đóng cửa",
  MTL: "MTL chỉ dùng trong đợt khớp liên tục",
  MOK: "MOK chỉ dùng trên HNX trong đợt khớp liên tục",
  MAK: "MAK chỉ dùng trên HNX trong đợt khớp liên tục",
  LO: "LO dùng được mọi đợt trừ khi thị trường đóng cửa",
};

const money = (value: number): string => Math.round(value).toLocaleString("en-US");

export interface OrderDialogProps {
  symbol: string;
  seed: DraftSeed;
  source: SourceKey;
  onClose: () => void;
  // Gọi sau khi gửi thành công để app hiện thông báo ngắn.
  onPlaced?: (summary: string) => void;
  // Nguồn mock: đã đăng nhập mới gửi được lệnh; chưa thì có nút mời đăng nhập.
  loggedIn?: boolean;
  onRequestLogin?: () => void;
}

export function OrderDialog({ symbol, seed, source, onClose, onPlaced, loggedIn = false, onRequestLogin }: OrderDialogProps) {
  const quote = useQuote(symbol);
  const phase = useSessionPhase();
  const account = useAccountState();
  const { ceil, floor, ref: refPrice, exchange } = quote;
  // Chỉ nguồn mock mới được gửi lệnh, và phải đã đăng nhập.
  const canPlace = source === "mock" && loggedIn;

  const [side, setSide] = useState<Side>(seed.side);
  const [type, setType] = useState<OrderType>(seed.type);
  const [priceText, setPriceText] = useState(seed.price === null ? "" : (seed.price / 1000).toFixed(2));
  const [quantityText, setQuantityText] = useState(String(seed.quantity));
  // Trước lần bấm "Kiểm tra lệnh" đầu tiên thì không hiện lỗi, để form không đỏ ngay khi mở.
  const [checked, setChecked] = useState(false);
  // Bước xác nhận: chỉ hiện sau khi bấm "Đặt lệnh".
  const [confirming, setConfirming] = useState(false);
  // Lỗi của server (422/409) và lỗi mạng, hiện cạnh lỗi phía giao diện.
  const [serverErrors, setServerErrors] = useState<OrderErrors>({});
  const [networkError, setNetworkError] = useState<string | null>(null);
  // Cờ chống gửi hai lần: kiểm ngay đầu hàm gửi, không chỉ dựa vào việc tắt nút.
  const sendingRef = useRef(false);
  const [sending, setSending] = useState(false);

  const checkButton = useRef<HTMLButtonElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Esc đóng form, như bấm "Đóng".
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    checkButton.current?.focus();
  }, []);

  const price = parsePriceInput(priceText);
  const quantity = parseQuantityInput(quantityText);
  const priceForDraft = type === "LO" ? (Number.isNaN(price as number) ? null : price) : null;

  const draft: OrderDraft = { symbol, side, type, price: priceForDraft, quantity };
  const ctx = useMemo(
    () => contextFor(quote, phase, { account: account.account, positions: account.positions }),
    [quote, phase, account.account, account.positions],
  );

  // Kiểm tra chạy lại mỗi khi đổi một ô, nhưng chỉ sau lần bấm đầu tiên.
  // Lỗi của server được trộn vào để hiện dưới đúng ô, như lỗi phía giao diện.
  const clientErrors: OrderErrors = useMemo(
    () => (checked ? validateOrder(draft, ctx) : {}),
    // draft là object mới mỗi lần render; các trường bên dưới mới là thứ cần so.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [checked, symbol, side, type, priceForDraft, quantity, ctx],
  );
  const errors: OrderErrors = { ...serverErrors, ...clientErrors };
  const valid = checked && !hasErrors(errors);

  const allowed = allowedOrderTypes(exchange, phase);

  // Giá đem tính tiền: LO dùng giá nhập, loại khác giữ tiền theo giá trần cho an toàn.
  const hold = holdPrice({ side, type, price: priceForDraft }, ceil);
  // Phí lấy từ tài khoản khi có (mock), không thì mức mặc định của contextFor.
  const estCost = orderCost(hold, Number.isFinite(quantity) ? quantity : 0, ctx.feeRate);
  const usesCeil = type !== "LO";

  const stepPrice = useCallback((direction: 1 | -1) => {
    const current = parsePriceInput(priceText);
    // Ô trống hoặc nhập sai thì đi từ giá khớp; chưa có giá khớp (null hoặc 0) thì từ TC.
    const base = current === null || Number.isNaN(current as number) ? quote.last || quote.ref : (current as number);
    // Giá đang lệch bước (ví dụ 24.37) thì ▲ đưa lên mức hợp lệ gần nhất phía trên, ▼ xuống mức phía dưới,
    // chứ không cộng trừ một bước giá rồi vẫn lệch (24.42).
    const tick = tickSize(base, exchange);
    const next = isOnTick(base, exchange)
      ? (direction === 1 ? priceAbove(base, exchange) : priceBelow(base, exchange))
      : (direction === 1 ? Math.ceil(base / tick) * tick : Math.floor(base / tick) * tick);
    // Không vượt trần, không xuống dưới sàn.
    const bounded = Math.min(ceil || next, Math.max(floor || next, next));
    setPriceText((bounded / 1000).toFixed(2));
  }, [priceText, quote.last, quote.ref, exchange, ceil, floor]);

  const stepQuantity = useCallback((direction: 1 | -1) => {
    const current = parseQuantityInput(quantityText);
    const base = Number.isFinite(current) ? current : 0;
    setQuantityText(String(Math.max(0, base + direction * LOT_SIZE)));
  }, [quantityText]);

  // Đổi bất kỳ ô nào sau khi đã kiểm thì bỏ bước xác nhận và lỗi cũ của server,
  // để không gửi đi một lệnh khác với lệnh đã kiểm.
  const resetResult = useCallback(() => {
    setConfirming(false);
    setServerErrors({});
    setNetworkError(null);
  }, []);

  const sideLabel = side === "BUY" ? "Mua" : "Bán";
  const typeLabel = type === "LO" ? "LO" : type;
  const summary = `${sideLabel} ${money(Number.isFinite(quantity) ? quantity : 0)} ${symbol} giá ${
    type === "LO" ? formatPrice(priceForDraft) : `(${type})`
  }, ${typeLabel}, giá trị khoảng ${money(estCost)} đồng`;

  // Gửi lệnh. Cờ trong ref được kiểm ngay đầu hàm nên bấm đúp hay Enter liền nhau
  // vẫn chỉ tạo một lệnh, kể cả khi nút chưa kịp bị tắt.
  const submit = useCallback(async () => {
    if (sendingRef.current) return;
    // Sức mua hay đợt có thể đổi khi đang ở bước xác nhận: lệnh hết hợp lệ thì không gửi.
    if (!canPlace || !valid) return;
    sendingRef.current = true;
    setSending(true);
    setNetworkError(null);
    try {
      const result = await placeOrder(source, draft);
      if (result.kind === "ok") {
        applyOrderResponse(result.order);
        onPlaced?.(`Đã gửi lệnh ${sideLabel} ${money(draft.quantity)} ${symbol}`);
        onClose();
        return;
      }
      if (result.kind === "rejected") {
        setServerErrors(result.errors);
        setConfirming(false);
        return;
      }
      if (result.kind === "conflict") {
        setServerErrors({ form: result.message });
        setConfirming(false);
        return;
      }
      // "network" và "forbidden": không đóng form, hiện câu lỗi, không tự gửi lại.
      setNetworkError(result.kind === "forbidden"
        ? "Chỉ nguồn mock mới gửi được lệnh."
        : result.message);
      setConfirming(false);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
    // draft đổi mỗi lần render; các trường dưới đây mới là thứ cần chốt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPlace, valid, source, symbol, side, type, priceForDraft, quantity, sideLabel, onPlaced, onClose]);

  // Enter ở bước xác nhận cũng gửi, và cũng bị cờ chặn nếu đang gửi.
  useEffect(() => {
    if (!confirming) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirming, submit]);

  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  return (
    <div
      className="pb-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="pb-dialog pb-order-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pb-order-title"
      >
        <h2 id="pb-order-title" className="pb-dialog-title">Đặt lệnh nháp</h2>

        <div className="pb-dialog-body">
          <p className="pb-order-notice px-ref" data-testid="order-notice">
            {canPlace
              ? "Lệnh gửi tới mock server trên máy, tài khoản thử DEMO000001."
              : source === "mock"
              ? "Chưa đăng nhập: chỉ kiểm tra được lệnh. Đăng nhập để gửi lệnh tới mock server."
              : "Bản luyện tập: lệnh không được gửi đi. Chưa kiểm sức mua, cổ phiếu khả dụng và room vì chưa đăng nhập."}
          </p>

          <div className="pb-order-head">
            <span className="pb-order-symbol" data-testid="order-symbol">{symbol} · {exchange}</span>
            <span className="pb-order-phase" data-testid="order-phase">{SESSION_LABEL[phase]}</span>
          </div>

          {/* Với mock: hiện sức mua (Mua) hoặc số cổ phiếu khả dụng của mã (Bán). */}
          {canPlace && account.account && (
            <p className="pb-order-account" data-testid="order-account">
              {side === "BUY"
                ? `Sức mua: ${money(account.account.buyingPower)} đồng`
                : `Khả dụng: ${money(
                  account.positions.find((item) => item.symbol === symbol)?.availableQty ?? 0,
                )} ${symbol}`}
            </p>
          )}

          <div className="pb-order-limits">
            <span className="px-ceil">Trần {formatPrice(ceil)}</span>
            <span className="px-floor">Sàn {formatPrice(floor)}</span>
            <span className="px-ref">TC {formatPrice(refPrice)}</span>
          </div>

          <div className="pb-order-row">
            <span className="pb-order-label">Chiều</span>
            <div className="pb-order-sides" role="group" aria-label="Chiều lệnh">
              <button
                type="button"
                className={`pb-order-side is-buy${side === "BUY" ? " is-on" : ""}`}
                aria-pressed={side === "BUY"}
                onClick={() => { resetResult(); setSide("BUY"); }}
              >
                Mua
              </button>
              <button
                type="button"
                className={`pb-order-side is-sell${side === "SELL" ? " is-on" : ""}`}
                aria-pressed={side === "SELL"}
                onClick={() => { resetResult(); setSide("SELL"); }}
              >
                Bán
              </button>
            </div>
          </div>

          <div className="pb-order-row">
            <label className="pb-order-label" htmlFor="pb-order-type">Loại lệnh</label>
            <div className="pb-order-types" id="pb-order-type">
              {ORDER_TYPES.map((option) => {
                const enabled = allowed.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    className={`pb-order-type${type === option ? " is-on" : ""}`}
                    aria-pressed={type === option}
                    disabled={!enabled}
                    title={enabled ? option : `${WHY_DISABLED[option] ?? "Không dùng được trong đợt này"}.`}
                    // Giữ giá đã nhập: ô giá bị tắt khi không phải LO, quay lại LO thì giá cũ vẫn còn.
                    onClick={() => { resetResult(); setType(option); }}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
          {errors.type && <p className="pb-order-error" role="alert">{errors.type}</p>}

          <div className="pb-order-row">
            <label className="pb-order-label" htmlFor="pb-order-price">Giá</label>
            <div className="pb-order-input-group">
              <button
                type="button"
                className="pb-order-step"
                aria-label="Giảm một bước giá"
                disabled={type !== "LO"}
                onClick={() => stepPrice(-1)}
              >
                ▼
              </button>
              <input
                id="pb-order-price"
                className="pb-order-input"
                type="text"
                inputMode="decimal"
                value={type === "LO" ? priceText : type}
                disabled={type !== "LO"}
                aria-invalid={Boolean(errors.price)}
                onChange={(event) => { resetResult(); setPriceText(event.target.value); }}
              />
              <button
                type="button"
                className="pb-order-step"
                aria-label="Tăng một bước giá"
                disabled={type !== "LO"}
                onClick={() => stepPrice(1)}
              >
                ▲
              </button>
            </div>
          </div>
          {errors.price && <p className="pb-order-error" role="alert">{errors.price}</p>}

          <div className="pb-order-row">
            <label className="pb-order-label" htmlFor="pb-order-quantity">Khối lượng</label>
            <div className="pb-order-input-group">
              <button
                type="button"
                className="pb-order-step"
                aria-label="Giảm 100 cổ phiếu"
                onClick={() => stepQuantity(-1)}
              >
                ▼
              </button>
              <input
                id="pb-order-quantity"
                className="pb-order-input"
                type="text"
                inputMode="numeric"
                value={quantityText}
                aria-invalid={Boolean(errors.quantity)}
                onChange={(event) => { resetResult(); setQuantityText(event.target.value); }}
              />
              <button
                type="button"
                className="pb-order-step"
                aria-label="Tăng 100 cổ phiếu"
                onClick={() => stepQuantity(1)}
              >
                ▲
              </button>
            </div>
          </div>
          <p className="pb-order-hint">
            {formatVolumeBoard(Number.isFinite(quantity) ? quantity : 0) || "0"} lô · {money(Number.isFinite(quantity) ? quantity : 0)} cổ phiếu
          </p>
          {errors.quantity && <p className="pb-order-error" role="alert">{errors.quantity}</p>}

          <div className="pb-order-cost">
            <span>Giá trị ước tính</span>
            <b data-testid="order-cost">{money(estCost)} đồng</b>
            {usesCeil && <small>tính theo giá trần</small>}
          </div>

          {checked && hasErrors(errors) === false && (
            <p className="pb-order-ok px-up" data-testid="order-valid">Lệnh hợp lệ</p>
          )}
          {errors.form && <p className="pb-order-error" role="alert">{errors.form}</p>}
          {networkError && (
            <p className="pb-order-error" role="alert" data-testid="order-network-error">{networkError}</p>
          )}

          {/* Bước xác nhận: chỉ với nguồn mock và khi lệnh đã hợp lệ. */}
          {confirming && valid && (
            <div className="pb-order-confirm" data-testid="order-confirm">
              <p className="pb-order-confirm-text">{summary}</p>
              <div className="pb-order-confirm-actions">
                <button
                  type="button"
                  className="pb-dialog-btn"
                  data-testid="order-back"
                  disabled={sending}
                  onClick={() => setConfirming(false)}
                >
                  Quay lại
                </button>
                <button
                  ref={confirmButton}
                  type="button"
                  className="pb-dialog-btn is-primary"
                  data-testid="order-confirm-send"
                  disabled={sending}
                  onClick={() => void submit()}
                >
                  {sending ? "Đang gửi..." : "Xác nhận"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="pb-dialog-actions">
          <span className="pb-dialog-spacer" />
          <button type="button" className="pb-dialog-btn" onClick={onClose}>Đóng</button>
          <button
            ref={checkButton}
            type="button"
            className="pb-dialog-btn is-primary"
            data-testid="order-check"
            onClick={() => {
              setChecked(true);
              setServerErrors({});
              setNetworkError(null);
            }}
          >
            Kiểm tra lệnh
          </button>
          {/* Nút "Đặt lệnh" chỉ có với nguồn mock. */}
          {canPlace && valid && !confirming && (
            <button
              type="button"
              className="pb-dialog-btn is-place"
              data-testid="order-place"
              onClick={() => setConfirming(true)}
            >
              Đặt lệnh
            </button>
          )}
          {source === "mock" && !loggedIn && (
            <button
              type="button"
              className="pb-dialog-btn is-place"
              data-testid="order-login"
              onClick={onRequestLogin}
            >
              Đăng nhập để đặt lệnh
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
