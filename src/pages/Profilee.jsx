import { Component, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axios.js";
import { useAuth } from "../context/AuthContext.jsx";

/* ============================================================================
   Config
   ========================================================================== */

const API_ORIGIN = import.meta.env?.VITE_API_URL || "http://localhost:5000";

const ENDPOINTS = {
  myBookings: "/bookings/my",
  myRestaurants: "/restaurants/mine",
};

const PAGE_SIZE = 6;
const UPCOMING_GRACE_MS = 60 * 60 * 1000;
const NOTIF_KEY = "bl_notification_prefs";

const STATUS = {
  pending: { label: "Awaiting confirmation", dot: "bg-amber-500", pill: "bg-amber-50 text-amber-700 ring-amber-200" },
  confirmed: { label: "Confirmed", dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  completed: { label: "Completed", dot: "bg-stone-400", pill: "bg-stone-100 text-stone-600 ring-stone-200" },
  cancelled: { label: "Cancelled", dot: "bg-red-500", pill: "bg-red-50 text-red-600 ring-red-200" },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

/* ============================================================================
   Helpers
   ========================================================================== */

const pad = (n) => String(n).padStart(2, "0");
const localISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const formatINR = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const imageUrl = (p) => (p ? `${API_ORIGIN}${p}` : "");
const bookingStart = (b) => new Date(`${b.date}T${String(b.timeSlot || "00:00").padStart(5, "0")}:00`);
const bookingRef = (b) => `BL-${String(b._id).slice(-6).toUpperCase()}`;
const restaurantIdOf = (b) => b.restaurantId || b.restaurant?._id || b.restaurant;
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const formatTime = (slot) => {
  const h = Number(String(slot).split(":")[0]) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? "AM" : "PM"}`;
};

const formatDay = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  const today = localISO();
  const tomorrow = localISO(new Date(Date.now() + 86400000));
  if (iso === today) return "Today";
  if (iso === tomorrow) return "Tomorrow";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
};

const timeUntil = (ms) => {
  if (ms <= 0) return "Happening now";
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `In ${d}d ${h}h`;
  if (h > 0) return `In ${h}h ${m % 60}m`;
  return `In ${Math.max(m, 1)}m`;
};

const isUpcoming = (b, now) =>
  (b.status === "confirmed" || b.status === "pending") && bookingStart(b).getTime() + UPCOMING_GRACE_MS >= now;

const orderLines = (b) => (b.items || []).map((i) => ({ ...i, line: (Number(i.price) || 0) * (Number(i.quantity) || 0) }));

const money = (b) => {
  const subtotal = Number(b.subtotal) || 0;
  const deposit = Number(b.depositAmount) || 0;
  return subtotal || deposit ? { subtotal, deposit, balance: Math.max(subtotal - deposit, 0) } : null;
};

const mapsUrl = (b) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [b.restaurant?.name, b.restaurant?.address, b.restaurant?.city].filter(Boolean).join(", ")
  )}`;

const downloadCalendar = (b) => {
  const start = bookingStart(b);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const fmt = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BhookLagi//Booking//EN",
    "BEGIN:VEVENT",
    `UID:${bookingRef(b)}@bhooklagi`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:Table at ${b.restaurant?.name || "restaurant"} (${bookingRef(b)})`,
    `LOCATION:${[b.restaurant?.address, b.restaurant?.city].filter(Boolean).join(", ")}`,
    `DESCRIPTION:Table ${b.table?.tableNumber ?? ""} for ${b.partySize} guests`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${bookingRef(b)}.ics`;
  a.click();
  URL.revokeObjectURL(url);
};

/* ============================================================================
   Hooks
   ========================================================================== */

const useProfileData = (user, isOwner) => {
  const [state, setState] = useState({ loading: true, error: "", failed: 0, bookings: [], restaurants: [], updatedAt: null });

  const load = useCallback(
    async (signal) => {
      setState((s) => ({ ...s, loading: true, error: "" }));
      try {
        if (isOwner) {
          const { data: list } = await api.get(ENDPOINTS.myRestaurants, { signal });
          const results = await Promise.allSettled(list.map((r) => api.get(`/bookings/restaurant/${r._id}`, { signal })));
          let failed = 0;
          const restaurants = list.map((r, i) => {
            const ok = results[i].status === "fulfilled";
            if (!ok) failed += 1;
            return { ...r, bookings: ok ? results[i].value.data : [] };
          });
          const bookings = restaurants.flatMap((r) =>
            r.bookings.map((b) => ({ ...b, restaurantId: r._id, restaurantName: r.name }))
          );
          if (!signal.aborted) setState({ loading: false, error: "", failed, bookings, restaurants, updatedAt: Date.now() });
        } else {
          const { data } = await api.get(ENDPOINTS.myBookings, { signal });
          if (!signal.aborted) setState({ loading: false, error: "", failed: 0, bookings: data, restaurants: [], updatedAt: Date.now() });
        }
      } catch (err) {
        if (signal.aborted) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err.response?.data?.message || "We couldn't load your activity. Check your connection and try again.",
        }));
      }
    },
    [isOwner]
  );

  useEffect(() => {
    if (!user) return undefined;
    const c = new AbortController();
    load(c.signal);
    return () => c.abort();
  }, [user, load]);

  return { ...state, reload: useCallback(() => load(new AbortController().signal), [load]) };
};

const useCountUp = (target, duration = 1100) => {
  const [v, setV] = useState(reducedMotion() ? target : 0);
  useEffect(() => {
    if (reducedMotion()) {
      setV(target);
      return undefined;
    }
    let raf;
    let start;
    const step = (t) => {
      if (!start) start = t;
      const p = Math.min((t - start) / duration, 1);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
};

const useNow = (interval = 60000) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
};

/* ============================================================================
   Primitives
   ========================================================================== */

const Icon = ({ d, className = "h-5 w-5" }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const I = {
  calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  check: "M5 13l4 4L19 7",
  clock: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  wallet: "M3 7h18v12H3zM3 7l2-3h12l2 3M16 13h2",
  store: "M4 9l1-5h14l1 5M4 9v11h16V9M4 9h16M9 20v-6h6v6",
  users: "M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m5-6.13a3 3 0 11-6 0 3 3 0 016 0zm6 3a3 3 0 11-6 0 3 3 0 016 0z",
  mail: "M3 7l9 6 9-6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z",
  pin: "M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zm0-8.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  chevron: "M19 9l-7 7-7-7",
  copy: "M8 8h10v12H8zM6 16H5a1 1 0 01-1-1V5a1 1 0 011-1h9a1 1 0 011 1v1",
  download: "M12 4v12m0 0l-4-4m4 4l4-4M5 20h14",
  arrow: "M5 12h14m-6-6l6 6-6 6",
  search: "M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14z",
  sort: "M7 4v16m0 0l-3-3m3 3l3-3M17 20V4m0 0l-3 3m3-3l3 3",
  refresh: "M4 4v5h.6m14.8 2A8 8 0 004.6 9m0 0H9m11 11v-5h-.6m0 0a8 8 0 01-14.8-2m14.8 2H15",
};

const Skeleton = ({ className }) => <div className={`pf-shimmer rounded-2xl ${className}`} aria-hidden="true" />;

const Card = ({ className = "", children }) => (
  <div className={`rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(90,70,10,0.06)] ${className}`}>{children}</div>
);

const CardTitle = ({ title, hint, right }) => (
  <div className="mb-4 flex items-end justify-between gap-3">
    <div>
      <h2 className="font-display text-lg text-stone-900">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-stone-500">{hint}</p>}
    </div>
    {right}
  </div>
);

const StatusPill = ({ status }) => {
  const s = STATUS[status] || STATUS.completed;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${s.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
};

const Photo = ({ src, alt, className = "" }) => {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div role="img" aria-label={alt} className={`flex items-center justify-center bg-stone-100 text-3xl text-stone-300 ${className}`}>
        🍽️
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={className} />;
};

const Banner = ({ tone = "error", children, action }) => (
  <div
    role="alert"
    className={`pf-fade flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-sm ${
      tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800"
    }`}
  >
    <span>{children}</span>
    {action}
  </div>
);

const delta = (series) => {
  if (!series) return null;
  const sum = (a) => a.reduce((s, v) => s + v, 0);
  const cur = sum(series.slice(-7));
  const prev = sum(series.slice(0, -7).slice(-7));
  if (!cur && !prev) return null;
  if (!prev) return { label: "New", up: true };
  const pct = Math.round(((cur - prev) / prev) * 100);
  return { label: `${pct > 0 ? "+" : ""}${pct}%`, up: pct >= 0 };
};

const Sparkline = ({ values }) => {
  const W = 96;
  const H = 30;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - 3 - (v / max) * (H - 8)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-8 w-24 flex-shrink-0" aria-hidden="true">
      <defs>
        <linearGradient id="pf-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#pf-spark)" />
      <path d={line} fill="none" stroke="#B8921F" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const StatTile = memo(({ label, value, prefix = "", hint, icon, delay, series }) => {
  const n = useCountUp(value);
  const dl = delta(series);
  return (
    <div className="pf-rise" style={{ animationDelay: `${delay}ms` }}>
      <Card className="p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[#B8921F]/15">
        <div className="flex items-start justify-between">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#F4E5AE]/70 to-[#E2C25F]/50 text-[#6b5210]">{icon}</span>
          {dl && (
            <span
              title="Last 7 days vs the 7 days before"
              className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                dl.up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
              }`}
            >
              {dl.up ? "▲" : "▼"} {dl.label}
            </span>
          )}
        </div>
        <p className="mt-4 font-display text-3xl tabular-nums tracking-tight text-stone-900">
          {prefix}
          {n.toLocaleString("en-IN")}
        </p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-stone-600">{label}</p>
            {hint && <p className="mt-0.5 truncate text-xs text-stone-400">{hint}</p>}
          </div>
          {series && <Sparkline values={series} />}
        </div>
      </Card>
    </div>
  );
});

/* ============================================================================
   Header
   ========================================================================== */

const CopyChip = ({ icon, label, value, mono = false }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title="Click to copy"
      className="group inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white/80 px-2.5 py-1 text-xs text-stone-600 shadow-sm backdrop-blur hover:border-[#D4AF37]/70 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
    >
      <Icon d={icon} className="h-3.5 w-3.5 text-stone-400 group-hover:text-[#8a6d12]" />
      <span className={`max-w-[16rem] truncate ${mono ? "font-mono" : ""}`}>{label}</span>
      <span className="ml-0.5 text-[10px] font-medium text-[#8a6d12]">{copied ? "Copied" : ""}</span>
    </button>
  );
};

const Header = ({ user, isOwner, onLogout }) => {
  const initials =
    user.name
      ?.split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  const since = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
    : null;
  const accountId = String(user._id || user.id || "");

  return (
    <header>
      {/* Cover */}
      <div className="relative h-40 overflow-hidden bg-gradient-to-br from-[#FFFBEB] via-[#F7EBC0] to-[#E2C25F] md:h-48">
        <div className="pf-grid absolute inset-0" aria-hidden="true" />
        <div className="pf-glow absolute -right-16 -top-24 h-96 w-96 rounded-full bg-white/70 blur-3xl" aria-hidden="true" />
        <div className="pf-glow absolute -bottom-32 left-10 h-72 w-72 rounded-full bg-[#C9A227]/30 blur-3xl [animation-delay:-7s]" aria-hidden="true" />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#FAF8F3] to-transparent" aria-hidden="true" />

        <nav aria-label="Breadcrumb" className="relative mx-auto max-w-6xl px-6 pt-5 text-xs text-[#6b5210]">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link to={isOwner ? "/owner" : "/"} className="hover:underline">
                {isOwner ? "Dashboard" : "Home"}
              </Link>
            </li>
            <li aria-hidden="true" className="opacity-50">/</li>
            <li aria-current="page" className="font-medium">Profile</li>
          </ol>
        </nav>
      </div>

      <div className="mx-auto max-w-6xl px-6">
        <div className="-mt-14 flex flex-col gap-5 sm:-mt-16 sm:flex-row sm:items-end">
          {/* Avatar with slowly rotating gold ring */}
          <div className="pf-rise relative h-28 w-28 flex-shrink-0 sm:h-32 sm:w-32" aria-hidden="true">
            <span
              className="pf-spin absolute -inset-[3px] rounded-full"
              style={{ background: "conic-gradient(from 0deg, #ffffff, #D4AF37, #ffffff, #8a6d12, #ffffff)" }}
            />
            <div className="relative flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-[#8a6d12] to-[#4f3b07] shadow-xl ring-4 ring-[#FAF8F3]">
              <span className="font-display text-4xl text-[#FCF6E0]">{initials}</span>
            </div>
          </div>

          <div className="pf-rise min-w-0 flex-1 pb-1" style={{ animationDelay: "80ms" }}>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate font-display text-3xl text-stone-900 md:text-4xl">{user.name}</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D4AF37]/50 bg-[#D4AF37]/10 px-3 py-1 text-xs font-medium text-[#6b5210]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#C9A227]" />
                {isOwner ? "Restaurant partner" : "Diner"}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {user.email && <CopyChip icon={I.mail} label={user.email} value={user.email} />}
              {user.phone && <CopyChip icon={I.phone} label={user.phone} value={user.phone} />}
              {accountId && <CopyChip icon={I.copy} label={`ID ${accountId.slice(-8)}`} value={accountId} mono />}
              {since && <span className="px-1 text-xs text-stone-500">Member since {since}</span>}
            </div>
          </div>

          <div className="pf-rise flex gap-2.5 pb-1" style={{ animationDelay: "140ms" }}>
            <button
              onClick={onLogout}
              className="rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-700 shadow-sm transition-colors hover:border-[#D4AF37] hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
            >
              Sign out
            </button>
            <Link
              to={isOwner ? "/owner" : "/restaurants"}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#E8CF7A] to-[#C9A227] px-5 py-2.5 text-sm font-semibold text-[#3d2e05] shadow-sm hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8a6d12]"
            >
              {isOwner ? "Open dashboard" : "Book a table"}
              <Icon d={I.arrow} className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
};

const Tabs = ({ tabs, active, onChange }) => {
  const onKeyDown = (e) => {
    const i = tabs.findIndex((t) => t.key === active);
    let n = null;
    if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = tabs.length - 1;
    if (n === null) return;
    e.preventDefault();
    onChange(tabs[n].key);
    requestAnimationFrame(() => document.getElementById(`pf-tab-${tabs[n].key}`)?.focus());
  };

  return (
    <div className="sticky top-16 z-20 mt-8 border-b border-stone-200 bg-[#FAF8F3]/85 backdrop-blur-md md:top-20">
      <div className="mx-auto flex max-w-6xl items-center justify-between overflow-x-auto px-6">
        <div role="tablist" aria-label="Profile sections" onKeyDown={onKeyDown} className="flex gap-7">
          {tabs.map((t, idx) => {
            const on = active === t.key;
            return (
              <button
                key={t.key}
                id={`pf-tab-${t.key}`}
                role="tab"
                aria-selected={on}
                tabIndex={on ? 0 : -1}
                onClick={() => onChange(t.key)}
                className={`relative whitespace-nowrap py-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:text-stone-900 ${
                  on ? "text-stone-900" : "text-stone-500 hover:text-stone-800"
                }`}
              >
                {t.label}
                {t.count > 0 && (
                  <span className="ml-2 rounded-full bg-[#D4AF37]/15 px-1.5 py-0.5 text-[10px] tabular-nums text-[#6b5210]">{t.count}</span>
                )}
                <kbd className="ml-2 hidden rounded border border-stone-200 bg-white px-1 font-mono text-[10px] text-stone-400 lg:inline">
                  {idx + 1}
                </kbd>
                {on && <span className="pf-underline absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-[#D4AF37] to-[#8a6d12]" />}
              </button>
            );
          })}
        </div>
        <span className="hidden whitespace-nowrap text-[11px] text-stone-400 xl:block">
          Press <kbd className="rounded border border-stone-200 bg-white px-1 font-mono">1</kbd>–
          <kbd className="rounded border border-stone-200 bg-white px-1 font-mono">{tabs.length}</kbd> to switch
        </span>
      </div>
    </div>
  );
};

/* ============================================================================
   Overview widgets
   ========================================================================== */

const NextTicket = ({ booking, now }) => {
  const d = new Date(`${booking.date}T00:00:00`);
  const m = money(booking);
  const items = orderLines(booking);
  return (
    <div className="pf-pop relative overflow-hidden rounded-3xl border border-[#D4AF37]/50 bg-gradient-to-br from-[#FFFBEB] via-[#F7EBC0] to-[#E8CF7A] text-stone-900 shadow-xl shadow-[#B8921F]/20">
      <div className="pf-cover-pattern absolute inset-0 opacity-60" aria-hidden="true" />
      <div className="relative flex flex-col sm:flex-row">
        <div className="flex-1 p-6 sm:p-7">
          <div className="flex items-center gap-2.5">
            <span className="rounded-full bg-[#3d2e05] px-3 py-1 text-xs font-semibold text-[#F7EBC0]">
              {timeUntil(bookingStart(booking).getTime() - now)}
            </span>
            <StatusPill status={booking.status} />
          </div>
          <p className="mt-4 truncate font-display text-2xl sm:text-3xl">{booking.restaurant?.name || "Your table"}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-stone-700">
            <Icon d={I.pin} className="h-4 w-4" />
            {[booking.restaurant?.address, booking.restaurant?.city].filter(Boolean).join(", ")}
          </p>

          <dl className="mt-5 grid grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-stone-600">Date</dt>
              <dd className="mt-1 font-medium">{formatDay(booking.date)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-stone-600">Time</dt>
              <dd className="mt-1 font-medium">{formatTime(booking.timeSlot)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-stone-600">Table · Guests</dt>
              <dd className="mt-1 font-medium">
                {booking.table?.tableNumber ?? "–"} · {booking.partySize}
              </dd>
            </div>
          </dl>

          {items.length > 0 && (
            <p className="mt-5 line-clamp-2 border-t border-[#8a6d12]/20 pt-4 text-xs text-stone-700">
              Pre-ordered: {items.map((i) => `${i.quantity}× ${i.name}${i.portion ? ` (${i.portion})` : ""}`).join(", ")}
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2.5">
            <button
              onClick={() => downloadCalendar(booking)}
              className="inline-flex items-center gap-2 rounded-full bg-white/60 px-4 py-2 text-xs font-medium text-stone-800 ring-1 ring-[#8a6d12]/20 transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8a6d12]"
            >
              <Icon d={I.calendar} className="h-4 w-4" /> Add to calendar
            </button>
            <a
              href={mapsUrl(booking)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-white/60 px-4 py-2 text-xs font-medium text-stone-800 ring-1 ring-[#8a6d12]/20 transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8a6d12]"
            >
              <Icon d={I.pin} className="h-4 w-4" /> Directions
            </a>
          </div>
        </div>

        {/* Stub */}
        <div className="relative flex flex-row items-center justify-between gap-4 border-t-2 border-dashed border-[#8a6d12]/30 p-6 sm:w-56 sm:flex-col sm:items-start sm:justify-center sm:border-l-2 sm:border-t-0">
          <span className="absolute -top-2.5 left-1/2 hidden h-5 w-5 -translate-x-1/2 rounded-full bg-[#FAF8F3] sm:block" aria-hidden="true" />
          <span className="absolute -bottom-2.5 left-1/2 hidden h-5 w-5 -translate-x-1/2 rounded-full bg-[#FAF8F3] sm:block" aria-hidden="true" />
          <div className="text-center sm:text-left">
            <p className="text-[11px] uppercase tracking-wider text-stone-600">Booking ref</p>
            <p className="mt-1 font-mono text-lg tracking-wider text-[#6b5210]">{bookingRef(booking)}</p>
            <p className="mt-0.5 text-[11px] text-stone-600/80">{d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
          </div>
          {m && (
            <div className="sm:mt-4">
              <p className="text-[11px] uppercase tracking-wider text-stone-600">Balance at venue</p>
              <p className="mt-1 font-display text-2xl">{formatINR(m.balance)}</p>
              <p className="text-[11px] text-stone-600/80">{formatINR(m.deposit)} deposit paid</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const NeedsAttention = ({ bookings, now }) => {
  const list = bookings
    .filter((b) => b.status === "pending")
    .sort((a, b) => bookingStart(a) - bookingStart(b));
  const top = list.slice(0, 5);

  return (
    <Card className="p-5">
      <CardTitle
        title="Needs your attention"
        hint={list.length ? `${list.length} booking${list.length !== 1 ? "s" : ""} awaiting your confirmation` : "Nothing waiting on you"}
        right={
          list.length > 0 && (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">{list.length} pending</span>
          )
        }
      />
      {list.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50/60 px-4 py-4 text-sm text-emerald-800">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
            <Icon d={I.check} className="h-4 w-4" />
          </span>
          You&apos;re all caught up. New booking requests will show up here.
        </div>
      ) : (
        <ul className="divide-y divide-stone-100">
          {top.map((b) => {
            const ms = bookingStart(b).getTime() - now;
            const overdue = ms + UPCOMING_GRACE_MS < 0;
            return (
              <li key={b._id} className="flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#D4AF37]/15 text-sm font-semibold text-[#6b5210]">
                  {(b.user?.name || "G")[0].toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-900">
                    {b.user?.name || "Guest"}
                    <span className="font-normal text-stone-400"> · {b.restaurantName}</span>
                  </p>
                  <p className="truncate text-xs text-stone-500">
                    {formatDay(b.date)} · {formatTime(b.timeSlot)} · {b.partySize} guest{b.partySize !== 1 ? "s" : ""}
                  </p>
                </div>
                <span
                  className={`hidden whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium sm:inline ${
                    overdue ? "bg-red-50 text-red-600" : "bg-stone-100 text-stone-600"
                  }`}
                >
                  {overdue ? "Overdue" : timeUntil(ms)}
                </span>
                <Link
                  to={`/owner/restaurants/${restaurantIdOf(b)}/manage?filter=pending`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#E8CF7A] to-[#C9A227] px-3.5 py-1.5 text-xs font-semibold text-[#3d2e05] shadow-sm hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8a6d12]"
                >
                  Review <Icon d={I.arrow} className="h-3.5 w-3.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {list.length > top.length && (
        <p className="mt-3 border-t border-stone-100 pt-3 text-center text-xs text-stone-500">
          +{list.length - top.length} more in{" "}
          <Link to="/profile?tab=bookings" className="font-medium text-[#8a6d12] hover:underline">Guest bookings</Link>
        </p>
      )}
    </Card>
  );
};

const BookAgain = ({ bookings }) => {
  const places = useMemo(() => {
    const seen = new Map();
    [...bookings]
      .filter((b) => b.status === "completed" || b.status === "confirmed")
      .sort((a, b) => bookingStart(b) - bookingStart(a))
      .forEach((b) => {
        const key = b.restaurant?._id || b.restaurant?.name;
        if (!key) return;
        const cur = seen.get(key);
        if (cur) cur.visits += 1;
        else seen.set(key, { key, name: b.restaurant?.name, city: b.restaurant?.city, image: b.restaurant?.image, last: b.date, visits: 1 });
      });
    return [...seen.values()].slice(0, 4);
  }, [bookings]);

  return (
    <Card className="p-5">
      <CardTitle title="Book again" hint="Places you've dined at" />
      {places.length === 0 ? (
        <p className="py-5 text-center text-sm text-stone-400">Restaurants you book will appear here for one-tap rebooking.</p>
      ) : (
        <ul className="space-y-1">
          {places.map((p) => (
            <li key={p.key}>
              <Link
                to={`/restaurants?search=${encodeURIComponent(p.name || "")}`}
                className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-[#FBF6E6]"
              >
                <Photo src={imageUrl(p.image)} alt={p.name || "Restaurant"} className="h-12 w-12 flex-shrink-0 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-900">{p.name}</p>
                  <p className="truncate text-xs text-stone-500">
                    {[p.city, `${p.visits} visit${p.visits !== 1 ? "s" : ""}`].filter(Boolean).join(" · ")} · last {formatDay(p.last)}
                  </p>
                </div>
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-stone-200 text-stone-400 transition-all group-hover:border-[#D4AF37] group-hover:bg-white group-hover:text-[#8a6d12]">
                  <Icon d={I.arrow} className="h-4 w-4" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 border-t border-stone-100 pt-3 text-xs text-stone-500">
        Need help with a booking?{" "}
        <Link to="/help" className="font-medium text-[#8a6d12] hover:underline">Contact support</Link>
      </p>
    </Card>
  );
};

const RevenueChart = ({ bookings }) => {
  const [hover, setHover] = useState(null);
  const days = useMemo(() => {
    const out = [];
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      out.push({ iso: localISO(d), d, value: 0 });
    }
    bookings
      .filter((b) => b.status === "confirmed" || b.status === "completed")
      .forEach((b) => {
        const day = out.find((x) => x.iso === b.date);
        if (day) day.value += Number(b.depositAmount) || 0;
      });
    return out;
  }, [bookings]);

  const total = days.reduce((s, d) => s + d.value, 0);
  const max = Math.max(...days.map((d) => d.value), 1);
  const W = 560;
  const H = 170;
  const bw = W / days.length;
  const active = hover !== null ? days[hover] : null;

  return (
    <Card className="p-5">
      <CardTitle
        title="Deposits received"
        hint="Last 14 days"
        right={
          <div className="text-right">
            <p className="font-display text-2xl text-stone-900">{formatINR(active ? active.value : total)}</p>
            <p className="text-xs text-stone-400">
              {active ? active.d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }) : "Total"}
            </p>
          </div>
        }
      />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Deposits received per day over the last 14 days">
        <defs>
          <linearGradient id="pf-bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D4AF37" />
            <stop offset="100%" stopColor="#8a6d12" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={W} y1={H - 22 - (H - 40) * g} y2={H - 22 - (H - 40) * g} stroke="#F0EBDD" strokeDasharray="3 4" />
        ))}
        {days.map((d, i) => {
          const h = d.value ? Math.max((d.value / max) * (H - 40), 4) : 2;
          return (
            <g key={d.iso} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * bw} y="0" width={bw} height={H} fill="transparent" />
              <rect
                className="pf-bar"
                style={{ animationDelay: `${i * 35}ms`, transition: "opacity .2s ease" }}
                x={i * bw + bw * 0.2}
                y={H - 22 - h}
                width={bw * 0.6}
                height={h}
                rx="4"
                fill={d.value ? "url(#pf-bar)" : "#EAE4D2"}
                opacity={hover === null || hover === i ? 1 : 0.45}
              />
              {i % 2 === 0 && (
                <text x={i * bw + bw / 2} y={H - 5} textAnchor="middle" fontSize="10" fill="#9a968a">
                  {d.d.getDate()}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </Card>
  );
};

const TodayList = ({ bookings }) => {
  const today = localISO();
  const list = bookings
    .filter((b) => b.date === today && (b.status === "confirmed" || b.status === "pending"))
    .sort((a, b) => bookingStart(a) - bookingStart(b));
  return (
    <Card className="p-5">
      <CardTitle title="Today" hint={`${list.length} reservation${list.length !== 1 ? "s" : ""}`} />
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-stone-400">No reservations today.</p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {list.slice(0, 6).map((b) => (
            <li key={b._id} className="flex items-center gap-3 py-3">
              <span className="w-16 flex-shrink-0 text-sm font-medium tabular-nums text-stone-900">{formatTime(b.timeSlot)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-stone-800">{b.user?.name || "Guest"}</p>
                <p className="truncate text-xs text-stone-400">
                  Table {b.table?.tableNumber} · {b.partySize} guests · {b.restaurantName}
                </p>
              </div>
              <span className={`h-2 w-2 flex-shrink-0 rounded-full ${(STATUS[b.status] || STATUS.pending).dot}`} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

const SortTh = ({ k, sort, onSort, children, align = "right", className = "" }) => (
  <th
    scope="col"
    aria-sort={sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    className={`py-2.5 font-medium ${align === "right" ? "text-right" : "text-left"} ${className}`}
  >
    <button
      onClick={() => onSort(k)}
      className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-stone-900 focus:outline-none focus-visible:text-stone-900 ${
        sort.key === k ? "text-stone-900" : ""
      }`}
    >
      {children}
      <span aria-hidden="true" className={`text-[9px] ${sort.key === k ? "opacity-100" : "opacity-0"}`}>
        {sort.dir === "asc" ? "▲" : "▼"}
      </span>
    </button>
  </th>
);

const RestaurantTable = ({ restaurants }) => {
  const [sort, setSort] = useState({ key: "deposits", dir: "desc" });

  const rows = useMemo(() => {
    const mapped = restaurants.map((r) => {
      const real = r.bookings.filter((b) => b.status !== "pending_payment");
      return {
        r,
        bookings: real.length,
        pending: real.filter((b) => b.status === "pending").length,
        deposits: real
          .filter((b) => b.status === "confirmed" || b.status === "completed")
          .reduce((s, b) => s + (Number(b.depositAmount) || 0), 0),
      };
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    return mapped.sort((a, b) =>
      sort.key === "name" ? dir * a.r.name.localeCompare(b.r.name) : dir * (a[sort.key] - b[sort.key])
    );
  }, [restaurants, sort]);

  const totals = rows.reduce(
    (t, x) => ({ bookings: t.bookings + x.bookings, pending: t.pending + x.pending, deposits: t.deposits + x.deposits }),
    { bookings: 0, pending: 0, deposits: 0 }
  );

  const toggle = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));

  return (
    <Card className="overflow-hidden">
      <div className="p-5 pb-3">
        <CardTitle title="Restaurant performance" hint={`${rows.length} restaurant${rows.length !== 1 ? "s" : ""} · all time`} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[540px] text-sm">
          <thead>
            <tr className="border-y border-stone-100 bg-[#FAF8F3] text-left text-[11px] text-stone-500">
              <SortTh k="name" sort={sort} onSort={toggle} align="left" className="px-5">Restaurant</SortTh>
              <SortTh k="bookings" sort={sort} onSort={toggle} className="px-3">Bookings</SortTh>
              <SortTh k="pending" sort={sort} onSort={toggle} className="px-3">Pending</SortTh>
              <SortTh k="deposits" sort={sort} onSort={toggle} className="px-5">Deposits</SortTh>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map(({ r, bookings, pending, deposits }) => (
              <tr key={r._id} className="transition-colors hover:bg-[#FBF6E6]/60">
                <td className="px-5 py-3">
                  <Link to={`/owner/restaurants/${r._id}/manage`} className="font-medium text-stone-900 hover:text-[#8a6d12]">
                    {r.name}
                  </Link>
                  <p className="text-xs text-stone-400">{r.city}</p>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{bookings}</td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {pending > 0 ? (
                    <span className="inline-flex min-w-[1.5rem] justify-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                      {pending}
                    </span>
                  ) : (
                    <span className="text-stone-300">0</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right font-medium tabular-nums">{formatINR(deposits)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-stone-200 bg-[#FAF8F3] text-xs font-semibold text-stone-700">
              <td className="px-5 py-2.5 uppercase tracking-wider text-stone-500">Total</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{totals.bookings}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{totals.pending}</td>
              <td className="px-5 py-2.5 text-right tabular-nums">{formatINR(totals.deposits)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
};

/* ============================================================================
   Bookings
   ========================================================================== */

const BookingTicketBase = ({ booking, isOwner, now, index }) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const d = new Date(`${booking.date}T00:00:00`);
  const m = money(booking);
  const lines = orderLines(booking);
  const upcoming = isUpcoming(booking, now);
  const title = isOwner ? booking.user?.name || "Guest" : booking.restaurant?.name || "Restaurant";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(bookingRef(booking));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <li className="pf-rise" style={{ animationDelay: `${Math.min(index, 6) * 50}ms` }}>
      <Card className={`overflow-hidden transition-shadow hover:shadow-md ${upcoming ? "border-[#D4AF37]/40" : ""}`}>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center gap-4 p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D4AF37]"
        >
          <div className="flex h-16 w-14 flex-shrink-0 flex-col items-center justify-center rounded-xl bg-[#D4AF37]/[0.12]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8a6d12]/80">
              {d.toLocaleDateString("en-IN", { month: "short" })}
            </span>
            <span className="font-display text-2xl leading-none text-[#8a6d12]">{d.getDate()}</span>
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-stone-900">
              {title}
              {isOwner && booking.restaurantName && <span className="font-normal text-stone-400"> · {booking.restaurantName}</span>}
            </p>
            <p className="mt-0.5 text-xs text-stone-500">
              {formatDay(booking.date)} · {formatTime(booking.timeSlot)} · Table {booking.table?.tableNumber} · {booking.partySize} guest
              {booking.partySize !== 1 ? "s" : ""}
            </p>
            <p className="mt-1 font-mono text-[11px] tracking-wide text-stone-400">{bookingRef(booking)}</p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <StatusPill status={booking.status} />
            <Icon d={I.chevron} className={`h-4 w-4 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`} />
          </div>
        </button>

        <div className={`pf-collapse${open ? " is-open" : ""}`}>
          <div>
          <div className="border-t border-dashed border-stone-200 bg-stone-50/50 p-4 sm:px-5">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-stone-500">Order</p>
                {lines.length === 0 ? (
                  <p className="text-sm text-stone-400">No pre-ordered dishes.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {lines.map((l, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span className="text-stone-700">
                          {l.quantity} × {l.name}
                          {l.portion && <span className="text-stone-400"> ({l.portion})</span>}
                        </span>
                        <span className="tabular-nums text-stone-900">{formatINR(l.line)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-stone-500">Payment</p>
                {m ? (
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-stone-500">Order total</dt>
                      <dd className="tabular-nums">{formatINR(m.subtotal)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-stone-500">Deposit paid online</dt>
                      <dd className="tabular-nums text-emerald-700">−{formatINR(m.deposit)}</dd>
                    </div>
                    <div className="flex justify-between border-t border-stone-200 pt-1.5 font-medium">
                      <dt>{booking.status === "cancelled" ? "Balance" : "Due at restaurant"}</dt>
                      <dd className="tabular-nums">{formatINR(m.balance)}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-sm text-stone-400">No payment recorded.</p>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                onClick={copy}
                className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3.5 py-1.5 text-xs font-medium text-stone-700 hover:border-[#D4AF37]"
              >
                <Icon d={I.copy} className="h-3.5 w-3.5" />
                {copied ? "Copied" : "Copy reference"}
              </button>
              {!isOwner && upcoming && (
                <>
                  <button
                    onClick={() => downloadCalendar(booking)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3.5 py-1.5 text-xs font-medium text-stone-700 hover:border-[#D4AF37]"
                  >
                    <Icon d={I.download} className="h-3.5 w-3.5" /> Add to calendar
                  </button>
                  <a
                    href={mapsUrl(booking)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3.5 py-1.5 text-xs font-medium text-stone-700 hover:border-[#D4AF37]"
                  >
                    <Icon d={I.pin} className="h-3.5 w-3.5" /> Directions
                  </a>
                </>
              )}
              {isOwner && (
                <Link
                  to={`/owner/restaurants/${restaurantIdOf(booking)}/manage`}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold bg-gradient-to-br from-[#E8CF7A] to-[#C9A227] text-[#3d2e05] shadow-sm hover:shadow-md"
                >
                  Manage booking <Icon d={I.arrow} className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          </div>
          </div>
        </div>
      </Card>
    </li>
  );
};

const BookingTicket = memo(BookingTicketBase);

const BookingsTab = ({ derived, isOwner, now, loading, error }) => {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState("newest");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const searchRef = useRef(null);

  useEffect(() => {
    setVisible(PAGE_SIZE);
    setOrder(filter === "upcoming" ? "oldest" : "newest");
  }, [filter]);
  useEffect(() => setVisible(PAGE_SIZE), [query, order]);

  // "/" focuses search (like GitHub, Linear, Stripe).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let rows = derived.byFilter[filter] || [];
    if (needle) {
      rows = rows.filter((b) =>
        [bookingRef(b), b.restaurant?.name, b.restaurantName, b.user?.name, b.user?.email].some(
          (v) => v && String(v).toLowerCase().includes(needle)
        )
      );
    }
    const dir = order === "newest" ? -1 : 1;
    return [...rows].sort((a, b) => dir * (bookingStart(a) - bookingStart(b)));
  }, [derived, filter, query, order]);

  const shown = list.slice(0, visible);
  const groups = [];
  shown.forEach((b, i) => {
    const key = bookingStart(b).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push({ b, i });
    else groups.push({ key, items: [{ b, i }] });
  });

  return (
    <section aria-label="Bookings">
      {/* Toolbar */}
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="group" aria-label="Filter bookings" className="inline-flex w-full overflow-x-auto rounded-xl border border-stone-200 bg-white p-1 shadow-sm lg:w-auto">
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                aria-pressed={on}
                className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${
                  on ? "bg-gradient-to-br from-[#F4E5AE] to-[#E2C25F] text-[#3d2e05] shadow-sm" : "text-stone-600 hover:bg-stone-50 hover:text-stone-900"
                }`}
              >
                {f.label}
                <span className={`ml-1.5 tabular-nums ${on ? "text-[#3d2e05]/60" : "text-stone-400"}`}>{derived.byFilter[f.key].length}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Icon d={I.search} className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && (setQuery(""), e.currentTarget.blur())}
              placeholder={isOwner ? "Search guest, restaurant or ref" : "Search restaurant or ref"}
              aria-label="Search bookings"
              className="peer h-9 w-full rounded-lg border border-stone-200 bg-white pl-9 pr-9 text-sm text-stone-800 shadow-sm placeholder:text-stone-400 focus:border-[#D4AF37] focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
            />
            {!query && (
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-stone-200 bg-stone-50 px-1.5 font-mono text-[10px] text-stone-400 transition-opacity peer-focus:opacity-0">
                /
              </kbd>
            )}
          </div>
          <button
            onClick={() => setOrder((o) => (o === "newest" ? "oldest" : "newest"))}
            className="inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 text-xs font-medium text-stone-700 shadow-sm hover:border-[#D4AF37] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
          >
            <Icon d={I.sort} className="h-3.5 w-3.5 text-stone-400" />
            {order === "newest" ? "Newest first" : filter === "upcoming" ? "Soonest first" : "Oldest first"}
          </button>
        </div>
      </div>

      <p className="mb-3 text-xs text-stone-500" aria-live="polite">
        {loading ? "Loading…" : `${list.length} booking${list.length !== 1 ? "s" : ""}${query ? ` matching “${query.trim()}”` : ""}`}
      </p>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        !error && (
          <Card className="border-dashed p-12 text-center">
            <p className="font-display text-lg text-stone-800">
              {query ? "No bookings match your search" : filter === "all" ? "No bookings yet" : `No ${filter} bookings`}
            </p>
            {query ? (
              <button onClick={() => setQuery("")} className="mt-3 text-sm font-medium text-[#8a6d12] hover:underline">
                Clear search
              </button>
            ) : (
              !isOwner &&
              filter === "all" && (
                <Link to="/restaurants" className="mt-4 inline-block rounded-full bg-gradient-to-br from-[#E8CF7A] to-[#C9A227] px-6 py-2.5 text-sm font-semibold text-[#3d2e05] shadow-sm hover:shadow-md">
                  Find a table
                </Link>
              )
            )}
          </Card>
        )
      ) : (
        <>
          <div className="space-y-6">
            {groups.map((g) => (
              <div key={g.key}>
                <h3 className="mb-2.5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                  {g.key}
                  <span className="h-px flex-1 bg-stone-200" aria-hidden="true" />
                  <span className="font-medium normal-case tracking-normal text-stone-400">{g.items.length}</span>
                </h3>
                <ul className="space-y-3">
                  {g.items.map(({ b, i }) => (
                    <BookingTicket key={b._id} booking={b} isOwner={isOwner} now={now} index={i} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {list.length > shown.length && (
            <div className="mt-6 text-center">
              <button
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
                className="rounded-full border border-stone-300 bg-white px-6 py-2.5 text-sm font-medium text-stone-700 shadow-sm hover:border-[#D4AF37]"
              >
                Show more ({list.length - shown.length} left)
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
};

/* ============================================================================
   Restaurants (owner)
   ========================================================================== */

const RestaurantsTab = ({ restaurants, loading }) => (
  <section aria-label="Restaurants" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
    {loading
      ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-64" />)
      : restaurants.map((r, i) => {
          const pending = r.bookings.filter((b) => b.status === "pending").length;
          return (
            <div key={r._id} className="pf-rise" style={{ animationDelay: `${i * 70}ms` }}>
              <Card className="group overflow-hidden transition-shadow hover:shadow-lg">
                <div className="relative h-40 overflow-hidden">
                  <Photo src={imageUrl(r.image)} alt={r.name} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  {pending > 0 && (
                    <span className="absolute right-3 top-3 rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-semibold text-stone-900">
                      {pending} pending
                    </span>
                  )}
                  <p className="absolute bottom-3 left-4 right-4 truncate font-display text-lg text-white">{r.name}</p>
                </div>
                <div className="flex items-center justify-between p-4">
                  <p className="text-xs text-stone-500">
                    {r.city} · {r.bookings.length} booking{r.bookings.length !== 1 ? "s" : ""}
                  </p>
                  <Link
                    to={`/owner/restaurants/${r._id}/manage`}
                    className="rounded-full px-4 py-2 text-xs font-semibold bg-gradient-to-br from-[#E8CF7A] to-[#C9A227] text-[#3d2e05] shadow-sm hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                  >
                    Manage
                  </Link>
                </div>
              </Card>
            </div>
          );
        })}
    {!loading && (
      <Link
        to="/owner/restaurants/new"
        className="flex min-h-[16rem] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 text-stone-500 transition-colors hover:border-[#D4AF37] hover:bg-[#D4AF37]/5 hover:text-[#8a6d12]"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-current text-xl" aria-hidden="true">
          +
        </span>
        <span className="text-sm font-medium">Add a restaurant</span>
      </Link>
    )}
  </section>
);

/* ============================================================================
   Settings (notifications + session only)
   ========================================================================== */

const Switch = ({ checked, onChange, label, hint }) => (
  <div className="flex items-center justify-between gap-6 py-4">
    <div>
      <p className="text-sm font-medium text-stone-900">{label}</p>
      <p className="mt-0.5 text-xs text-stone-500">{hint}</p>
    </div>
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2 ${
        checked ? "bg-[#C9A227]" : "bg-stone-300"
      }`}
    >
      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 ease-out ${checked ? "translate-x-5" : ""}`} />
    </button>
  </div>
);

const SettingsTab = ({ onLogout }) => {
  const [prefs, setPrefs] = useState(() => {
    try {
      return { confirmations: true, reminders: true, offers: false, ...JSON.parse(localStorage.getItem(NOTIF_KEY) || "{}") };
    } catch {
      return { confirmations: true, reminders: true, offers: false };
    }
  });

  const updatePref = (key, value) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      localStorage.setItem(NOTIF_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  return (
    <section aria-label="Settings" className="max-w-xl space-y-6">
      <Card className="px-6 py-2">
        <div className="pt-4">
          <CardTitle title="Notifications" />
        </div>
        <div className="divide-y divide-stone-100">
          <Switch label="Booking confirmations" hint="Email when a booking is confirmed or changed." checked={prefs.confirmations} onChange={(v) => updatePref("confirmations", v)} />
          <Switch label="Reservation reminders" hint="A nudge a few hours before you dine." checked={prefs.reminders} onChange={(v) => updatePref("reminders", v)} />
          <Switch label="Offers & news" hint="Occasional deals from restaurants you like." checked={prefs.offers} onChange={(v) => updatePref("offers", v)} />
        </div>
        <p className="pb-4 pt-2 text-[11px] text-stone-400">Saved on this device.</p>
      </Card>

      <Card className="p-6">
        <CardTitle title="Session" />
        <button
          onClick={onLogout}
          className="w-full rounded-full border border-red-200 px-5 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
        >
          Sign out
        </button>
      </Card>
    </section>
  );
};

/* ============================================================================
   Styles
   ========================================================================== */

const STYLES = `
  @keyframes pf-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pf-shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
  @keyframes pf-glow { 0%,100% { transform: translate(0,0); opacity: .9; } 50% { transform: translate(-30px,24px); opacity: 1; } }
  @keyframes pf-bar { from { transform: scaleY(0); } to { transform: scaleY(1); } }
  @keyframes pf-underline { from { transform: scaleX(0); } to { transform: scaleX(1); } }

  .pf-rise { opacity: 0; animation: pf-rise .6s cubic-bezier(.2,.7,.2,1) forwards; }
  .pf-glow { animation: pf-glow 14s ease-in-out infinite; }
  .pf-bar { transform-box: fill-box; transform-origin: bottom; animation: pf-bar .7s cubic-bezier(.2,.7,.2,1) both; }
  .pf-underline { transform-origin: left; animation: pf-underline .3s ease-out; }
  .pf-shimmer { background: linear-gradient(90deg, #EFEBE0 25%, #F8F5EC 50%, #EFEBE0 75%); background-size: 800px 100%; animation: pf-shimmer 1.4s infinite linear; }
  .pf-cover-pattern {
    background-image: radial-gradient(circle at 1px 1px, rgba(138,109,18,.14) 1px, transparent 0);
    background-size: 22px 22px;
  }
  .pf-grid {
    background-image:
      linear-gradient(rgba(138,109,18,.09) 1px, transparent 1px),
      linear-gradient(90deg, rgba(138,109,18,.09) 1px, transparent 1px);
    background-size: 32px 32px;
    -webkit-mask-image: radial-gradient(ellipse at 75% 0%, #000 15%, transparent 72%);
    mask-image: radial-gradient(ellipse at 75% 0%, #000 15%, transparent 72%);
  }
  @keyframes pf-spin { to { transform: rotate(360deg); } }
  .pf-spin { animation: pf-spin 8s linear infinite; }

  @keyframes pf-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes pf-pop { from { opacity: 0; transform: translateY(12px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes pf-pulse { 0% { transform: scale(1); opacity: .7; } 70%, 100% { transform: scale(1.18); opacity: 0; } }

  .pf-fade { animation: pf-fade .35s cubic-bezier(.2,.7,.2,1) both; }
  .pf-pop { animation: pf-pop .6s cubic-bezier(.2,.7,.2,1) both; }
  .pf-pulse { animation: pf-pulse 2.8s ease-out infinite; }

  /* Smooth open/close for booking details (animates height without measuring it) */
  .pf-collapse { display: grid; grid-template-rows: 0fr; transition: grid-template-rows .35s cubic-bezier(.2,.7,.2,1); }
  .pf-collapse.is-open { grid-template-rows: 1fr; }
  .pf-collapse > div { min-height: 0; overflow: hidden; visibility: hidden; transition: visibility 0s linear .35s; }
  .pf-collapse.is-open > div { visibility: visible; transition-delay: 0s; }

  /* Smooth hover and a small press effect on every button and link */
  .pf-root button, .pf-root a {
    transition-property: color, background-color, border-color, box-shadow, transform, opacity;
    transition-duration: .2s;
    transition-timing-function: ease;
  }
  .pf-root button:not(:disabled):not([aria-expanded]):not([role="tab"]):not([role="switch"]):active,
  .pf-root a.rounded-full:active { transform: scale(.97); }

  @media (prefers-reduced-motion: reduce) {
    .pf-rise { opacity: 1; animation: none; }
    .pf-fade, .pf-pop { animation: none; }
    .pf-glow, .pf-bar, .pf-underline, .pf-shimmer, .pf-pulse, .pf-spin { animation: none; }
    .pf-collapse, .pf-collapse > div, .pf-root button, .pf-root a, .pf-root circle { transition: none !important; }
  }
`;

class SectionBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    // Hook your error reporter (Sentry, etc.) in here.
    console.error("Profile section crashed:", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Card className="p-10 text-center">
        <p className="font-display text-lg text-stone-900">This section couldn&apos;t be displayed</p>
        <p className="mt-1.5 text-sm text-stone-500">Something unexpected happened. Your data is safe.</p>
        <button
          onClick={() => this.setState({ failed: false })}
          className="mt-5 rounded-full bg-gradient-to-br from-[#E8CF7A] to-[#C9A227] px-6 py-2.5 text-sm font-semibold text-[#3d2e05] shadow-sm hover:shadow-md"
        >
          Try again
        </button>
      </Card>
    );
  }
}

const timeAgo = (t, now) => {
  const s = Math.max(Math.floor((now - t) / 1000), 0);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
};

/* ============================================================================
   Page
   ========================================================================== */

const Profile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const isOwner = user?.role === "owner";

  const { loading, error, failed, bookings, restaurants, reload, updatedAt } = useProfileData(user, isOwner);
  const now = useNow();

  useEffect(() => {
    document.title = "Your profile · BhookLagi";
  }, []);

  const derived = useMemo(() => {
    const t = Date.now();
    const real = bookings.filter((b) => b.status !== "pending_payment");
    const sorted = [...real].sort((a, b) => bookingStart(b) - bookingStart(a));
    const upcoming = real.filter((b) => isUpcoming(b, t)).sort((a, b) => bookingStart(a) - bookingStart(b));
    const completed = real.filter((b) => b.status === "completed");
    const cancelled = real.filter((b) => b.status === "cancelled");
    const pending = real.filter((b) => b.status === "pending");
    const paid = real
      .filter((b) => b.status === "confirmed" || b.status === "completed")
      .reduce((s, b) => s + (Number(b.depositAmount) || 0), 0);
    const dayKeys = Array.from({ length: 14 }, (_, i) => localISO(new Date(t - (13 - i) * 86400000)));
    const countByDay = {};
    const depositByDay = {};
    real.forEach((b) => {
      countByDay[b.date] = (countByDay[b.date] || 0) + 1;
      if (b.status === "confirmed" || b.status === "completed") depositByDay[b.date] = (depositByDay[b.date] || 0) + (Number(b.depositAmount) || 0);
    });
    const series = { count: dayKeys.map((k) => countByDay[k] || 0), deposits: dayKeys.map((k) => depositByDay[k] || 0) };
    return { real, upcoming, completed, cancelled, pending, paid, series, byFilter: { all: sorted, upcoming, completed, cancelled } };
  }, [bookings]);

  // Keyboard shortcuts: press 1-4 to jump between tabs (ignored while typing).
  useEffect(() => {
    const keys = ["overview", "bookings", ...(isOwner ? ["restaurants"] : []), "settings"];
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      const n = Number(e.key);
      if (n >= 1 && n <= keys.length) setParams(keys[n - 1] === "overview" ? {} : { tab: keys[n - 1] }, { replace: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOwner, setParams]);

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-6 py-32 text-center">
        <p className="mb-4 text-stone-500">Sign in to see your profile.</p>
        <Link to="/login" className="rounded-full px-6 py-2.5 text-sm font-semibold bg-gradient-to-br from-[#E8CF7A] to-[#C9A227] text-[#3d2e05] shadow-sm hover:shadow-md">
          Sign in
        </Link>
      </div>
    );
  }

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "bookings", label: isOwner ? "Guest bookings" : "My bookings", count: derived.upcoming.length },
    ...(isOwner ? [{ key: "restaurants", label: "Restaurants", count: restaurants.length }] : []),
    { key: "settings", label: "Settings" },
  ];
  const requested = params.get("tab");
  const tab = tabs.some((t) => t.key === requested) ? requested : "overview";
  const setTab = (key) => setParams(key === "overview" ? {} : { tab: key }, { replace: true });

  const handleLogout = () => {
    logout?.();
    navigate("/");
  };

  const stats = isOwner
    ? [
        { label: "Restaurants", value: restaurants.length, icon: <Icon d={I.store} /> },
        { label: "Total bookings", value: derived.real.length, hint: `${derived.upcoming.length} upcoming`, series: derived.series.count, icon: <Icon d={I.calendar} /> },
        { label: "Awaiting your action", value: derived.pending.length, hint: derived.pending.length ? "Needs a decision" : "All caught up", icon: <Icon d={I.clock} /> },
        { label: "Deposits received", value: derived.paid, prefix: "₹", series: derived.series.deposits, icon: <Icon d={I.wallet} /> },
      ]
    : [
        { label: "Total bookings", value: derived.real.length, icon: <Icon d={I.calendar} /> },
        { label: "Upcoming", value: derived.upcoming.length, hint: derived.upcoming[0] ? `Next: ${formatDay(derived.upcoming[0].date)}` : "Nothing scheduled", icon: <Icon d={I.clock} /> },
        { label: "Meals enjoyed", value: derived.completed.length, icon: <Icon d={I.check} /> },
        { label: "Deposits paid", value: derived.paid, prefix: "₹", icon: <Icon d={I.wallet} /> },
      ];

  const recent = derived.byFilter.all.slice(0, 3);

  return (
    <main className="pf-root min-h-screen bg-[#FAF8F3] pb-20">
      <style>{STYLES}</style>

      <Header user={user} isOwner={isOwner} onLogout={handleLogout} />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      <div className="mx-auto max-w-6xl space-y-6 px-6 pt-8">
        {error && (
          <Banner action={<button onClick={reload} className="whitespace-nowrap font-semibold underline underline-offset-2">Try again</button>}>
            {error}
          </Banner>
        )}
        {!error && failed > 0 && (
          <Banner tone="warn" action={<button onClick={reload} className="whitespace-nowrap font-semibold underline underline-offset-2">Retry</button>}>
            Bookings for {failed} restaurant{failed !== 1 ? "s" : ""} couldn&apos;t be loaded, so totals may be incomplete.
          </Banner>
        )}

        {tab !== "settings" && (
          <div className="flex items-center justify-between gap-3 text-xs text-stone-500">
            <span aria-live="polite">{loading ? "Syncing…" : updatedAt ? `Updated ${timeAgo(updatedAt, now)}` : ""}</span>
            <button
              onClick={reload}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 font-medium text-stone-700 shadow-sm hover:border-[#D4AF37] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
            >
              <Icon d={I.refresh} className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        )}

        <SectionBoundary key={tab}>
        <div className="pf-fade space-y-6">
        {tab === "overview" && (
          <>
            <section aria-label="Summary" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {loading
                ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36" />)
                : stats.map((s, i) => <StatTile key={s.label} {...s} delay={i * 70} />)}
            </section>

            {isOwner ? (
              <>
                {!loading && <NeedsAttention bookings={derived.real} now={now} />}
                <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
                  {loading ? <Skeleton className="h-72" /> : <RevenueChart bookings={derived.real} />}
                  {loading ? <Skeleton className="h-72" /> : <TodayList bookings={derived.real} />}
                </div>
                {!loading && restaurants.length > 0 && <RestaurantTable restaurants={restaurants} />}
              </>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
                <div className="space-y-6">
                  <div>
                    <h2 className="mb-3 font-display text-lg text-stone-900">Your next reservation</h2>
                    {loading ? (
                      <Skeleton className="h-64" />
                    ) : derived.upcoming.length > 0 ? (
                      <NextTicket booking={derived.upcoming[0]} now={now} />
                    ) : (
                      !error && (
                        <Card className="border-dashed p-12 text-center">
                          <p className="font-display text-lg text-stone-800">Nothing on the calendar</p>
                          <p className="mt-1.5 text-sm text-stone-500">Pick a table, order ahead, and it will appear here.</p>
                          <Link to="/restaurants" className="mt-5 inline-block rounded-full bg-gradient-to-br from-[#E8CF7A] to-[#C9A227] text-[#3d2e05] px-6 py-2.5 text-sm font-semibold shadow-sm hover:shadow-md">
                            Browse restaurants
                          </Link>
                        </Card>
                      )
                    )}
                  </div>

                  {!loading && recent.length > 0 && (
                    <div>
                      <div className="mb-3 flex items-center justify-between">
                        <h2 className="font-display text-lg text-stone-900">Recent activity</h2>
                        <button onClick={() => setTab("bookings")} className="text-xs font-medium text-[#8a6d12] hover:underline">
                          View all
                        </button>
                      </div>
                      <ul className="space-y-3">
                        {recent.map((b, i) => (
                          <BookingTicket key={b._id} booking={b} isOwner={false} now={now} index={i} />
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                {loading ? <Skeleton className="h-72" /> : <BookAgain bookings={derived.real} />}
              </div>
            )}
          </>
        )}

        {tab === "bookings" && <BookingsTab derived={derived} isOwner={isOwner} now={now} loading={loading} error={error} />}
        {tab === "restaurants" && isOwner && <RestaurantsTab restaurants={restaurants} loading={loading} />}
        {tab === "settings" && <SettingsTab onLogout={handleLogout} />}
        </div>
        </SectionBoundary>
      </div>
    </main>
  );
};

export default Profile;