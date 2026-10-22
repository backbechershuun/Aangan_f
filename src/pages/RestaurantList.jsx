import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/axios.js";
import RestaurantCard from "../components/RestaurantCard.jsx";

/* ------------------------------------------------------------------ */
/*  Constants & helpers                                                */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 9;
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

const SearchIcon = () => (
  <Icon>
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

/* ------------------------------------------------------------------ */
/*  Pieces                                                             */
/* ------------------------------------------------------------------ */

const CardSkeleton = () => (
  <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
    <div className="h-48 animate-pulse bg-stone-100" />
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

const FilterChip = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
      active
        ? "bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-md shadow-orange-500/25"
        : "bg-white text-stone-700 ring-1 ring-stone-200 hover:ring-orange-300 hover:text-red-600"
    }`}
  >
    {children}
  </button>
);

const EmptyState = ({ onClear, hasFilters }) => (
  <div className="rounded-3xl border border-dashed border-orange-200 bg-gradient-to-b from-amber-50/60 to-white px-6 py-16 text-center">
    <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-red-500 to-orange-500 text-white shadow-lg shadow-orange-500/25">
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
        className="mt-6 rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition hover:brightness-110"
      >
        Clear all filters
      </button>
    )}
  </div>
);

const ErrorState = ({ onRetry }) => (
  <div
    role="alert"
    className="rounded-3xl border border-red-100 bg-red-50/60 px-6 py-14 text-center"
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
      className="mt-6 rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition hover:brightness-110"
    >
      Try again
    </button>
  </div>
);

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

  const [debSearch, setDebSearch] = useDebounced(search, SEARCH_DELAY);
  const [debCity, setDebCity] = useDebounced(city, SEARCH_DELAY);

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

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  const activeFilterCount =
    (cuisine ? 1 : 0) + (topOnly ? 1 : 0) + (stateName ? 1 : 0) + (city ? 1 : 0) + (search ? 1 : 0);

  /* ---------- Handlers ---------- */
  const handleSubmit = (e) => {
    e.preventDefault();
    setDebSearch(search);
    setDebCity(city);
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
    "w-full bg-transparent text-sm text-stone-900 placeholder-stone-400 focus:outline-none";

  /* ---------- Render ---------- */
  return (
    <div className="bg-white">
      {/* ===== Header + search ===== */}
      <section className="relative overflow-hidden border-b border-orange-100 bg-gradient-to-b from-amber-50 via-orange-50/50 to-white">
        <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-red-300/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-10 h-72 w-72 rounded-full bg-amber-300/25 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-12 sm:px-6 sm:pt-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600">
            Restaurants
          </p>
          <h1 className="mt-2 font-display text-3xl text-stone-900 sm:text-4xl lg:text-5xl">
            Find a restaurant
          </h1>
          <p className="mt-3 max-w-xl text-stone-600">
            Search by name, cuisine or location, then pick your table.
          </p>

          <form
            onSubmit={handleSubmit}
            role="search"
            className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-orange-100 shadow-xl shadow-orange-500/10 ring-1 ring-orange-200 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]"
          >
            <label className="flex items-center gap-3 bg-white px-4 py-3 transition-colors focus-within:bg-amber-50 sm:col-span-2 lg:col-span-1">
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
                  className={field}
                />
              </span>
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              )}
            </label>

            <label className="flex items-center gap-3 bg-white px-4 py-3 transition-colors focus-within:bg-amber-50">
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

            <label className="flex items-center gap-3 bg-white px-4 py-3 transition-colors focus-within:bg-amber-50">
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
              className="bg-gradient-to-r from-red-500 to-orange-500 px-8 py-4 font-semibold text-white transition hover:brightness-110 active:scale-[.98] sm:col-span-2 lg:col-span-1"
            >
              Search
            </button>
          </form>

          {/* Cuisine chips */}
          {cuisineOptions.length > 0 && (
            <div
              className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="group"
              aria-label="Filter by cuisine"
            >
              <FilterChip active={!cuisine} onClick={() => setCuisine("")}>
                All cuisines
              </FilterChip>
              {cuisineOptions.map((c) => (
                <FilterChip
                  key={c.label}
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
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
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

          <div className="flex flex-wrap items-center gap-2">
            <FilterChip active={topOnly} onClick={() => setTopOnly(!topOnly)}>
              ★ 4.0 &amp; up
            </FilterChip>

            <label className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm ring-1 ring-stone-200 focus-within:ring-orange-400">
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

            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="rounded-full px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {error ? (
          <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />
        ) : loading ? (
          <div
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
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
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((r) => (
                <RestaurantCard key={r._id} restaurant={r} />
              ))}
            </div>

            {hasMore && (
              <div className="mt-10 text-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                  className="rounded-full border-2 border-red-500 px-8 py-2.5 text-sm font-semibold text-red-600 transition-all hover:border-transparent hover:bg-gradient-to-r hover:from-red-500 hover:to-orange-500 hover:text-white"
                >
                  Show more ({filtered.length - visibleCount} left)
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
};

export default RestaurantList;