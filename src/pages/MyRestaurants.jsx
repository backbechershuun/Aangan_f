import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/axios.js";

/* ============================================================================
   Config
   ========================================================================== */

const ENDPOINTS = {
  mine: "/restaurants/mine",
  bookings: (id) => `/bookings/restaurant/${id}`,
};

const VIEW_KEY = "bl_owner_restaurants_view";

const SORTS = [
  { key: "name", label: "Name (A–Z)" },
  { key: "pending", label: "Most pending" },
  { key: "rating", label: "Highest rated" },
  { key: "reviews", label: "Most reviewed" },
];

/* ============================================================================
   Helpers
   ========================================================================== */

const plural = (n, word) => `${n} ${word}${n !== 1 ? "s" : ""}`;

const readView = () => {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
};

const isTypingTarget = (t) => !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

/* ============================================================================
   Data
   ========================================================================== */

const useMyRestaurants = () => {
  const [state, setState] = useState({ loading: true, error: "", restaurants: [], pending: {}, pendingReady: false });

  const load = useCallback(async (signal) => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const { data } = await api.get(ENDPOINTS.mine, { signal });
      if (signal.aborted) return;
      // Show restaurants immediately; pending counts stream in afterwards.
      setState({ loading: false, error: "", restaurants: data, pending: {}, pendingReady: false });

      const results = await Promise.allSettled(data.map((r) => api.get(ENDPOINTS.bookings(r._id), { signal })));
      if (signal.aborted) return;
      const pending = {};
      data.forEach((r, i) => {
        const res = results[i];
        pending[r._id] = res.status === "fulfilled" ? res.value.data.filter((b) => b.status === "pending").length : 0;
      });
      setState((s) => ({ ...s, pending, pendingReady: true }));
    } catch (err) {
      if (signal.aborted) return;
      setState((s) => ({
        ...s,
        loading: false,
        error: err.response?.data?.message || "We couldn't load your restaurants. Check your connection and try again.",
      }));
    }
  }, []);

  useEffect(() => {
    const c = new AbortController();
    load(c.signal);
    return () => c.abort();
  }, [load]);

  return { ...state, reload: useCallback(() => load(new AbortController().signal), [load]) };
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
  plus: "M12 4v16m8-8H4",
  search: "M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14z",
  pin: "M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zm0-8.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  arrow: "M5 12h14m-6-6l6 6-6 6",
  refresh: "M4 4v5h.6m14.8 2A8 8 0 004.6 9m0 0H9m11 11v-5h-.6m0 0a8 8 0 01-14.8-2m14.8 2H15",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  list: "M4 6h16M4 12h16M4 18h16",
  store: "M4 9l1-5h14l1 5M4 9v11h16V9M4 9h16M9 20v-6h6v6",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z",
  chat: "M8 10h8M8 14h5m-9 6l2.5-3H18a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v14z",
  clock: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  alert: "M12 9v4m0 4h.01M10.3 4.3L2.6 18a2 2 0 001.7 3h15.4a2 2 0 001.7-3L13.7 4.3a2 2 0 00-3.4 0z",
};

const PRIMARY_BTN =
  "inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-br from-[#E8CF7A] to-[#C9A227] px-5 py-2.5 text-sm font-semibold text-[#3d2e05] shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8a6d12] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAF8F3]";

const Photo = ({ src, alt, className = "" }) => {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex items-center justify-center bg-gradient-to-br from-[#F7F4EA] to-[#EFEBE0] text-3xl text-stone-300 ${className}`}
      >
        🍽️
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={className} />;
};

const Chip = ({ tone = "light", children }) => {
  const tones = {
    light: "bg-white/95 text-stone-900 shadow-md backdrop-blur-sm",
    amber: "bg-amber-500 text-stone-900 shadow-md",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none ${tones[tone]}`}>
      {children}
    </span>
  );
};

/* ============================================================================
   Loading / empty / error
   ========================================================================== */

const Skeleton = ({ className }) => <div className={`mr-shimmer rounded-2xl ${className}`} aria-hidden="true" />;

const LoadingState = () => (
  <div aria-busy="true" aria-label="Loading restaurants">
    <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-72" />
      ))}
    </div>
  </div>
);

const EmptyState = () => (
  <div className="mr-fade rounded-3xl border border-dashed border-stone-300 bg-white px-6 py-20 text-center">
    <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F4E5AE]/70 to-[#E2C25F]/50 text-[#6b5210]">
      <Icon d={I.store} className="h-7 w-7" />
    </div>
    <h2 className="font-display text-2xl text-stone-900">Add your first restaurant</h2>
    <p className="mx-auto mt-2 max-w-sm text-sm text-stone-500">
      Set up your tables and time slots, and guests can start booking in minutes.
    </p>
    <Link to="/owner/restaurants/new" className={`${PRIMARY_BTN} mt-6`}>
      <Icon d={I.plus} className="h-4 w-4" />
      Add restaurant
    </Link>
  </div>
);

const ErrorState = ({ message, onRetry }) => (
  <div role="alert" className="mr-fade flex flex-col items-center rounded-3xl border border-red-200 bg-red-50/60 px-6 py-16 text-center">
    <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
      <Icon d={I.alert} className="h-6 w-6" />
    </span>
    <h2 className="font-display text-xl text-stone-900">Couldn&apos;t load your restaurants</h2>
    <p className="mt-1.5 max-w-md text-sm text-stone-600">{message}</p>
    <button onClick={onRetry} className={`${PRIMARY_BTN} mt-5`}>
      <Icon d={I.refresh} className="h-4 w-4" />
      Try again
    </button>
  </div>
);

/* ============================================================================
   Summary
   ========================================================================== */

const SummaryTile = ({ icon, label, value, hint, tone }) => (
  <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(90,70,10,0.06)]">
    <div className="flex items-center gap-3">
      <span
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${
          tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-gradient-to-br from-[#F4E5AE]/70 to-[#E2C25F]/50 text-[#6b5210]"
        }`}
      >
        <Icon d={icon} className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0">
        <p className="font-display text-2xl leading-none tabular-nums text-stone-900">{value}</p>
        <p className="mt-1 truncate text-xs text-stone-500">{label}</p>
      </div>
    </div>
    {hint && <p className="mt-2 truncate text-[11px] text-stone-400">{hint}</p>}
  </div>
);

/* ============================================================================
   Restaurant views
   ========================================================================== */

const RestaurantCard = memo(({ r, pending, pendingReady, index }) => (
  <Link
    to={`/owner/restaurants/${r._id}/manage`}
    className="mr-rise group flex flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_1px_2px_rgba(90,70,10,0.06)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#D4AF37]/50 hover:shadow-xl hover:shadow-[#B8921F]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
    style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
  >
    <div className="relative aspect-[16/10] overflow-hidden bg-stone-100">
      <Photo
        src={r.image}
        alt={r.name}
        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      {pending > 0 && (
        <span className="absolute left-3 top-3">
          <Chip tone="amber">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-stone-900" />
            {pending} pending
          </Chip>
        </span>
      )}
      {r.numReviews > 0 && (
        <span className="absolute right-3 top-3">
          <Chip>
            <span className="text-amber-400">★</span>
            {Number(r.rating || 0).toFixed(1)}
          </Chip>
        </span>
      )}
    </div>

    <div className="flex flex-1 flex-col p-4">
      <h3 className="truncate font-display text-lg text-stone-900">{r.name}</h3>
      <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-stone-500">
        <Icon d={I.pin} className="h-3.5 w-3.5 flex-shrink-0 text-stone-400" />
        {r.city || "Location not set"}
      </p>

      <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
        <p className="flex items-center gap-2 text-xs text-stone-500">
          {r.priceRange && <span className="font-medium text-stone-700">{r.priceRange}</span>}
          {r.priceRange && <span aria-hidden="true">·</span>}
          <span>{plural(r.numReviews || 0, "review")}</span>
        </p>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#8a6d12] opacity-70 transition-all group-hover:translate-x-0.5 group-hover:opacity-100">
          Manage <Icon d={I.arrow} className="h-3.5 w-3.5" />
        </span>
      </div>
      {!pendingReady && <span className="sr-only">Checking pending bookings</span>}
    </div>
  </Link>
));

const RestaurantRow = memo(({ r, pending, index }) => (
  <Link
    to={`/owner/restaurants/${r._id}/manage`}
    className="mr-rise group flex items-center gap-4 rounded-2xl border border-stone-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(90,70,10,0.06)] transition-all duration-200 hover:border-[#D4AF37]/50 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
    style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
  >
    <Photo src={r.image} alt={r.name} className="h-16 w-20 flex-shrink-0 rounded-xl object-cover" />
    <div className="min-w-0 flex-1">
      <h3 className="truncate font-display text-base text-stone-900">{r.name}</h3>
      <p className="truncate text-xs text-stone-500">
        {[r.city, r.priceRange].filter(Boolean).join(" · ") || "—"}
      </p>
    </div>
    <div className="hidden items-center gap-6 text-xs text-stone-500 sm:flex">
      <span className="flex w-16 items-center gap-1 tabular-nums">
        <span className="text-amber-400">★</span>
        {r.numReviews > 0 ? Number(r.rating || 0).toFixed(1) : "—"}
      </span>
      <span className="w-20 tabular-nums">{plural(r.numReviews || 0, "review")}</span>
    </div>
    {pending > 0 ? (
      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">{pending} pending</span>
    ) : (
      <span className="hidden w-[4.5rem] sm:block" aria-hidden="true" />
    )}
    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-stone-200 text-stone-400 transition-all group-hover:border-[#D4AF37] group-hover:text-[#8a6d12]">
      <Icon d={I.arrow} className="h-4 w-4" />
    </span>
  </Link>
));

const AddTile = () => (
  <Link
    to="/owner/restaurants/new"
    className="group flex min-h-[18rem] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-stone-300 bg-white/40 text-stone-500 transition-all duration-200 hover:border-[#D4AF37] hover:bg-[#FBF6E6]/60 hover:text-[#6b5210] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
  >
    <span className="flex h-12 w-12 items-center justify-center rounded-full border border-current transition-transform duration-300 group-hover:rotate-90">
      <Icon d={I.plus} />
    </span>
    <span className="text-sm font-medium">Add another restaurant</span>
  </Link>
);

/* ============================================================================
   Styles
   ========================================================================== */

const STYLES = `
  @keyframes mr-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes mr-shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
  @keyframes mr-glow { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-26px,18px); } }

  .mr-rise { opacity: 0; animation: mr-rise .55s cubic-bezier(.2,.7,.2,1) forwards; }
  .mr-fade { animation: mr-rise .4s cubic-bezier(.2,.7,.2,1) both; }
  .mr-glow { animation: mr-glow 14s ease-in-out infinite; }
  .mr-shimmer { background: linear-gradient(90deg, #EFEBE0 25%, #F8F5EC 50%, #EFEBE0 75%); background-size: 800px 100%; animation: mr-shimmer 1.4s infinite linear; }
  .mr-grid {
    background-image:
      linear-gradient(rgba(138,109,18,.08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(138,109,18,.08) 1px, transparent 1px);
    background-size: 32px 32px;
    -webkit-mask-image: radial-gradient(ellipse at 85% 0%, #000 10%, transparent 70%);
    mask-image: radial-gradient(ellipse at 85% 0%, #000 10%, transparent 70%);
  }

  @media (prefers-reduced-motion: reduce) {
    .mr-rise { opacity: 1; animation: none; }
    .mr-fade, .mr-glow, .mr-shimmer { animation: none; }
  }
`;

/* ============================================================================
   Page
   ========================================================================== */

const MyRestaurants = () => {
  const { loading, error, restaurants, pending, pendingReady, reload } = useMyRestaurants();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("name");
  const [view, setView] = useState(readView);
  const searchRef = useRef(null);

  useEffect(() => {
    document.title = "My restaurants · BhookLagi Partner";
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* storage unavailable */
    }
  }, [view]);

  // "/" focuses search; "n" starts a new restaurant (ignored while typing).
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const totals = useMemo(() => {
    const reviews = restaurants.reduce((s, r) => s + (r.numReviews || 0), 0);
    const weighted = restaurants.reduce((s, r) => s + (r.rating || 0) * (r.numReviews || 0), 0);
    return {
      reviews,
      avg: reviews ? weighted / reviews : 0,
      pending: Object.values(pending).reduce((s, n) => s + n, 0),
    };
  }, [restaurants, pending]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = needle
      ? restaurants.filter((r) => [r.name, r.city].some((v) => v && String(v).toLowerCase().includes(needle)))
      : restaurants;
    const cmp = {
      name: (a, b) => (a.name || "").localeCompare(b.name || ""),
      rating: (a, b) => (b.rating || 0) - (a.rating || 0) || (a.name || "").localeCompare(b.name || ""),
      reviews: (a, b) => (b.numReviews || 0) - (a.numReviews || 0) || (a.name || "").localeCompare(b.name || ""),
      pending: (a, b) => (pending[b._id] || 0) - (pending[a._id] || 0) || (a.name || "").localeCompare(b.name || ""),
    }[sort];
    return [...rows].sort(cmp);
  }, [restaurants, query, sort, pending]);

  const hasData = !loading && !error && restaurants.length > 0;

  return (
    <main className="min-h-screen bg-[#FAF8F3] pb-20">
      <style>{STYLES}</style>

      {/* ---------- Page header ---------- */}
      <header className="relative overflow-hidden border-b border-stone-200/80 bg-gradient-to-br from-[#FFFBEB] via-[#F9F0CF] to-[#F1DD94]">
        <div className="mr-grid absolute inset-0" aria-hidden="true" />
        <div className="mr-glow absolute -right-16 -top-28 h-80 w-80 rounded-full bg-white/70 blur-3xl" aria-hidden="true" />
        <div className="relative mx-auto max-w-6xl px-6 pb-8 pt-8 md:pb-10">
          

          <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-3xl text-stone-900 md:text-4xl">My Restaurants</h1>
              <p className="mt-1.5 text-sm text-stone-600">
                {loading
                  ? "Loading your restaurants…"
                  : restaurants.length
                  ? `${plural(restaurants.length, "restaurant")}${totals.pending ? ` · ${totals.pending} booking${totals.pending !== 1 ? "s" : ""} need your attention` : ""}`
                  : "Manage tables, time slots and bookings in one place."}
              </p>
            </div>
            {!error && (
              <Link to="/owner/restaurants/new" className={`${PRIMARY_BTN} self-start sm:self-auto`}>
                <Icon d={I.plus} className="h-4 w-4" />
                Add restaurant
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 pt-8">
        {loading && <LoadingState />}
        {error && <ErrorState message={error} onRetry={reload} />}
        {!loading && !error && restaurants.length === 0 && <EmptyState />}

        {hasData && (
          <>
            {/* ---------- Summary ---------- */}
            <section aria-label="Summary" className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <SummaryTile icon={I.store} label="Restaurants" value={restaurants.length} />
              <SummaryTile
                icon={I.clock}
                tone={totals.pending > 0 ? "amber" : undefined}
                label="Pending bookings"
                value={pendingReady ? totals.pending : "…"}
                hint={pendingReady ? (totals.pending ? "Awaiting your decision" : "All caught up") : "Checking…"}
              />
              <SummaryTile
                icon={I.star}
                label="Average rating"
                value={totals.reviews ? totals.avg.toFixed(1) : "—"}
                hint={totals.reviews ? "Weighted by reviews" : "No reviews yet"}
              />
              <SummaryTile icon={I.chat} label="Total reviews" value={totals.reviews.toLocaleString("en-IN")} />
            </section>

            {/* ---------- Toolbar ---------- */}
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-xs">
                <Icon d={I.search} className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && (setQuery(""), e.currentTarget.blur())}
                  placeholder="Search by name or city"
                  aria-label="Search restaurants"
                  className="peer h-10 w-full rounded-lg border border-stone-200 bg-white pl-9 pr-9 text-sm text-stone-800 shadow-sm placeholder:text-stone-400 focus:border-[#D4AF37] focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                />
                {!query && (
                  <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-stone-200 bg-stone-50 px-1.5 font-mono text-[10px] text-stone-400 transition-opacity peer-focus:opacity-0">
                    /
                  </kbd>
                )}
              </div>

              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor="mr-sort">Sort restaurants</label>
                <select
                  id="mr-sort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="h-10 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700 shadow-sm focus:border-[#D4AF37] focus:outline-none focus:ring-1 focus:ring-[#D4AF37]"
                >
                  {SORTS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>

                <div role="group" aria-label="Layout" className="inline-flex rounded-lg border border-stone-200 bg-white p-0.5 shadow-sm">
                  {[
                    { key: "grid", icon: I.grid, label: "Grid view" },
                    { key: "list", icon: I.list, label: "List view" },
                  ].map((v) => (
                    <button
                      key={v.key}
                      onClick={() => setView(v.key)}
                      aria-pressed={view === v.key}
                      aria-label={v.label}
                      title={v.label}
                      className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${
                        view === v.key ? "bg-gradient-to-br from-[#F4E5AE] to-[#E2C25F] text-[#3d2e05]" : "text-stone-400 hover:text-stone-700"
                      }`}
                    >
                      <Icon d={v.icon} className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <p className="mb-3 text-xs text-stone-500" aria-live="polite">
              {query ? `${plural(visible.length, "result")} for “${query.trim()}”` : plural(visible.length, "restaurant")}
            </p>

            {/* ---------- Results ---------- */}
            {visible.length === 0 ? (
              <div className="mr-fade rounded-2xl border border-dashed border-stone-300 bg-white px-6 py-16 text-center">
                <p className="font-display text-lg text-stone-800">No restaurants match “{query.trim()}”</p>
                <button onClick={() => setQuery("")} className="mt-3 text-sm font-medium text-[#8a6d12] hover:underline">
                  Clear search
                </button>
              </div>
            ) : view === "grid" ? (
              <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((r, i) => (
                  <li key={r._id} className="flex">
                    <div className="flex w-full flex-col [&>a]:flex-1">
                      <RestaurantCard r={r} pending={pending[r._id] || 0} pendingReady={pendingReady} index={i} />
                    </div>
                  </li>
                ))}
                {!query && (
                  <li className="flex flex-col [&>a]:flex-1">
                    <AddTile />
                  </li>
                )}
              </ul>
            ) : (
              <ul className="space-y-3">
                {visible.map((r, i) => (
                  <li key={r._id}>
                    <RestaurantRow r={r} pending={pending[r._id] || 0} index={i} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </main>
  );
};

export default MyRestaurants;