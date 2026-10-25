import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios.js";
import ReviewModal from "../components/ReviewModal.jsx";

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const statusStyles = {
  pending: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  confirmed: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  cancelled: "bg-red-50 text-red-600 ring-1 ring-red-200",
  completed: "bg-stone-100 text-stone-500 ring-1 ring-stone-200",
};

const statusDot = {
  pending: "bg-amber-400",
  confirmed: "bg-emerald-400",
  cancelled: "bg-red-400",
  completed: "bg-stone-400",
};

const FALLBACK_STATUS = "completed";

const filterTabs = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

const ACTIVE_STATUSES = ["pending", "confirmed"];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
const formatMoney = (n) => currency.format(Number(n) || 0);

// "YYYY-MM-DD" strings are parsed by `new Date()` as UTC midnight, which shifts
// the displayed day for users west of UTC. Parse date-only strings as local.
const parseBookingDate = (value) => {
  if (!value) return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// NOTE: `toLocaleDateString` never throws on an invalid date (it returns
// "Invalid Date"), so validity has to be checked explicitly.
const formatDate = (value) => {
  const date = parseBookingDate(value);
  if (!date) return typeof value === "string" ? value : "—";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const isPastBooking = (booking) => {
  const date = parseBookingDate(booking.date);
  return date ? date < startOfToday() : false;
};

// A "pending" booking that came from the paid checkout flow (it has a
// depositAmount) is awaiting the restaurant's confirmation, not just an
// unpaid request — label it distinctly so guests aren't confused about
// whether they've already paid.
const statusLabel = (b) => {
  if (b.status === "pending" && b.depositAmount) return "Awaiting confirmation";
  return b.status;
};

// Upcoming active bookings first (soonest first), then everything else
// (most recent first). Gives guests what they most likely came here to see.
const sortBookings = (list) => {
  const time = (b) => parseBookingDate(b.date)?.getTime() ?? 0;
  const isUpcoming = (b) => ACTIVE_STATUSES.includes(b.status) && !isPastBooking(b);
  return [...list].sort((a, b) => {
    const au = isUpcoming(a);
    const bu = isUpcoming(b);
    if (au !== bu) return au ? -1 : 1;
    return au ? time(a) - time(b) : time(b) - time(a);
  });
};

// `review.restaurant` may be a populated object or a raw id depending on the API.
const reviewRestaurantId = (review) => review.restaurant?._id ?? review.restaurant;

/* -------------------------------------------------------------------------- */
/*  Small presentational components                                           */
/* -------------------------------------------------------------------------- */

const OrderItemRow = ({ item }) => (
  <div className="flex items-center justify-between text-sm py-1.5">
    <span className="text-stone-600">
      {item.quantity}× {item.name}
      {item.portion && (
        <span className="text-stone-400 capitalize"> ({item.portion})</span>
      )}
    </span>
    <span className="text-stone-500 tabular-nums">
      {formatMoney(item.price * item.quantity)}
    </span>
  </div>
);

// Collapsible preorder summary — only rendered when a booking actually has
// items (the paid, menu-first checkout flow). Older table-only bookings have
// no `items`, so this section is skipped for those.
const OrderSummary = ({ booking }) => {
  const [open, setOpen] = useState(false);
  const items = booking.items || [];
  if (items.length === 0) return null;

  const panelId = `preorder-${booking._id}`;

  return (
    <div className="mt-3 pt-3 border-t border-stone-100">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-amber-600 transition"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : ""}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
        </svg>
        {open ? "Hide" : "View"} preorder ({items.length} {items.length === 1 ? "dish" : "dishes"})
      </button>

      {open && (
        <div
          id={panelId}
          className="mt-2 rounded-xl bg-stone-50 border border-stone-100 px-3.5 py-2 divide-y divide-stone-100"
        >
          {items.map((item, i) => (
            <OrderItemRow key={`${item.menuItem}-${item.portion || "std"}-${i}`} item={item} />
          ))}
          <div className="flex items-center justify-between text-xs font-semibold text-stone-700 pt-2 mt-1">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatMoney(booking.subtotal)}</span>
          </div>
          {booking.depositAmount != null && (
            <div className="flex items-center justify-between text-xs text-stone-400 pt-1">
              <span>
                {booking.depositPercent === 100
                  ? "Paid in full"
                  : `Paid now (${booking.depositPercent}%)`}
              </span>
              <span className="tabular-nums">{formatMoney(booking.depositAmount)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Confirmation step before cancelling. Cancelling a paid booking triggers a
// refund, so an accidental click is costly and worth guarding against.
const CancelDialog = ({ booking, busy, onConfirm, onClose }) => {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const hasDeposit = booking.depositAmount != null && booking.depositAmount > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 px-4"
      onClick={() => !busy && onClose()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cancel-title"
        aria-describedby="cancel-desc"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 id="cancel-title" className="font-display text-xl text-stone-900">
          Cancel this booking?
        </h2>
        <p id="cancel-desc" className="mt-2 text-sm text-stone-500">
          {booking.restaurant?.name} · {formatDate(booking.date)} at {booking.timeSlot}.
          {hasDeposit
            ? ` Your deposit of ${formatMoney(booking.depositAmount)} will be refunded to your original payment method.`
            : ""}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            autoFocus
            className="rounded-xl border border-stone-200 px-4 py-2.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            Keep booking
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-xl bg-red-600 px-4 py-2.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "Cancelling…" : "Yes, cancel"}
          </button>
        </div>
      </div>
    </div>
  );
};

const Icon = ({ d, className = "w-3.5 h-3.5 text-stone-400" }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const ICONS = {
  calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  clock: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  guests: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-4-4",
  cancel: "M9.5 9.5l5 5m0-5l-5 5",
  star: "M12 17.3l-5.6 3 1.1-6.2L3 9.6l6.3-.9L12 3l2.7 5.7 6.3.9-4.5 4.5 1.1 6.2z",
  rebook: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
};

const BookingCard = ({ booking: b, review, cancelling, onCancel, onReview }) => {
  const status = statusStyles[b.status] ? b.status : FALLBACK_STATUS;

  // Only guests who actually dined can review. (Previously pending bookings
  // were reviewable too.)
  const canReview =
    !review && (b.status === "completed" || (b.status === "confirmed" && isPastBooking(b)));
  const canCancel = ACTIVE_STATUSES.includes(b.status);
  const canRebook = ["completed", "cancelled"].includes(b.status) && b.restaurant?._id;

  return (
    <article
      className={`group relative rounded-2xl border bg-white p-6 shadow-sm hover:shadow-lg hover:-translate-y-0.5 motion-reduce:transform-none transition-all duration-200 ${
        b.status === "pending" ? "border-amber-200 ring-1 ring-amber-100" : "border-stone-200"
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-stone-100 flex-shrink-0 flex items-center justify-center ring-2 ring-[#D4AF37]/20">
            {b.restaurant?.image ? (
              <img
                src={b.restaurant.image}
                alt={b.restaurant?.name || "Restaurant"}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xl text-stone-300" aria-hidden="true">🍽️</span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 mb-1.5">
              <h3 className="font-display text-lg text-stone-900 truncate">
                {b.restaurant?.name || "Restaurant unavailable"}
              </h3>
              <span
                className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full capitalize ${statusStyles[status]}`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${statusDot[status]} ${
                    b.status === "pending" ? "animate-pulse motion-reduce:animate-none" : ""
                  }`}
                />
                {statusLabel(b)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
              <span className="inline-flex items-center gap-1.5">
                <Icon d={ICONS.calendar} />
                {formatDate(b.date)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon d={ICONS.clock} />
                {b.timeSlot}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon d={ICONS.guests} />
                {b.partySize} {b.partySize === 1 ? "guest" : "guests"}
              </span>
              {b.table?.tableNumber && (
                <span className="text-stone-400">Table {b.table.tableNumber}</span>
              )}
            </div>

            {b.status === "cancelled" && b.refundedAt && (
              <p className="text-xs text-stone-400 mt-2">
                Deposit refunded
                {b.depositAmount ? ` (${formatMoney(b.depositAmount)})` : ""}
              </p>
            )}

            <OrderSummary booking={b} />

            {review && (
              <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-stone-100">
                <span
                  className="text-amber-400 text-sm tracking-tight"
                  role="img"
                  aria-label={`Rated ${review.rating} out of 5`}
                >
                  {"★".repeat(review.rating)}
                  <span className="text-stone-200">{"★".repeat(5 - review.rating)}</span>
                </span>
                <span className="text-xs text-stone-400">You rated this restaurant</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canCancel && (
            <button
              type="button"
              onClick={() => onCancel(b)}
              disabled={cancelling}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 hover:text-white hover:bg-red-500 px-4 py-2.5 rounded-xl border border-red-200 hover:border-red-500 shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.cancel} />
              </svg>
              Cancel
            </button>
          )}

          {canReview && (
            <button
              type="button"
              onClick={() => onReview(b)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-white px-4 py-2.5 rounded-xl bg-gradient-to-r from-stone-900 to-stone-700 hover:from-stone-800 hover:to-stone-600 shadow-sm hover:shadow-md transition-all duration-200"
            >
              <Icon d={ICONS.star} className="w-3.5 h-3.5" />
              Leave a review
            </button>
          )}

          {canRebook && (
            <Link
              to={`/restaurants/${b.restaurant._id}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700 px-4 py-2.5 rounded-xl border border-stone-200 bg-white hover:border-[#D4AF37]/60 hover:bg-stone-50 shadow-sm hover:shadow-md transition-all duration-200"
            >
              <Icon d={ICONS.rebook} className="w-3.5 h-3.5 text-[#D4AF37]" />
              Book again
            </Link>
          )}
        </div>
      </div>
    </article>
  );
};

const LoadingSkeleton = () => (
  <div className="max-w-4xl mx-auto px-6 py-12" aria-busy="true" aria-label="Loading bookings">
    <div className="h-8 w-48 bg-stone-100 rounded-lg animate-pulse motion-reduce:animate-none mb-8" />
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="h-24 bg-stone-100 rounded-2xl animate-pulse motion-reduce:animate-none" />
      ))}
    </div>
  </div>
);

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

const MyBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [myReviews, setMyReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reviewTarget, setReviewTarget] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [cancelError, setCancelError] = useState("");

  const fetchBookings = useCallback(async (signal) => {
    const res = await api.get("/bookings/my", { signal });
    setBookings(Array.isArray(res.data) ? res.data : []);
  }, []);

  const fetchAll = useCallback(
    async (signal) => {
      setLoadError("");
      try {
        // allSettled so a failing reviews endpoint doesn't hide the bookings.
        const [bookingsRes, reviewsRes] = await Promise.allSettled([
          api.get("/bookings/my", { signal }),
          api.get("/reviews/mine", { signal }),
        ]);

        if (bookingsRes.status === "rejected") throw bookingsRes.reason;

        setBookings(Array.isArray(bookingsRes.value.data) ? bookingsRes.value.data : []);
        setMyReviews(
          reviewsRes.status === "fulfilled" && Array.isArray(reviewsRes.value.data)
            ? reviewsRes.value.data
            : []
        );
      } catch (err) {
        if (err.name === "CanceledError" || err.code === "ERR_CANCELED") return;
        setLoadError(
          err.response?.data?.message || "We couldn't load your bookings. Please try again."
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchAll(controller.signal);
    return () => controller.abort(); // avoids setState after unmount
  }, [fetchAll]);

  const retry = () => {
    setLoading(true);
    fetchAll();
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    const id = cancelTarget._id;
    setCancellingId(id);
    setCancelError("");
    try {
      await api.patch(`/bookings/${id}/status`, { status: "cancelled" });
      setCancelTarget(null);
      await fetchBookings(); // reviews are unaffected by a cancellation
    } catch (err) {
      // Surfaces the refund-failure message from updateBookingStatus (502)
      // instead of silently doing nothing.
      setCancelTarget(null);
      setCancelError(
        err.response?.data?.message || "Could not cancel this booking. Please try again."
      );
    } finally {
      setCancellingId(null);
    }
  };

  const reviewByRestaurant = useMemo(() => {
    const map = new Map();
    myReviews.forEach((r) => map.set(reviewRestaurantId(r), r));
    return map;
  }, [myReviews]);

  const counts = useMemo(() => {
    const c = { all: bookings.length };
    bookings.forEach((b) => {
      c[b.status] = (c[b.status] || 0) + 1;
    });
    return c;
  }, [bookings]);

  const visibleBookings = useMemo(() => {
    const filtered =
      statusFilter === "all" ? bookings : bookings.filter((b) => b.status === statusFilter);
    return sortBookings(filtered);
  }, [bookings, statusFilter]);

  if (loading) return <LoadingSkeleton />;

  if (loadError && bookings.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-6 py-8 text-center">
          <p className="text-red-700 font-medium">{loadError}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-4 rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-700 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
        <div>
          <p className="text-xs font-semibold tracking-wider text-amber-600 uppercase mb-1.5">
            Your reservations
          </p>
          <h1 className="font-display text-4xl text-stone-900">My bookings</h1>
        </div>

        {bookings.length > 0 && (
          <div
            role="group"
            aria-label="Filter bookings by status"
            className="flex items-center gap-1.5 rounded-full bg-stone-100/80 p-1 overflow-x-auto"
          >
            {filterTabs.map((tab) => {
              const active = statusFilter === tab.key;
              return (
                <button
                  type="button"
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  aria-pressed={active}
                  className={`relative flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    active ? "bg-stone-900 text-white shadow-sm" : "text-stone-500 hover:text-stone-800"
                  }`}
                >
                  {tab.label}
                  <span className={`text-[10px] tabular-nums ${active ? "text-white/70" : "text-stone-400"}`}>
                    {counts[tab.key] || 0}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {cancelError && (
        <div
          role="alert"
          className="mb-6 flex items-start justify-between gap-4 rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm"
        >
          <span>{cancelError}</span>
          <button
            type="button"
            onClick={() => setCancelError("")}
            aria-label="Dismiss error"
            className="text-red-400 hover:text-red-700"
          >
            ✕
          </button>
        </div>
      )}

      {bookings.length === 0 ? (
        <div className="text-center py-20 px-6 rounded-3xl border border-dashed border-stone-200 bg-stone-50/50">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-white shadow-sm flex items-center justify-center text-2xl" aria-hidden="true">
            🍽️
          </div>
          <p className="text-stone-600 font-medium">No bookings yet</p>
          <p className="text-stone-400 text-sm mt-1 mb-5">
            Reserve a table and it'll show up here.
          </p>
          <Link
            to="/restaurants"
            className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 text-white px-5 py-2.5 text-sm font-medium hover:bg-stone-700 transition-colors"
          >
            Find a restaurant
          </Link>
        </div>
      ) : visibleBookings.length === 0 ? (
        <div className="text-center py-14 px-6 rounded-2xl border border-dashed border-stone-200 bg-stone-50/50">
          <p className="text-stone-500 text-sm">No {statusFilter} bookings.</p>
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className="mt-3 text-xs font-medium text-amber-600 hover:underline"
          >
            Show all bookings
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleBookings.map((b) => (
            <BookingCard
              key={b._id}
              booking={b}
              review={reviewByRestaurant.get(b.restaurant?._id)}
              cancelling={cancellingId === b._id}
              onCancel={setCancelTarget}
              onReview={setReviewTarget}
            />
          ))}
        </div>
      )}

      {cancelTarget && (
        <CancelDialog
          booking={cancelTarget}
          busy={cancellingId === cancelTarget._id}
          onConfirm={confirmCancel}
          onClose={() => setCancelTarget(null)}
        />
      )}

      {reviewTarget && (
        <ReviewModal
          bookingId={reviewTarget._id}
          restaurantName={reviewTarget.restaurant?.name}
          onClose={() => setReviewTarget(null)}
          onSubmitted={(newReview) => {
            setMyReviews((prev) => [...prev, newReview]);
            setReviewTarget(null);
          }}
        />
      )}
    </div>
  );
};

export default MyBookings;   