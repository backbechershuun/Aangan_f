import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/axios.js";
import RestaurantCard from "../components/RestaurantCard.jsx";

/* ------------------------------------------------------------------ */
/*  Constants & helpers                                                */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 50; // restaurants shown at once (and added per "Show more")
const SEARCH_DELAY = 400;

const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu and Kashmir", "Chandigarh", "Puducherry",
];

const SORTS = [
  { value: "recommended", label: "Recommended" },
  { value: "rating", label: "Top rated" },
  { value: "reviews", label: "Most reviewed" },
  { value: "name", label: "Name (A–Z)" },
];

/* Accepts an array, a comma separated string, or nothing */
const normalizeCuisines = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string")
    return value.split(",").map((c) => c.trim()).filter(Boolean);
  return [];
};

/* The API may return a bare array or { restaurants: [...] } */
const normalizeResponse = (data) =>
  Array.isArray(data) ? data : Array.isArray(data?.restaurants) ? data.restaurants : [];

const isCanceled = (err) =>
  err?.code === "ERR_CANCELED" || err?.name === "CanceledError" || err?.name === "AbortError";

const compact = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== "" && v != null));

/* Returns the value after it has stopped changing, plus a way to apply it immediately */
function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return [debounced, setDebounced];
}

/* ------------------------------------------------------------------ */
/*  Animations (self-contained, no Tailwind config changes needed)     */
/* ------------------------------------------------------------------ */

const RL_CSS = `
@keyframes rlFadeUp  { from { opacity: 0; transform: translateY(18px) } to { opacity: 1; transform: none } }
@keyframes rlFade    { from { opacity: 0 } to { opacity: 1 } }
@keyframes rlSheetUp { from { transform: translateY(100%) } to { transform: none } }
@keyframes rlBlob    { 0%,100% { transform: translate(0,0) scale(1) } 33% { transform: translate(26px,-34px) scale(1.1) } 66% { transform: translate(-22px,18px) scale(.95) } }
@keyframes rlFloat   { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } }
@keyframes rlPan     { 0% { background-position: 0% 50% } 50% { background-position: 100% 50% } 100% { background-position: 0% 50% } }

.rl-card     { opacity: 0; animation: rlFadeUp .55s cubic-bezier(.2,.7,.2,1) forwards; }
.rl-fade-in  { animation: rlFade .25s ease-out both; }
.rl-sheet    { animation: rlSheetUp .35s cubic-bezier(.2,.8,.2,1) both; }
.rl-blob     { animation: rlBlob 16s ease-in-out infinite; }
.rl-float    { animation: rlFloat 4s ease-in-out infinite; }
.rl-gradtext { background-size: 200% 200%; animation: rlPan 6s ease infinite; }

.rl-hide-scroll { scrollbar-width: none; }
.rl-hide-scroll::-webkit-scrollbar { display: none; }

/* Soft fade at the edges of horizontally scrolling rows (phones only) */
.rl-scroll-fade {
  -webkit-mask-image: linear-gradient(to right, transparent 0, black 14px, black calc(100% - 28px), transparent 100%);
  mask-image: linear-gradient(to right, transparent 0, black 14px, black calc(100% - 28px), transparent 100%);
}
@media (min-width: 640px) {
  .rl-scroll-fade { -webkit-mask-image: none; mask-image: none; }
}

@media (prefers-reduced-motion: reduce) {
  .rl-card, .rl-fade-in, .rl-sheet, .rl-blob, .rl-float, .rl-gradtext {
    animation: none !important; opacity: 1 !important;
  }
}
`;

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

const Icon = ({ children, className = "h-5 w-5" }) => (
  <svg
    viewBox="0 0 24 24"
    className={`${className} fill-none stroke-current`}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const SearchIcon = ({ className }) => (
  <Icon className={className}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </Icon>
);

const PinIcon = () => (
  <Icon>
    <path d="M12 21s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z" />
    <circle cx="12" cy="9" r="2.5" />
  </Icon>
);

const MapIcon = () => (
  <Icon>
    <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" />
  </Icon>
);

const CloseIcon = ({ className }) => (
  <Icon className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

const FilterIcon = ({ className }) => (
  <Icon className={className}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </Icon>
);

/* ------------------------------------------------------------------ */
/*  Pieces                                                             */
/* ------------------------------------------------------------------ */

const CardSkeleton = () => (
  <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
    <div className="h-44 animate-pulse bg-stone-100 sm:h-48" />
    <div className="space-y-3 p-4">
      <div className="h-5 w-2/3 animate-pulse rounded bg-stone-100" />
      <div className="h-4 w-1/3 animate-pulse rounded bg-stone-100" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-stone-100" />
      <div className="flex gap-2 pt-1">
        <div className="h-6 w-16 animate-pulse rounded-full bg-stone-100" />
        <div className="h-6 w-20 animate-pulse rounded-full bg-stone-100" />
      </div>
    </div>
  </div>
);

const FilterChip = ({ active, onClick, children, badge }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`inline-flex shrink-0 snap-start items-center whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-200 active:scale-95 sm:py-2 ${
      active
        ? "bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-md shadow-orange-500/25"
        : "bg-white text-stone-700 ring-1 ring-stone-200 hover:text-red-600 hover:ring-orange-300"
    }`}
  >
    {children}
    {badge > 0 && (
      <span
        className={`ml-1.5 rounded-full px-1.5 text-[11px] font-semibold ${
          active ? "bg-white/25 text-white" : "bg-stone-100 text-stone-500"
        }`}
      >
        {badge}
      </span>
    )}
  </button>
);

/* Removable "applied filter" pill */
const ActivePill = ({ label, onRemove }) => (
  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-orange-50 py-1 pl-3 pr-1.5 text-xs font-medium text-red-700 ring-1 ring-orange-200">
    {label}
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove filter ${label}`}
      className="grid h-5 w-5 place-items-center rounded-full transition hover:bg-orange-200/70"
    >
      <CloseIcon className="h-3 w-3" />
    </button>
  </span>
);

const Switch = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="flex w-full items-center justify-between rounded-2xl bg-stone-50 px-4 py-3.5 text-left ring-1 ring-stone-200"
  >
    <span className="text-sm font-medium text-stone-800">{label}</span>
    <span
      className={`relative h-6 w-11 rounded-full transition-colors duration-300 ${
        checked ? "bg-gradient-to-r from-red-500 to-orange-500" : "bg-stone-300"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </span>
  </button>
);

const EmptyState = ({ onClear, hasFilters }) => (
  <div className="rl-fade-in rounded-3xl border border-dashed border-orange-200 bg-gradient-to-b from-amber-50/60 to-white px-5 py-14 text-center sm:px-6 sm:py-16">
    <div className="rl-float mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-red-500 to-orange-500 text-white shadow-lg shadow-orange-500/25">
      <SearchIcon />
    </div>
    <h2 className="mt-5 font-display text-xl text-stone-900">
      No restaurants found
    </h2>
    <p className="mx-auto mt-2 max-w-sm text-sm text-stone-600">
      We couldn't find a match. Try a different name, cuisine or location
      {hasFilters ? ", or clear your filters." : "."}
    </p>
    {hasFilters && (
      <button
        type="button"
        onClick={onClear}
        className="mt-6 rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition hover:brightness-110 active:scale-95"
      >
        Clear all filters
      </button>
    )}
  </div>
);

const ErrorState = ({ onRetry }) => (
  <div
    role="alert"
    className="rl-fade-in rounded-3xl border border-red-100 bg-red-50/60 px-5 py-12 text-center sm:px-6 sm:py-14"
  >
    <h2 className="font-display text-xl text-stone-900">
      Something went wrong
    </h2>
    <p className="mx-auto mt-2 max-w-sm text-sm text-stone-600">
      We couldn't load restaurants right now. Check your connection and try
      again.
    </p>
    <button
      type="button"
      onClick={onRetry}
      className="mt-6 rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition hover:brightness-110 active:scale-95"
    >
      Try again
    </button>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Mobile filter sheet (bottom drawer, phones only)                   */
/* ------------------------------------------------------------------ */

const sheetField =
  "w-full rounded-2xl bg-stone-50 px-4 py-3.5 text-base text-stone-900 placeholder-stone-400 ring-1 ring-stone-200 focus:outline-none focus:ring-2 focus:ring-orange-400";

const FilterSheet = ({
  open,
  onClose,
  city,
  setCity,
  stateName,
  setStateName,
  topOnly,
  setTopOnly,
  sort,
  setSort,
  resultCount,
  loading,
  sheetCount,
  onClear,
}) => {
  const closeRef = useRef(null);

  // Lock page scroll, close on Escape, move focus into the dialog
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] sm:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Filters"
    >
      <button
        type="button"
        aria-label="Close filters"
        onClick={onClose}
        className="rl-fade-in absolute inset-0 bg-stone-900/50 backdrop-blur-sm"
      />

      <div className="rl-sheet absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-3xl bg-white shadow-2xl">
        <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-stone-300" />

        <div className="flex items-center justify-between px-5 pb-1 pt-3">
          <h2 className="font-display text-xl text-stone-900">Filters</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-full bg-stone-100 text-stone-600 transition hover:bg-stone-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4">
          <div>
            <label htmlFor="sheet-city" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              City
            </label>
            <input
              id="sheet-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Any city"
              className={sheetField}
            />
          </div>

          <div>
            <label htmlFor="sheet-state" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              State
            </label>
            <select
              id="sheet-state"
              value={stateName}
              onChange={(e) => setStateName(e.target.value)}
              className={sheetField}
            >
              <option value="">All states</option>
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <Switch checked={topOnly} onChange={setTopOnly} label="★ 4.0 & up only" />

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Sort by
            </p>
            <div className="flex flex-wrap gap-2">
              {SORTS.map((s) => (
                <FilterChip
                  key={s.value}
                  active={sort === s.value}
                  onClick={() => setSort(s.value)}
                >
                  {s.label}
                </FilterChip>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 border-t border-stone-100 bg-white px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {sheetCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="shrink-0 text-sm font-semibold text-stone-600 underline underline-offset-4"
            >
              Clear all
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full bg-gradient-to-r from-red-500 to-orange-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-orange-500/25 transition active:scale-[.98]"
          >
            {loading
              ? "Show results"
              : `Show ${resultCount} restaurant${resultCount !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

const RestaurantList = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Initial values can come from the home page links (?cuisine=…&state=…)
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [city, setCity] = useState(
    searchParams.get("city") || searchParams.get("location") || ""
  );
  const [stateName, setStateName] = useState(searchParams.get("state") || "");
  const [cuisine, setCuisine] = useState(searchParams.get("cuisine") || "");
  const [sort, setSort] = useState("recommended");
  const [topOnly, setTopOnly] = useState(false);

  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [debSearch, setDebSearch] = useDebounced(search, SEARCH_DELAY);
  const [debCity, setDebCity] = useDebounced(city, SEARCH_DELAY);

  const resultsRef = useRef(null);
  const chipsRef = useRef(null);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  /* ---------- Fetch (cancels any stale request) ---------- */
  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const { data } = await api.get("/restaurants", {
          params: compact({ city: debCity.trim(), search: debSearch.trim(), state: stateName }),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setRestaurants(normalizeResponse(data));
        setLoading(false);
      } catch (err) {
        if (isCanceled(err) || controller.signal.aborted) return;
        console.error(err);
        setRestaurants([]);
        setError(true);
        setLoading(false);
      }
    };

    load();
    return () => controller.abort();
  }, [debSearch, debCity, stateName, reloadKey]);

  /* ---------- Keep the URL shareable ---------- */
  useEffect(() => {
    setSearchParams(
      compact({ search: debSearch.trim(), city: debCity.trim(), state: stateName, cuisine }),
      { replace: true }
    );
  }, [debSearch, debCity, stateName, cuisine, setSearchParams]);

  /* ---------- Derived data ---------- */
  const cuisineOptions = useMemo(() => {
    const counts = new Map();
    restaurants.forEach((r) =>
      normalizeCuisines(r.cuisine).forEach((c) => {
        const key = c.toLowerCase();
        const entry = counts.get(key) || { label: c, count: 0 };
        entry.count += 1;
        counts.set(key, entry);
      })
    );
    const list = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 14);
    // Keep a cuisine from the URL visible even when no result has it
    if (cuisine && !list.some((c) => c.label.toLowerCase() === cuisine.toLowerCase())) {
      list.unshift({ label: cuisine, count: 0 });
    }
    return list;
  }, [restaurants, cuisine]);

  const filtered = useMemo(() => {
    const wantedCuisine = cuisine.toLowerCase();
    // Only filter by state when the API actually returns a state field
    const hasStateData = restaurants.some((r) => r.state);

    let list = restaurants.filter((r) => {
      if (
        wantedCuisine &&
        !normalizeCuisines(r.cuisine).some((c) => c.toLowerCase() === wantedCuisine)
      )
        return false;
      if (topOnly && (Number(r.rating) || 0) < 4) return false;
      if (
        stateName &&
        hasStateData &&
        (r.state || "").toLowerCase() !== stateName.toLowerCase()
      )
        return false;
      return true;
    });

    if (sort === "rating") {
      list = [...list].sort(
        (a, b) =>
          (Number(b.rating) || 0) - (Number(a.rating) || 0) ||
          (Number(b.numReviews) || 0) - (Number(a.numReviews) || 0)
      );
    } else if (sort === "reviews") {
      list = [...list].sort((a, b) => (Number(b.numReviews) || 0) - (Number(a.numReviews) || 0));
    } else if (sort === "name") {
      list = [...list].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }
    return list;
  }, [restaurants, cuisine, topOnly, stateName, sort]);

  // Back to the first page whenever the list changes
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [filtered]);

  // Bring the selected cuisine chip into view (e.g. when arriving from the home page)
  useEffect(() => {
    const row = chipsRef.current;
    if (!row || !cuisine) return;
    const active = row.querySelector('[aria-pressed="true"]');
    if (active) {
      row.scrollTo({
        left: active.offsetLeft - row.clientWidth / 2 + active.clientWidth / 2,
        behavior: "smooth",
      });
    }
  }, [cuisine, cuisineOptions]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const activeFilterCount =
    (cuisine ? 1 : 0) + (topOnly ? 1 : 0) + (stateName ? 1 : 0) + (city ? 1 : 0) + (search ? 1 : 0);

  // Filters that live inside the mobile sheet
  const sheetCount =
    (city ? 1 : 0) + (stateName ? 1 : 0) + (topOnly ? 1 : 0) + (sort !== "recommended" ? 1 : 0);

  const activePills = [
    search && {
      key: "search",
      label: `“${search}”`,
      onRemove: () => {
        setSearch("");
        setDebSearch("");
      },
    },
    city && {
      key: "city",
      label: city,
      onRemove: () => {
        setCity("");
        setDebCity("");
      },
    },
    stateName && { key: "state", label: stateName, onRemove: () => setStateName("") },
    cuisine && { key: "cuisine", label: cuisine, onRemove: () => setCuisine("") },
    topOnly && { key: "top", label: "★ 4.0 & up", onRemove: () => setTopOnly(false) },
  ].filter(Boolean);

  /* ---------- Handlers ---------- */
  const handleSubmit = (e) => {
    e.preventDefault();
    setDebSearch(search);
    setDebCity(city);
    // On phones the results sit below the fold, so take the user to them
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      document.activeElement?.blur?.();
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const clearAll = () => {
    setSearch("");
    setCity("");
    setStateName("");
    setCuisine("");
    setTopOnly(false);
    setSort("recommended");
    setDebSearch("");
    setDebCity("");
  };

  const field =
    "w-full bg-transparent text-base text-stone-900 placeholder-stone-400 focus:outline-none sm:text-sm";

  /* ---------- Render ---------- */
  return (
    <div className="overflow-x-clip bg-white">
      <style>{RL_CSS}</style>

      {/* ===== Header + search ===== */}
      <section className="relative overflow-hidden border-b border-orange-100 bg-gradient-to-b from-amber-50 via-orange-50/50 to-white">
        <div className="rl-blob pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-red-300/25 blur-3xl sm:h-72 sm:w-72" />
        <div
          className="rl-blob pointer-events-none absolute -right-16 top-10 h-56 w-56 rounded-full bg-amber-300/30 blur-3xl sm:h-72 sm:w-72"
          style={{ animationDelay: "-6s" }}
        />

        <div className="relative mx-auto max-w-6xl px-4 pb-6 pt-8 sm:px-6 sm:pb-8 sm:pt-16">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-red-600 ring-1 ring-orange-200 backdrop-blur sm:text-xs">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            Restaurants
          </span>

          {/* <h1 className="mt-3 font-display text-[1.75rem] leading-tight text-stone-900 sm:text-4xl lg:text-5xl">
            Find a{" "}
            <span className="rl-gradtext bg-gradient-to-r from-red-500 via-orange-500 to-amber-400 bg-clip-text text-transparent">
              restaurant
            </span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-stone-600 sm:mt-3 sm:text-base">
            Search by name, cuisine or location, then pick your table.
          </p> */}

          <form
            onSubmit={handleSubmit}
            role="search"
            className="mt-6 overflow-hidden rounded-2xl bg-white shadow-xl shadow-orange-500/10 ring-1 ring-orange-200 sm:mt-8 sm:grid sm:grid-cols-2 sm:gap-px sm:bg-orange-100 lg:grid-cols-[2fr_1fr_1fr_auto]"
          >
            {/* Name / cuisine (with an inline submit button on phones) */}
            <div className="flex items-stretch bg-white sm:col-span-2 lg:col-span-1">
              <label className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition-colors focus-within:bg-amber-50">
                <span className="text-orange-500">
                  <SearchIcon />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    Name or cuisine
                  </span>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="e.g. Biryani, Cafe Delhi"
                    enterKeyHint="search"
                    className={field}
                  />
                </span>
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="grid h-8 w-8 place-items-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                )}
              </label>
              <button
                type="submit"
                aria-label="Search"
                className="grid w-14 place-items-center bg-gradient-to-r from-red-500 to-orange-500 text-white transition active:brightness-90 sm:hidden"
              >
                <SearchIcon />
              </button>
            </div>

            {/* City + state live in the form on tablets and up; on phones they are in the sheet */}
            <label className="hidden items-center gap-3 bg-white px-4 py-3 transition-colors focus-within:bg-amber-50 sm:flex">
              <span className="text-orange-500">
                <PinIcon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                  City
                </span>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Any city"
                  className={field}
                />
              </span>
            </label>

            <label className="hidden items-center gap-3 bg-white px-4 py-3 transition-colors focus-within:bg-amber-50 sm:flex">
              <span className="text-orange-500">
                <MapIcon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                  State
                </span>
                <select
                  value={stateName}
                  onChange={(e) => setStateName(e.target.value)}
                  className={field}
                >
                  <option value="">All states</option>
                  {STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </span>
            </label>

            <button
              type="submit"
              className="hidden bg-gradient-to-r from-red-500 to-orange-500 px-8 py-4 font-semibold text-white transition hover:brightness-110 active:scale-[.98] sm:block sm:col-span-2 lg:col-span-1"
            >
              Search
            </button>
          </form>

          {/* Cuisine chips (swipe on phones) */}
          {cuisineOptions.length > 0 && (
            <div
              ref={chipsRef}
              className="rl-hide-scroll rl-scroll-fade relative -mx-4 mt-5 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:mt-6 sm:flex-wrap sm:overflow-visible sm:px-0"
              role="group"
              aria-label="Filter by cuisine"
            >
              <FilterChip active={!cuisine} onClick={() => setCuisine("")}>
                All cuisines
              </FilterChip>
              {cuisineOptions.map((c) => (
                <FilterChip
                  key={c.label}
                  badge={c.count}
                  active={cuisine.toLowerCase() === c.label.toLowerCase()}
                  onClick={() =>
                    setCuisine(
                      cuisine.toLowerCase() === c.label.toLowerCase() ? "" : c.label
                    )
                  }
                >
                  {c.label}
                </FilterChip>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ===== Results ===== */}
      <section
        ref={resultsRef}
        className="mx-auto max-w-6xl scroll-mt-4 px-4 py-6 sm:px-6 sm:py-10"
      >
        <div className="mb-5 space-y-3 sm:mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-stone-600" aria-live="polite">
              {loading ? (
                "Loading restaurants…"
              ) : error ? (
                ""
              ) : (
                <>
                  <span className="font-semibold text-stone-900">{filtered.length}</span>{" "}
                  restaurant{filtered.length !== 1 ? "s" : ""} found
                </>
              )}
            </p>

            <div className="rl-hide-scroll rl-scroll-fade -mx-4 flex items-center gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:overflow-visible sm:px-0 sm:py-0">
              {/* Phones only: opens the filter sheet */}
              <button
                type="button"
                onClick={() => setSheetOpen(true)}
                className="inline-flex shrink-0 items-center gap-2 rounded-full bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition active:scale-95 sm:hidden"
              >
                <FilterIcon className="h-4 w-4" />
                Filters
                {sheetCount > 0 && (
                  <span className="grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-1 text-[11px]">
                    {sheetCount}
                  </span>
                )}
              </button>

              <FilterChip active={topOnly} onClick={() => setTopOnly(!topOnly)}>
                ★ 4.0 &amp; up
              </FilterChip>

              <label className="flex shrink-0 items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm ring-1 ring-stone-200 focus-within:ring-orange-400 sm:py-2">
                <span className="text-stone-500">Sort</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="bg-transparent font-medium text-stone-900 focus:outline-none"
                >
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* Applied filters, each removable */}
          {activePills.length > 0 && (
            <div className="rl-hide-scroll rl-scroll-fade rl-fade-in -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
              {activePills.map((p) => (
                <ActivePill key={p.key} label={p.label} onRemove={p.onRemove} />
              ))}
              <button
                type="button"
                onClick={clearAll}
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {error ? (
          <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />
        ) : loading ? (
          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3"
            aria-busy="true"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState onClear={clearAll} hasFilters={activeFilterCount > 0} />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
              {visible.map((r, i) => (
                <div
                  key={r._id}
                  className="rl-card"
                  style={{ animationDelay: `${Math.min(i % PAGE_SIZE, 8) * 60}ms` }}
                >
                  <div className="h-full transition-transform duration-300 hover:-translate-y-1">
                    <RestaurantCard restaurant={r} />
                  </div>
                </div>
              ))}
            </div>

            {/* Progress + load more */}
            <div className="mt-8 text-center sm:mt-10">
              <p className="text-xs text-stone-500">
                Showing {visible.length} of {filtered.length}
              </p>
              <div className="mx-auto mt-2 h-1 w-40 overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-500 transition-all duration-500"
                  style={{ width: `${(visible.length / filtered.length) * 100}%` }}
                />
              </div>
              {hasMore && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                  className="mt-5 w-full rounded-full border-2 border-red-500 px-8 py-3 text-sm font-semibold text-red-600 transition-all hover:border-transparent hover:bg-gradient-to-r hover:from-red-500 hover:to-orange-500 hover:text-white active:scale-95 sm:w-auto sm:py-2.5"
                >
                  Show more ({filtered.length - visibleCount} left)
                </button>
              )}
            </div>
          </>
        )}
      </section>

      <FilterSheet
        open={sheetOpen}
        onClose={closeSheet}
        city={city}
        setCity={setCity}
        stateName={stateName}
        setStateName={setStateName}
        topOnly={topOnly}
        setTopOnly={setTopOnly}
        sort={sort}
        setSort={setSort}
        resultCount={filtered.length}
        loading={loading}
        sheetCount={sheetCount}
        onClear={clearAll}
      />
    </div>
  );
};

export default RestaurantList;