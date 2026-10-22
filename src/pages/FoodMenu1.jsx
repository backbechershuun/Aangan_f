import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.jsx";

// Guests can pay this percentage now, or pay the full order now.
// Nothing in between, and never less than this.
const MIN_DEPOSIT_PERCENT = 40;

// Used for the Razorpay checkout window
const BRAND_HEX = "#EF4444";

const foodTypeBorder = {
  veg: "border-green-600",
  "non-veg": "border-red-600",
  egg: "border-amber-500",
};
const foodTypeFill = {
  veg: "bg-green-600",
  "non-veg": "bg-red-600",
  egg: "bg-amber-500",
};

const TYPE_FILTERS = [
  { value: "all", label: "All" },
  { value: "veg", label: "Veg", dot: "bg-green-600" },
  { value: "non-veg", label: "Non-veg", dot: "bg-red-600" },
  { value: "egg", label: "Egg", dot: "bg-amber-500" },
];

/* ------------------------------------------------------------------ */
/*  Small utilities                                                    */
/* ------------------------------------------------------------------ */

const STYLES = `
@keyframes fm-rise  { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
@keyframes fm-pop   { 0% { transform: scale(.6) } 60% { transform: scale(1.18) } 100% { transform: scale(1) } }
@keyframes fm-slide { from { transform: translateY(100%) } to { transform: none } }
.fm-rise  { opacity: 0; animation: fm-rise .5s cubic-bezier(.2,.7,.2,1) forwards; }
.fm-pop   { animation: fm-pop .28s ease-out; }
.fm-slide { animation: fm-slide .35s cubic-bezier(.2,.8,.2,1) both; }
.fm-hide-scroll { scrollbar-width: none; }
.fm-hide-scroll::-webkit-scrollbar { display: none; }
@media (prefers-reduced-motion: reduce) {
  .fm-rise { animation: none; opacity: 1; }
  .fm-pop, .fm-slide { animation: none; }
}
`;

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

// "2026-10-23" is read as a local date so it never shifts by a day
const formatDate = (value) => {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
};

// Razorpay's checkout script is loaded on demand rather than in index.html
// so pages that don't need payments don't pay for it.
const loadRazorpayScript = () =>
  new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

// Smoothly counts a number towards its new value
function useTween(value, ms = 350) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (prefersReduced()) {
      setShown(value);
      from.current = value;
      return undefined;
    }
    const start = performance.now();
    const origin = from.current;
    let raf;
    const tick = (now) => {
      const p = Math.min((now - start) / ms, 1);
      const current = origin + (value - origin) * (1 - Math.pow(1 - p, 3));
      setShown(current);
      from.current = current;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

const Money = ({ value }) => <>{money(Math.round(useTween(value)))}</>;

const Icon = ({ children, className = "h-4 w-4", strokeWidth = 2 }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {children}
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Dish card pieces                                                   */
/* ------------------------------------------------------------------ */

const FoodTypeIcon = ({ type }) => (
  <span
    className={`inline-flex h-[15px] w-[15px] flex-shrink-0 items-center justify-center border-[1.5px] bg-white ${
      foodTypeBorder[type] || foodTypeBorder.veg
    }`}
    title={type || "veg"}
  >
    <span className={`h-[7px] w-[7px] rounded-full ${foodTypeFill[type] || foodTypeFill.veg}`} />
  </span>
);

// Compact +/- stepper used on cards and in the cart.
const Stepper = ({ qty, onIncrement, onDecrement, full = false }) => (
  <div
    className={`flex items-center rounded-lg border border-red-200 bg-white p-0.5 ${
      full ? "w-full justify-between" : "gap-1"
    }`}
  >
    <button
      onClick={onDecrement}
      aria-label="Decrease quantity"
      className="flex h-7 w-7 items-center justify-center rounded-md text-base font-bold leading-none text-red-600 transition hover:bg-red-50 active:scale-90"
    >
      −
    </button>
    <span key={qty} className="fm-pop w-6 text-center text-sm font-bold tabular-nums text-stone-900">
      {qty}
    </span>
    <button
      onClick={onIncrement}
      aria-label="Increase quantity"
      className="flex h-7 w-7 items-center justify-center rounded-md text-base font-bold leading-none text-red-600 transition hover:bg-red-50 active:scale-90"
    >
      +
    </button>
  </div>
);

const addBtn =
  "rounded-lg border border-red-200 bg-white text-xs font-bold uppercase tracking-wide text-red-600 transition-all hover:border-transparent hover:bg-gradient-to-r hover:from-red-500 hover:to-orange-500 hover:text-white active:scale-95";

// One selectable line on a card: "₹180  [Add]" or a stepper once added.
const OptionRow = ({ price, qty, onAdd, onIncrement, onDecrement }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-base font-extrabold tabular-nums text-stone-900">{money(price)}</span>
    {qty > 0 ? (
      <Stepper qty={qty} onIncrement={onIncrement} onDecrement={onDecrement} />
    ) : (
      <button onClick={onAdd} className={`${addBtn} px-5 py-1.5`}>
        Add
      </button>
    )}
  </div>
);

// Half / Full tile: small-caps label, large price, full-width control.
// Once added, the tile picks up a warm tint and a soft glow.
const PortionTile = ({ label, price, qty, onAdd, onIncrement, onDecrement }) => {
  const active = qty > 0;
  return (
    <div
      className={`rounded-xl border p-2.5 transition-all duration-200 ${
        active
          ? "border-orange-300 bg-gradient-to-br from-red-50 to-amber-50 shadow-md shadow-orange-500/10"
          : "border-stone-200 bg-stone-50/60 hover:border-orange-200"
      }`}
    >
      <p
        className={`text-[10px] font-bold uppercase tracking-[0.16em] ${
          active ? "text-red-600" : "text-stone-500"
        }`}
      >
        {label}
      </p>
      <p className="mt-0.5 text-[17px] font-extrabold leading-tight tabular-nums text-stone-900">
        {money(price)}
      </p>
      <div className="mt-2.5">
        {active ? (
          <Stepper qty={qty} onIncrement={onIncrement} onDecrement={onDecrement} full />
        ) : (
          <button onClick={onAdd} className={`${addBtn} w-full py-1.5`}>
            Add
          </button>
        )}
      </div>
    </div>
  );
};

// A dish tile. Half and Full are shown right on the card, each with its own
// Add button, so there's no size sheet to open.
const ProductCard = ({ item, cart, updateQty, index }) => {
  const qtyOf = (portion) => cart[portion ? `${item._id}:${portion}` : item._id]?.qty || 0;
  const inCart = item.hasPortions ? qtyOf("half") + qtyOf("full") : qtyOf(null);

  return (
    <div
      className={`fm-rise group flex h-full flex-col overflow-hidden rounded-2xl border bg-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-orange-500/10 ${
        inCart > 0 ? "border-orange-300 shadow-md shadow-orange-500/10" : "border-stone-200"
      }`}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-stone-100">
        {item.image ? (
          <img
            src={item.image}
            alt={item.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50 text-4xl">
            🍽️
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />

        <span className="absolute left-2.5 top-2.5 rounded-md bg-white/95 p-1 shadow-sm">
          <FoodTypeIcon type={item.foodType} />
        </span>

        {inCart > 0 && (
          <span
            key={inCart}
            className="fm-pop absolute right-2.5 top-2.5 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-orange-500 px-1.5 text-xs font-bold text-white shadow-md"
          >
            {inCart}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-3.5 pb-3.5 pt-3">
        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-stone-900">{item.name}</h3>
        {item.description && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-stone-500">{item.description}</p>
        )}

        <div className="mt-auto pt-3">
          {item.hasPortions ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <PortionTile
                label="Half"
                price={item.halfPrice}
                qty={qtyOf("half")}
                onAdd={() => updateQty(item, "half", 1)}
                onIncrement={() => updateQty(item, "half", 1)}
                onDecrement={() => updateQty(item, "half", -1)}
              />
              <PortionTile
                label="Full"
                price={item.fullPrice}
                qty={qtyOf("full")}
                onAdd={() => updateQty(item, "full", 1)}
                onIncrement={() => updateQty(item, "full", 1)}
                onDecrement={() => updateQty(item, "full", -1)}
              />
            </div>
          ) : (
            <OptionRow
              price={item.price}
              qty={qtyOf(null)}
              onAdd={() => updateQty(item, null, 1)}
              onIncrement={() => updateQty(item, null, 1)}
              onDecrement={() => updateQty(item, null, -1)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const CardSkeleton = () => (
  <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
    <div className="aspect-[4/3] animate-pulse bg-gradient-to-br from-stone-100 to-amber-50" />
    <div className="space-y-2.5 p-3.5">
      <div className="h-4 w-3/4 animate-pulse rounded bg-stone-100" />
      <div className="h-3 w-full animate-pulse rounded bg-stone-100" />
      <div className="flex items-center justify-between pt-3">
        <div className="h-5 w-14 animate-pulse rounded bg-stone-100" />
        <div className="h-8 w-20 animate-pulse rounded-lg bg-stone-100" />
      </div>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Cart / payment panel                                               */
/* ------------------------------------------------------------------ */

// Order + payment in one panel. Used as the always-visible right-hand sidebar
// on desktop, and inside a bottom sheet on mobile.
const CartPanel = ({
  onClose,
  onClear,
  restaurant,
  date,
  timeSlot,
  partySize,
  table,
  cartLines,
  updateQty,
  payFull,
  setPayFull,
  subtotal,
  depositPercent,
  depositAmount,
  status,
  paying,
  canProceed,
  onPay,
}) => {
  const totalItems = cartLines.reduce((s, l) => s + l.qty, 0);
  const balance = subtotal - depositAmount;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      {/* Header */}
      <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-stone-100 bg-gradient-to-br from-red-50/70 via-orange-50/50 to-amber-50/60 px-5 pb-3.5 pt-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[17px] font-bold text-stone-900">
            Your order
            {totalItems > 0 && (
              <span
                key={totalItems}
                className="fm-pop rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-2 py-0.5 text-xs font-bold text-white"
              >
                {totalItems}
              </span>
            )}
          </p>
          <p className="mt-0.5 truncate text-xs text-stone-600">
            {restaurant?.name} · Table {table.tableNumber}
          </p>
          <p className="mt-0.5 text-xs text-stone-500">
            {formatDate(date)} · {timeSlot} · {partySize} guest{partySize > 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          {cartLines.length > 0 && (
            <button
              onClick={onClear}
              className="rounded-full px-2.5 py-1 text-xs font-semibold text-stone-500 transition hover:bg-white hover:text-red-600"
            >
              Clear
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close cart"
              className="flex h-8 w-8 items-center justify-center rounded-full text-stone-700 transition hover:bg-white"
            >
              <Icon strokeWidth={2.5}>
                <path d="M18 6L6 18M6 6l12 12" />
              </Icon>
            </button>
          )}
        </div>
      </div>

      {/* Items + payment choice + summary */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {cartLines.length === 0 ? (
          <div className="py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-50 to-orange-100 text-2xl">
              🛒
            </div>
            <p className="mt-3 text-sm font-semibold text-stone-800">Your order is empty</p>
            <p className="mt-1 text-xs text-stone-500">Add dishes from the menu to hold your table.</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {cartLines.map((l) => (
              <div
                key={`${l.item._id}:${l.portion || "single"}`}
                className="fm-rise flex gap-3 py-3.5 first:pt-0"
              >
                <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl border border-stone-100 bg-stone-100">
                  {l.item.image ? (
                    <img src={l.item.image} alt={l.item.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-amber-50 text-lg">🍽️</div>
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col justify-between">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-semibold leading-snug text-stone-900">
                      <FoodTypeIcon type={l.item.foodType} />
                      <span className="truncate">{l.item.name}</span>
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      {l.portion && (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium capitalize text-stone-600 ring-1 ring-amber-100">
                          {l.portion}
                        </span>
                      )}
                      <span className="text-xs text-stone-500">{money(l.price)} each</span>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <Stepper
                      qty={l.qty}
                      onIncrement={() => updateQty(l.item, l.portion, 1)}
                      onDecrement={() => updateQty(l.item, l.portion, -1)}
                    />
                    <span className="text-sm font-bold tabular-nums text-stone-900">
                      {money(l.price * l.qty)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Payment choice: a sliding pill shows which option is active */}
        <div className="relative mt-5 flex rounded-xl bg-stone-100 p-1" role="group" aria-label="Payment option">
          <span
            aria-hidden="true"
            className={`absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-lg bg-white shadow-sm transition-transform duration-300 ease-out ${
              payFull ? "translate-x-full" : "translate-x-0"
            }`}
          />
          <button
            type="button"
            onClick={() => setPayFull(false)}
            aria-pressed={!payFull}
            className={`relative z-10 flex-1 rounded-lg px-3 py-2.5 text-xs font-bold transition-colors ${
              !payFull ? "text-stone-900" : "text-stone-500 hover:text-stone-700"
            }`}
          >
            Pay {MIN_DEPOSIT_PERCENT}% deposit
          </button>
          <button
            type="button"
            onClick={() => setPayFull(true)}
            aria-pressed={payFull}
            className={`relative z-10 flex-1 rounded-lg px-3 py-2.5 text-xs font-bold transition-colors ${
              payFull ? "text-stone-900" : "text-stone-500 hover:text-stone-700"
            }`}
          >
            Pay full amount
          </button>
        </div>

        {/* Order summary */}
        <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
          <p className="mb-3 text-sm font-bold text-stone-900">Order summary</p>

          {/* How the bill is split between now and the table */}
          <div className="mb-3">
            <div className="flex h-2 overflow-hidden rounded-full bg-stone-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-red-500 via-orange-500 to-amber-400 transition-[width] duration-500 ease-out"
                style={{ width: `${subtotal > 0 ? depositPercent : 0}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-stone-500">
              <span>Pay now</span>
              <span>At the table</span>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-stone-600">Items ({totalItems})</span>
              <span className="tabular-nums text-stone-900">
                <Money value={subtotal} />
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-stone-600">Balance due at the table</span>
              <span className="tabular-nums text-stone-900">
                <Money value={balance} />
              </span>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-dashed border-stone-300 pt-3">
            <span className="text-[15px] font-bold text-stone-900">
              Due now {!payFull && <span className="text-xs font-medium text-stone-500">({depositPercent}% deposit)</span>}
            </span>
            <span className="text-[20px] font-extrabold tabular-nums text-red-600">
              <Money value={depositAmount} />
            </span>
          </div>
        </div>

        {status.message && (
          <div
            role={status.type === "error" ? "alert" : "status"}
            className={`mt-4 rounded-xl px-3.5 py-2.5 text-xs ${
              status.type === "error"
                ? "bg-red-50 text-red-700 ring-1 ring-red-100"
                : "bg-green-50 text-green-700 ring-1 ring-green-100"
            }`}
          >
            {status.message}
          </div>
        )}
      </div>

      {/* Pay footer */}
      <div className="flex-shrink-0 border-t border-stone-100 bg-white px-5 py-4">
        <button
          disabled={!canProceed}
          onClick={onPay}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 px-6 py-3.5 font-bold text-white shadow-lg shadow-orange-500/25 transition-all hover:brightness-105 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {paying ? (
            <>
              <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
              Processing…
            </>
          ) : cartLines.length === 0 ? (
            "Add a dish to continue"
          ) : (
            <>
              Pay {money(depositAmount)} to hold table
              <Icon strokeWidth={2.5}>
                <path d="M9 6l6 6-6 6" />
              </Icon>
            </>
          )}
        </button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] leading-relaxed text-stone-500">
          <Icon className="h-3 w-3 flex-shrink-0">
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 118 0v3" />
          </Icon>
          Secure payment · Table {table.tableNumber} is held once payment clears, pending the restaurant's
          confirmation.
        </p>
      </div>
    </div>
  );
};

// Mobile only: the same panel in a bottom sheet, opened from the cart bar.
const CartSheet = ({ onClose, ...panelProps }) => {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    // Stop the page behind from scrolling while the sheet is open
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Your order"
    >
      <div
        className={`absolute inset-0 bg-stone-900/50 backdrop-blur-[2px] transition-opacity duration-300 ${
          entered ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        className={`relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none ${
          entered ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex justify-center bg-gradient-to-br from-red-50/70 via-orange-50/50 to-amber-50/60 pt-2.5">
          <span className="h-1 w-10 rounded-full bg-stone-300" />
        </div>
        <CartPanel onClose={onClose} {...panelProps} />
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Page header pieces                                                 */
/* ------------------------------------------------------------------ */

const StepsBar = () => {
  const steps = [
    { label: "Table", done: true },
    { label: "Dishes", current: true },
    { label: "Payment" },
  ];
  return (
    <ol className="flex items-center gap-2 text-xs font-semibold" aria-label="Booking progress">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-2" aria-current={s.current ? "step" : undefined}>
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
              s.done
                ? "bg-green-500 text-white"
                : s.current
                ? "bg-gradient-to-br from-red-500 to-orange-500 text-white shadow-sm shadow-orange-500/40"
                : "bg-stone-200 text-stone-500"
            }`}
          >
            {s.done ? (
              <Icon className="h-3 w-3" strokeWidth={3}>
                <path d="M5 13l4 4L19 7" />
              </Icon>
            ) : (
              i + 1
            )}
          </span>
          <span className={s.current ? "text-stone-900" : s.done ? "text-stone-600" : "text-stone-400"}>
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-stone-300 sm:w-10" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
};

const InfoChip = ({ children, icon }) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-stone-700 shadow-sm ring-1 ring-orange-100">
    <span className="text-red-500">{icon}</span>
    {children}
  </span>
);

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

const FoodMenu = () => {
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (!state?.table) {
      navigate(`/restaurants/${id}`, { replace: true });
    }
  }, [state, id, navigate]);

  const cartKey = `fm_cart_${id}`;

  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState(() => {
    // Keep the order if the guest refreshes or goes back and forth
    try {
      const saved = JSON.parse(sessionStorage.getItem(cartKey) || "{}");
      return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
    } catch {
      return {};
    }
  });
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [status, setStatus] = useState({ type: "", message: "" });
  const [payFull, setPayFull] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [cartOpen, setCartOpen] = useState(false);
  const [activeCat, setActiveCat] = useState("");

  const sectionRefs = useRef({});
  const chipRefs = useRef({});

  useEffect(() => {
    let alive = true;
    api
      .get(`/menu/${id}`)
      .then(({ data }) => alive && setMenu(Array.isArray(data) ? data : []))
      .catch(() => alive && setMenu([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    try {
      sessionStorage.setItem(cartKey, JSON.stringify(cart));
    } catch {
      /* storage unavailable: the order just won't survive a refresh */
    }
  }, [cart, cartKey]);

  const { restaurant, date, timeSlot, partySize, table } = state || {};

  const filteredMenu = useMemo(() => {
    const q = search.trim().toLowerCase();
    return menu.filter((item) => {
      if (typeFilter !== "all" && (item.foodType || "veg") !== typeFilter) return false;
      if (q && !String(item.name || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [menu, typeFilter, search]);

  const grouped = useMemo(
    () =>
      filteredMenu.reduce((acc, item) => {
        const category = item.category || "Menu";
        if (!acc[category]) acc[category] = [];
        acc[category].push(item);
        return acc;
      }, {}),
    [filteredMenu]
  );
  const categories = useMemo(() => Object.keys(grouped), [grouped]);

  // Highlight the category chip for the section currently on screen
  useEffect(() => {
    if (!categories.length) {
      setActiveCat("");
      return undefined;
    }
    setActiveCat((current) => (categories.includes(current) ? current : categories[0]));
    if (!("IntersectionObserver" in window)) return undefined;

    const els = categories.map((c) => sectionRefs.current[c]).filter(Boolean);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveCat(visible[0].target.dataset.cat);
      },
      { rootMargin: "-200px 0px -65% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [categories]);

  // Keep the active chip in view inside the horizontal chip row
  useEffect(() => {
    const chip = chipRefs.current[activeCat];
    const row = chip?.parentElement;
    if (!chip || !row) return;
    row.scrollTo({
      left: chip.offsetLeft - row.clientWidth / 2 + chip.clientWidth / 2,
      behavior: prefersReduced() ? "auto" : "smooth",
    });
  }, [activeCat]);

  // All hooks are above this line — safe to bail out now.
  if (!state?.table) return null;

  const depositPercent = payFull ? 100 : MIN_DEPOSIT_PERCENT;

  const priceFor = (item, portion) => {
    if (item.hasPortions) return portion === "half" ? item.halfPrice : item.fullPrice;
    return item.price;
  };

  const updateQty = (item, portion, delta) => {
    const key = portion ? `${item._id}:${portion}` : item._id;
    setCart((prev) => {
      const next = Math.max(0, (prev[key]?.qty || 0) + delta);
      const copy = { ...prev };
      if (next === 0) delete copy[key];
      else copy[key] = { itemId: item._id, portion, qty: next };
      return copy;
    });
  };

  const clearCart = () => setCart({});

  const cartLines = Object.values(cart)
    .map(({ itemId, portion, qty }) => {
      const item = menu.find((m) => m._id === itemId);
      return item ? { item, portion, qty, price: priceFor(item, portion) } : null;
    })
    .filter(Boolean);

  const subtotal = cartLines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const totalItems = cartLines.reduce((sum, l) => sum + l.qty, 0);
  const depositAmount = Math.ceil((subtotal * depositPercent) / 100);
  const canProceed = totalItems > 0 && !paying;

  const scrollToCategory = (cat) => {
    setActiveCat(cat);
    sectionRefs.current[cat]?.scrollIntoView({
      behavior: prefersReduced() ? "auto" : "smooth",
      block: "start",
    });
  };

  const handlePay = async () => {
    if (!user) {
      navigate("/login");
      return;
    }
    if (totalItems === 0) {
      setStatus({ type: "error", message: "Add at least one dish to order before booking the table." });
      return;
    }

    setPaying(true);
    setStatus({ type: "", message: "" });

    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) throw new Error("Could not load the payment gateway. Check your connection and try again.");

      const { data: order } = await api.post("/bookings/checkout", {
        restaurantId: id,
        tableId: table._id,
        date,
        timeSlot,
        partySize,
        payFull,
        items: cartLines.map((l) => ({
          menuItemId: l.item._id,
          portion: l.portion || undefined,
          quantity: l.qty,
        })),
      });

      const options = {
        key: order.key,
        amount: order.amount,
        currency: order.currency || "INR",
        name: restaurant?.name || "Table booking",
        description: `${payFull ? "Full payment" : "Deposit"} for Table ${table.tableNumber}`,
        order_id: order.razorpayOrderId,
        prefill: { name: user.name, email: user.email },
        theme: { color: BRAND_HEX },
        handler: async (response) => {
          try {
            await api.post(`/bookings/${order.bookingId}/verify`, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            try {
              sessionStorage.removeItem(cartKey);
            } catch {
              /* nothing to clear */
            }
            navigate("/my-bookings", {
              state: { justBooked: true, tableNumber: table.tableNumber },
            });
          } catch (err) {
            setStatus({
              type: "error",
              message:
                err.response?.data?.message ||
                "Payment went through but we couldn't confirm the booking. Please contact support.",
            });
          } finally {
            setPaying(false);
          }
        },
        modal: {
          ondismiss: () => setPaying(false),
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      setStatus({
        type: "error",
        message: err.response?.data?.message || err.message || "Could not start payment.",
      });
      setPaying(false);
    }
  };

  const panelProps = {
    restaurant,
    date,
    timeSlot,
    partySize,
    table,
    cartLines,
    updateQty,
    onClear: clearCart,
    payFull,
    setPayFull,
    subtotal,
    depositPercent,
    depositAmount,
    status,
    paying,
    canProceed,
    onPay: handlePay,
  };

  const guestsText = `${partySize} guest${partySize > 1 ? "s" : ""}`;

  return (
    <div className="min-h-screen bg-stone-50 pb-24 lg:pb-10">
      <style>{STYLES}</style>

      {/* Intro band: where you are in the booking and what you have chosen so far */}
      <section className="relative overflow-hidden border-b border-orange-100 bg-gradient-to-br from-red-50 via-orange-50 to-amber-50">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amber-300/30 blur-3xl" />
        <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-red-300/20 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              onClick={() => navigate(-1)}
              className="group inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 transition hover:text-red-600"
            >
              <Icon className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" strokeWidth={2.5}>
                <path d="M15 18l-6-6 6-6" />
              </Icon>
              Back
            </button>
            <StepsBar />
          </div>

          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-red-600">Pre-order your meal</p>
          <h1 className="mt-1 font-display text-2xl text-stone-900 sm:text-3xl">
            {restaurant?.name || "Order food"}
          </h1>

          <div className="fm-hide-scroll -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            <InfoChip
              icon={
                <Icon>
                  <path d="M4 10h16M6 10v9M18 10v9M3 10l2-5h14l2 5" />
                </Icon>
              }
            >
              Table {table.tableNumber}
            </InfoChip>
            <InfoChip
              icon={
                <Icon>
                  <path d="M8 7V3m8 4V3M5 11h14M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </Icon>
              }
            >
              {formatDate(date)}
            </InfoChip>
            <InfoChip
              icon={
                <Icon>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </Icon>
              }
            >
              {timeSlot}
            </InfoChip>
            <InfoChip
              icon={
                <Icon>
                  <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21a8 8 0 0116 0" />
                </Icon>
              }
            >
              {guestsText}
            </InfoChip>
          </div>
        </div>
      </section>

      {/* Sticky toolbar: search, food type, categories (sits just under the site navbar) */}
      <div className="sticky top-16 z-20 border-b border-stone-200 bg-white/90 backdrop-blur-md md:top-[72px]">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex items-center gap-3 py-3">
            <div className="relative min-w-0 flex-1 lg:max-w-md">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400">
                <Icon>
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.35-4.35" />
                </Icon>
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search for dishes"
                aria-label="Search for dishes"
                className="h-10 w-full rounded-full border border-stone-200 bg-stone-50 pl-10 pr-9 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-200"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-stone-400 hover:bg-stone-200 hover:text-stone-700"
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={2.5}>
                    <path d="M18 6L6 18M6 6l12 12" />
                  </Icon>
                </button>
              )}
            </div>

            <div className="flex flex-shrink-0 rounded-full bg-stone-100 p-1" role="group" aria-label="Food type">
              {TYPE_FILTERS.map((opt) => {
                const active = typeFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setTypeFilter(opt.value)}
                    aria-pressed={active}
                    aria-label={opt.label}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold transition-all sm:px-3 ${
                      active ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-800"
                    }`}
                  >
                    {opt.dot && <span className={`h-2 w-2 rounded-full ${opt.dot}`} />}
                    <span className={opt.value === "all" ? "" : "hidden sm:inline"}>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {categories.length > 1 && (
            <div className="fm-hide-scroll -mx-4 flex gap-2 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
              {categories.map((cat) => {
                const active = activeCat === cat;
                return (
                  <button
                    key={cat}
                    ref={(el) => (chipRefs.current[cat] = el)}
                    onClick={() => scrollToCategory(cat)}
                    aria-current={active ? "true" : undefined}
                    className={`flex-shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-bold transition-all duration-200 ${
                      active
                        ? "bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-md shadow-orange-500/25"
                        : "bg-white text-stone-700 ring-1 ring-stone-200 hover:text-red-600 hover:ring-orange-300"
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Menu (left) + order & payment sidebar (right on desktop) */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start lg:gap-8">
        <div>
          {loading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <CardSkeleton key={i} />
              ))}
            </div>
          ) : menu.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-orange-200 bg-white p-14 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-50 to-orange-100 text-2xl">
                📋
              </div>
              <p className="mt-4 text-sm font-semibold text-stone-800">No menu yet</p>
              <p className="mt-1 text-sm text-stone-500">This restaurant hasn't added a menu yet.</p>
            </div>
          ) : filteredMenu.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-orange-200 bg-white p-14 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-50 to-orange-100 text-2xl">
                🔍
              </div>
              <p className="mt-4 text-sm font-semibold text-stone-800">No dishes match</p>
              <p className="mt-1 text-sm text-stone-500">Try a different name or food type.</p>
              <button
                onClick={() => {
                  setSearch("");
                  setTypeFilter("all");
                }}
                className="mt-5 rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-6 py-2 text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition hover:brightness-110"
              >
                Clear filters
              </button>
            </div>
          ) : (
            categories.map((cat) => (
              <section
                key={cat}
                data-cat={cat}
                ref={(el) => (sectionRefs.current[cat] = el)}
                className="mb-10 scroll-mt-56 lg:scroll-mt-48"
              >
                <h2 className="mb-4 flex items-center gap-3 text-lg font-extrabold text-stone-900">
                  <span className="h-6 w-1 rounded-full bg-gradient-to-b from-red-500 to-amber-400" />
                  {cat}
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-500">
                    {grouped[cat].length}
                  </span>
                </h2>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  {grouped[cat].map((item, i) => (
                    <ProductCard key={item._id} item={item} cart={cart} updateQty={updateQty} index={i} />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        {/* Desktop sidebar — order and payment always visible, no cart to open */}
        <aside
          aria-label="Your order"
          className="sticky top-[12rem] hidden max-h-[calc(100vh-13rem)] flex-col overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xl shadow-stone-900/5 lg:flex"
        >
          <CartPanel {...panelProps} />
        </aside>
      </div>

      {/* Mobile cart bar */}
      {cartLines.length > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="fm-slide fixed inset-x-0 bottom-0 z-30 flex items-center justify-between bg-gradient-to-r from-red-500 to-orange-500 px-5 py-4 font-bold text-white shadow-[0_-8px_24px_rgba(239,68,68,0.3)] lg:hidden"
        >
          <span className="flex items-center gap-2 text-sm">
            <span key={totalItems} className="fm-pop flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-white/25 px-1.5 text-xs">
              {totalItems}
            </span>
            item{totalItems > 1 ? "s" : ""} · <Money value={subtotal} />
          </span>
          <span className="flex items-center gap-1 text-sm uppercase tracking-wide">
            Review and pay
            <Icon strokeWidth={2.5}>
              <path d="M9 6l6 6-6 6" />
            </Icon>
          </span>
        </button>
      )}

      {cartOpen && <CartSheet onClose={() => setCartOpen(false)} {...panelProps} />}
    </div>
  );
};

export default FoodMenu;