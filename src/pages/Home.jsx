import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/axios.js";
import FeaturedRestaurants from "../components/featured";
import Footer from "../components/footer";

/* ------------------------------------------------------------------ */
/*  Animations (self-contained, no Tailwind config changes needed)     */
/* ------------------------------------------------------------------ */

const STYLES = `
@keyframes float      { 0%,100% { transform: translateY(0) }   50% { transform: translateY(-14px) } }
@keyframes blob       { 0%,100% { transform: translate(0,0) scale(1) } 33% { transform: translate(30px,-40px) scale(1.1) } 66% { transform: translate(-25px,20px) scale(.95) } }
@keyframes gradPan    { 0% { background-position: 0% 50% } 50% { background-position: 100% 50% } 100% { background-position: 0% 50% } }
@keyframes marquee    { from { transform: translateX(0) } to { transform: translateX(-50%) } }
@keyframes fadeUp     { from { opacity: 0; transform: translateY(26px) } to { opacity: 1; transform: none } }
@keyframes shine      { 0% { left: -60% } 60%,100% { left: 130% } }
@keyframes popIn      { 0% { opacity: 0; transform: scale(.85) } 100% { opacity: 1; transform: scale(1) } }

.anim-float      { animation: float 6s ease-in-out infinite; }
.anim-float-slow { animation: float 8s ease-in-out infinite; animation-delay: -3s; }
.anim-blob       { animation: blob 14s ease-in-out infinite; }
.anim-gradient   { background-size: 200% 200%; animation: gradPan 6s ease infinite; }
.anim-marquee    { animation: marquee 45s linear infinite; }
.marquee:hover .anim-marquee { animation-play-state: paused; }
.fade-up         { opacity: 0; animation: fadeUp .8s cubic-bezier(.2,.7,.2,1) forwards; }
.pop-in          { opacity: 0; animation: popIn .6s ease-out forwards; }
.btn-shine       { position: relative; overflow: hidden; }
.btn-shine::after {
  content: ""; position: absolute; top: 0; left: -60%; width: 40%; height: 100%;
  background: linear-gradient(120deg, transparent, rgba(255,255,255,.55), transparent);
  transform: skewX(-20deg); animation: shine 3.2s ease-in-out infinite;
}
html { scroll-behavior: smooth; }

@media (prefers-reduced-motion: reduce) {
  .anim-float, .anim-float-slow, .anim-blob, .anim-gradient, .anim-marquee,
  .btn-shine::after { animation: none !important; }
  .fade-up, .pop-in { animation: none !important; opacity: 1 !important; }
}
`;

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReduced() || !("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, inView];
}

/* Fades and slides content in when it scrolls into view */
const Reveal = ({ children, delay = 0, className = "", from = "up" }) => {
  const [ref, inView] = useInView();
  const hidden =
    from === "left"
      ? "opacity-0 -translate-x-8"
      : from === "right"
      ? "opacity-0 translate-x-8"
      : "opacity-0 translate-y-8";
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${
        inView ? "opacity-100 translate-x-0 translate-y-0" : hidden
      } ${className}`}
    >
      {children}
    </div>
  );
};

/* Counts up to a number when it becomes visible */
const CountUp = ({ end, decimals = 0, prefix = "", suffix = "" }) => {
  const [ref, inView] = useInView(0.3);
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (prefersReduced()) {
      setVal(end);
      return;
    }
    let raf;
    let start;
    const dur = 1600;
    const tick = (t) => {
      if (!start) start = t;
      const p = Math.min((t - start) / dur, 1);
      setVal(end * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, end]);
  return (
    <span ref={ref}>
      {prefix}
      {val.toFixed(decimals)}
      {suffix}
    </span>
  );
};

/* Thin progress bar on top + back-to-top button */
const ScrollUi = () => {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setPct(h > 0 ? Math.min((window.scrollY / h) * 100, 100) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <>
      <div className="fixed top-0 left-0 right-0 h-1 z-[60] pointer-events-none">
        <div
          className="h-full bg-gradient-to-r from-red-500 via-orange-500 to-amber-400"
          style={{ width: `${pct}%` }}
        />
      </div>
      <button
        aria-label="Back to top"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className={`fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full bg-gradient-to-br from-red-500 to-orange-500 text-white shadow-lg shadow-orange-500/40 grid place-items-center transition-all duration-300 hover:scale-110 ${
          pct > 12
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-4 pointer-events-none"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 fill-none stroke-current"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 15l6-6 6 6" />
        </svg>
      </button>
    </>
  );
};

/* ------------------------------------------------------------------ */
/*  Static content                                                     */
/* ------------------------------------------------------------------ */

const CUISINES = [
  { name: "North Indian", emoji: "🍛" },
  { name: "Italian", emoji: "🍝" },
  { name: "Chinese", emoji: "🥡" },
  { name: "Continental", emoji: "🥩" },
  { name: "Cafe", emoji: "☕" },
  { name: "Desserts", emoji: "🍰" },
  { name: "Seafood", emoji: "🦐" },
  { name: "Rooftop", emoji: "🌆" },
  { name: "South Indian", emoji: "🥞" },
  { name: "Mughlai", emoji: "🍢" },
  { name: "Biryani", emoji: "🍚" },
  { name: "Pizza", emoji: "🍕" },
  { name: "Burgers", emoji: "🍔" },
  { name: "Street Food", emoji: "🌮" },
  { name: "Thai", emoji: "🍜" },
  { name: "Japanese", emoji: "🍣" },
  { name: "Korean", emoji: "🍲" },
  { name: "Mexican", emoji: "🌯" },
  { name: "Mediterranean", emoji: "🥙" },
  { name: "Lebanese", emoji: "🧆" },
  { name: "Barbecue & Grills", emoji: "🍖" },
  { name: "Steakhouse", emoji: "🥓" },
  { name: "Fast Food", emoji: "🍟" },
  { name: "Healthy Food", emoji: "🥗" },
  { name: "Vegan", emoji: "🌱" },
  { name: "Pure Veg", emoji: "🥦" },
  { name: "Bakery", emoji: "🥐" },
  { name: "Ice Cream", emoji: "🍨" },
  { name: "Bar & Lounge", emoji: "🍸" },
  { name: "Fine Dining", emoji: "🍷" },
  { name: "Buffet", emoji: "🍽️" },
  { name: "Breakfast & Brunch", emoji: "🍳" },
];

/* ------------------------------------------------------------------ */
/*  Dynamic cuisines (built from the restaurants in your database)     */
/* ------------------------------------------------------------------ */

const EMOJI_BY_NAME = Object.fromEntries(
  CUISINES.map((c) => [c.name.toLowerCase(), c.emoji])
);

// Order matters: more specific words come before the shorter ones they contain
const EMOJI_KEYWORDS = [
  ["breakfast", "🍳"], ["brunch", "🍳"], ["biryani", "🍚"], ["barbecue", "🍖"],
  ["bbq", "🍖"], ["grill", "🍖"], ["steak", "🥓"], ["pizza", "🍕"],
  ["burger", "🍔"], ["indian", "🍛"], ["chinese", "🥡"], ["italian", "🍝"],
  ["cafe", "☕"], ["coffee", "☕"], ["dessert", "🍰"], ["sea", "🦐"],
  ["vegan", "🌱"], ["veg", "🥦"], ["bake", "🥐"], ["ice", "🍨"],
  ["sushi", "🍣"], ["japan", "🍣"], ["thai", "🍜"], ["korea", "🍲"],
  ["mexic", "🌯"], ["fast", "🍟"], ["health", "🥗"], ["street", "🌮"],
  ["bar", "🍸"], ["lounge", "🍸"], ["fine", "🍷"], ["buffet", "🍽️"],
];

const emojiFor = (name) => {
  const key = name.toLowerCase();
  if (EMOJI_BY_NAME[key]) return EMOJI_BY_NAME[key];
  const hit = EMOJI_KEYWORDS.find(([word]) => key.includes(word));
  return hit ? hit[1] : "🍽️";
};

const splitCuisines = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string")
    return value.split(",").map((c) => c.trim()).filter(Boolean);
  return [];
};

/* Unique cuisines across all restaurants, most popular first */
const buildCuisines = (data) => {
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.restaurants)
    ? data.restaurants
    : [];
  const counts = new Map();
  list.forEach((r) =>
    splitCuisines(r.cuisine).forEach((raw) => {
      const name = String(raw).trim();
      if (!name) return;
      const key = name.toLowerCase();
      const entry = counts.get(key) || { name, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    })
  );
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map((c) => ({ ...c, emoji: emojiFor(c.name) }));
};

// One shared request for every component that needs the list (refreshed every 5 minutes)
const CACHE_MS = 5 * 60 * 1000;
let cuisineCache = { promise: null, at: 0 };

const loadCuisines = () => {
  if (!cuisineCache.promise || Date.now() - cuisineCache.at > CACHE_MS) {
    cuisineCache = {
      at: Date.now(),
      promise: api
        .get("/restaurants")
        .then(({ data }) => buildCuisines(data))
        .catch((err) => {
          cuisineCache = { promise: null, at: 0 };
          throw err;
        }),
    };
  }
  return cuisineCache.promise;
};

/* Returns the live cuisines, or the built-in list if the API is empty or fails */
function useCuisineList() {
  const [state, setState] = useState({ items: null, loading: true });

  useEffect(() => {
    let alive = true;
    loadCuisines()
      .then((items) => alive && setState({ items, loading: false }))
      .catch(() => alive && setState({ items: null, loading: false }));
    return () => {
      alive = false;
    };
  }, []);

  const live = Boolean(state.items && state.items.length);
  return {
    cuisines: live ? state.items : CUISINES,
    loading: state.loading,
    live,
  };
}

const STEPS = [
  {
    title: "Search",
    text: "Pick your state, date, time and number of guests.",
    icon: (
      <path d="M21 21l-4.3-4.3M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
    ),
  },
  {
    title: "Choose your table",
    text: "See the floor plan and select the exact table you want.",
    icon: <path d="M4 7h16M4 12h16M4 17h10" />,
  },
  {
    title: "Order your food",
    text: "Browse the menu and pre-order your dishes, so they are ready when you arrive.",
    icon: (
      <path d="M7 3v8M5 3v5a2 2 0 004 0V3M7 11v10M17 3c-2 2-3 4-3 7h3v11" />
    ),
  },
  {
    title: "Booking confirmed",
    text: "Instant confirmation of your table and order by SMS and email. No calls needed.",
    icon: <path d="M5 13l4 4L19 7" />,
  },
];

const FEATURES = [
  {
    title: "Real-time availability",
    text: "Tables update live, so what you see is what you get.",
  },
  {
    title: "Pick your exact seat",
    text: "Window, patio, or a quiet corner. You decide, not the host.",
  },
  {
    title: "Free cancellation",
    text: "Plans change. Cancel up to 2 hours before at no cost.",
  },
  {
    title: "Verified reviews",
    text: "Only guests who actually dined can leave a rating.",
  },
  {
    title: "Exclusive offers",
    text: "Member-only discounts and special menus at partner restaurants.",
  },
  {
    title: "Reminders",
    text: "Gentle SMS and email reminders so you never miss a booking.",
  },
];

const STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu and Kashmir", "Chandigarh", "Puducherry",
];

const POPULAR_STATES = [
  { name: "Madhya Pradesh", count: "350+" },
  { name: "Delhi", count: "850+" },
  { name: "Maharashtra", count: "1,400+" },
  { name: "Karnataka", count: "780+" },
  { name: "Rajasthan", count: "420+" },
  { name: "Gujarat", count: "390+" },
];

const REVIEWS = [
  {
    name: "Ananya S.",
    role: "Booked 14 times",
    text: "I picked a window table for our anniversary in under a minute. It was exactly as shown.",
  },
  {
    name: "Rohit M.",
    role: "Booked 8 times",
    text: "No more calling and waiting on hold. Confirmation came instantly and the table was ready.",
  },
  {
    name: "Priya K.",
    role: "Booked 21 times",
    text: "Great for team dinners. Choosing a big table for 10 people was effortless.",
  },
];

const FAQS = [
  {
    q: "Is booking a table free?",
    a: "Yes. Reserving a table costs nothing. You only pay the restaurant for your meal.",
  },
  {
    q: "Can I cancel or change my reservation?",
    a: "Yes. You can cancel or modify up to 2 hours before your booking from the My Bookings page.",
  },
  {
    q: "How will I know my booking is confirmed?",
    a: "You receive an instant confirmation by SMS and email with your table and time details.",
  },
  {
    q: "Can I order food in advance?",
    a: "Yes. After choosing your table, you can browse the menu and pre-order your dishes. They are prepared so they are ready when you arrive.",
  },
  {
    q: "What if I'm running late?",
    a: "Most restaurants hold your table for 15 minutes. Call the restaurant if you expect a longer delay.",
  },
];

/* ------------------------------------------------------------------ */
/*  Small pieces                                                       */
/* ------------------------------------------------------------------ */

const SectionHeading = ({ eyebrow, title, subtitle }) => (
  <Reveal className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
    {eyebrow && (
      <p className="text-xs font-semibold tracking-[0.2em] uppercase text-red-600">
        {eyebrow}
      </p>
    )}
    <h2 className="mt-2 font-display text-3xl sm:text-4xl text-stone-900">
      {title}
    </h2>
    <div className="mx-auto mt-4 h-1 w-16 rounded-full bg-gradient-to-r from-red-500 via-orange-500 to-amber-400" />
    {subtitle && <p className="mt-4 text-stone-600">{subtitle}</p>}
  </Reveal>
);

const Stars = () => (
  <div className="flex gap-0.5 text-amber-400" aria-label="5 out of 5 stars">
    {[...Array(5)].map((_, i) => (
      <svg key={i} viewBox="0 0 20 20" className="h-4 w-4 fill-current">
        <path d="M10 1.5l2.6 5.5 6 .8-4.4 4.2 1.1 6L10 15l-5.3 3 1.1-6L1.4 7.8l6-.8L10 1.5z" />
      </svg>
    ))}
  </div>
);

/* Endless scrolling strip of cuisines */
const CuisineMarquee = () => {
  const { cuisines } = useCuisineList();
  // Repeat short lists so the strip always fills the screen
  const base = cuisines.length < 12 ? [...cuisines, ...cuisines, ...cuisines] : cuisines;
  const items = [...base, ...base];
  return (
    <div className="marquee relative overflow-hidden border-y border-orange-100 bg-gradient-to-r from-red-50 via-amber-50 to-orange-50 py-4">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-white to-transparent z-10" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-white to-transparent z-10" />
      <div className="anim-marquee flex w-max gap-3">
        {items.map((c, i) => (
          <Link
            key={`${c.name}-${i}`}
            to={`/restaurants?cuisine=${encodeURIComponent(c.name)}`}
            className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-stone-700 ring-1 ring-orange-100 hover:ring-orange-300 hover:text-red-600 hover:shadow-md transition"
          >
            <span className="text-lg">{c.emoji}</span>
            {c.name}
          </Link>
        ))}
      </div>
    </div>
  );
};

const CuisineSection = () => {
  const { cuisines, loading, live } = useCuisineList();
  const [showAll, setShowAll] = useState(false);

  const FIRST = 6;
  const visible = showAll ? cuisines : cuisines.slice(0, FIRST);
  const extra = cuisines.length - FIRST;

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
      <SectionHeading
        eyebrow="Explore"
        title="What are you craving?"
        subtitle="Browse by cuisine and find the right place for any mood."
      />

      <div
        className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4"
        aria-busy={loading}
      >
        {loading
          ? Array.from({ length: FIRST }).map((_, i) => (
              <div
                key={i}
                className="h-[116px] animate-pulse rounded-2xl bg-gradient-to-br from-stone-100 to-amber-50"
              />
            ))
          : visible.map((c, i) => (
              <Reveal key={c.name} delay={(i % 6) * 60}>
                <Link
                  to={`/restaurants?cuisine=${encodeURIComponent(c.name)}`}
                  className="group block rounded-2xl border border-stone-200 bg-white p-5 text-center hover:border-amber-300 hover:shadow-xl hover:shadow-orange-500/10 hover:-translate-y-1.5 transition-all duration-300"
                >
                  <span className="text-4xl block transition-transform duration-300 group-hover:scale-125 group-hover:-rotate-6">
                    {c.emoji}
                  </span>
                  <span className="mt-3 block text-sm font-medium text-stone-800 group-hover:text-red-600">
                    {c.name}
                  </span>
                  {live && (
                    <span className="mt-0.5 block text-xs text-stone-400">
                      {c.count} {c.count === 1 ? "place" : "places"}
                    </span>
                  )}
                </Link>
              </Reveal>
            ))}
      </div>

      {!loading && extra > 0 && (
        <div className="mt-8 text-center">
          <button
            onClick={() => setShowAll(!showAll)}
            aria-expanded={showAll}
            className="rounded-full border-2 border-red-500 text-red-600 hover:text-white hover:bg-gradient-to-r hover:from-red-500 hover:to-orange-500 hover:border-transparent px-7 py-2.5 text-sm font-semibold transition-all hover:scale-105"
          >
            {showAll ? "Show less" : `More cuisines (${extra} more)`}
          </button>
        </div>
      )}
    </section>
  );
};

const FaqItem = ({ q, a }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-stone-200">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 py-5 text-left group"
      >
        <span className="font-medium text-stone-900 group-hover:text-red-600 transition-colors">
          {q}
        </span>
        <span
          className={`shrink-0 h-8 w-8 rounded-full grid place-items-center text-lg transition-all duration-300 ${
            open
              ? "rotate-45 bg-gradient-to-br from-red-500 to-orange-500 text-white"
              : "bg-amber-50 text-red-600"
          }`}
        >
          +
        </span>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <p className="pb-5 pr-10 text-stone-600">{a}</p>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Booking search bar                                                 */
/* ------------------------------------------------------------------ */

const todayISO = () => new Date().toISOString().split("T")[0];

const SearchBar = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    state: "",
    date: todayISO(),
    time: "20:00",
    guests: "2",
  });

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    const params = new URLSearchParams(form).toString();
    navigate(`/restaurants?${params}`);
  };

  const field =
    "w-full bg-transparent text-sm text-stone-900 placeholder-stone-400 focus:outline-none";
  const label =
    "block text-[11px] font-semibold uppercase tracking-wider text-stone-500 mb-1";
  const cell =
    "bg-white px-4 py-3 transition-colors focus-within:bg-amber-50";

  return (
    <form
      onSubmit={submit}
      className="fade-up mt-10 grid grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_auto] gap-px bg-orange-100 rounded-2xl overflow-hidden shadow-2xl shadow-orange-500/20 ring-1 ring-orange-200"
      style={{ animationDelay: "0.6s" }}
    >
      <div className={`col-span-2 lg:col-span-1 ${cell}`}>
        <label htmlFor="state" className={label}>
          State
        </label>
        <select
          id="state"
          name="state"
          value={form.state}
          onChange={update}
          className={field}
        >
          <option value="">All states</option>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className={cell}>
        <label htmlFor="date" className={label}>
          Date
        </label>
        <input
          id="date"
          type="date"
          name="date"
          min={todayISO()}
          value={form.date}
          onChange={update}
          className={field}
        />
      </div>
      <div className={cell}>
        <label htmlFor="time" className={label}>
          Time
        </label>
        <input
          id="time"
          type="time"
          name="time"
          value={form.time}
          onChange={update}
          className={field}
        />
      </div>
      <div className={cell}>
        <label htmlFor="guests" className={label}>
          Guests
        </label>
        <select
          id="guests"
          name="guests"
          value={form.guests}
          onChange={update}
          className={field}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((n) => (
            <option key={n} value={n}>
              {n} {n === 1 ? "guest" : "guests"}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="btn-shine anim-gradient col-span-2 lg:col-span-1 bg-gradient-to-r from-red-500 via-orange-500 to-red-500 text-white font-semibold px-8 py-4 hover:brightness-110 active:scale-[.98] transition"
      >
        Find a table
      </button>
    </form>
  );
};

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

const Home = () => (
  <div className="bg-white text-stone-800">
    <style>{STYLES}</style>
    <ScrollUi />

    {/* ================= HERO ================= */}
    <section
      className="relative overflow-hidden"
      style={{
        backgroundImage: "url('/images/Hero.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/90 via-amber-50/85 to-orange-50/80" />

      {/* Drifting colour blobs */}
      <div className="anim-blob absolute -top-24 -left-24 h-96 w-96 rounded-full bg-red-400/30 blur-3xl" />
      <div
        className="anim-blob absolute top-1/3 -right-24 h-96 w-96 rounded-full bg-amber-300/40 blur-3xl"
        style={{ animationDelay: "-5s" }}
      />
      <div
        className="anim-blob absolute -bottom-24 left-1/3 h-80 w-80 rounded-full bg-orange-300/35 blur-3xl"
        style={{ animationDelay: "-9s" }}
      />
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-24 sm:pb-28">
        <div className="grid md:grid-cols-2 gap-10 sm:gap-12 items-center">
          <div className="text-center md:text-left">
            <span
              className="fade-up inline-flex items-center gap-2 rounded-full bg-white/80 text-red-600 ring-1 ring-orange-200 px-3 py-1 text-xs font-medium backdrop-blur"
              style={{ animationDelay: "0.05s" }}
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              Live table availability
            </span>

            <h1
              className="fade-up mt-5 font-display text-4xl sm:text-5xl lg:text-6xl text-stone-900 leading-[1.1]"
              style={{ animationDelay: "0.15s" }}
            >
              Book the perfect table,
              <br />
              <span className="anim-gradient bg-gradient-to-r from-red-500 via-orange-500 to-amber-400 bg-clip-text text-transparent">
                every time.
              </span>
            </h1>

            <p
              className="fade-up mt-5 text-base sm:text-lg text-stone-600 max-w-xl mx-auto md:mx-0"
              style={{ animationDelay: "0.3s" }}
            >
              Find a restaurant, pick your exact table, and reserve it in
              seconds. No calls, no waiting.
            </p>

            <div
              className="fade-up mt-8 flex flex-wrap gap-3 justify-center md:justify-start"
              style={{ animationDelay: "0.45s" }}
            >
              <Link
                to="/restaurants"
                className="btn-shine rounded-full bg-gradient-to-r from-red-500 to-orange-500 text-white px-7 py-3 text-sm sm:text-base font-semibold shadow-lg shadow-orange-500/30 hover:shadow-xl hover:shadow-orange-500/40 hover:-translate-y-0.5 transition-all"
              >
                Reserve now
              </Link>
              <a
                href="#how-it-works"
                className="rounded-full bg-white text-stone-800 ring-1 ring-stone-300 px-7 py-3 text-sm sm:text-base font-semibold hover:ring-orange-400 hover:text-red-600 hover:-translate-y-0.5 transition-all"
              >
                How it works
              </a>
            </div>

            <div
              className="fade-up mt-10 flex items-stretch justify-center md:justify-start divide-x divide-orange-200"
              style={{ animationDelay: "0.6s" }}
            >
              <div className="px-4 sm:px-6 first:pl-0">
                <p className="font-display text-xl sm:text-2xl text-stone-900">
                  <CountUp end={500} suffix="+" />
                </p>
                <p className="text-[11px] sm:text-xs text-stone-500">
                  Partner restaurants
                </p>
              </div>
              <div className="px-4 sm:px-6">
                <p className="font-display text-xl sm:text-2xl text-stone-900">
                  <CountUp end={50} suffix="k+" />
                </p>
                <p className="text-[11px] sm:text-xs text-stone-500">
                  Tables booked
                </p>
              </div>
              <div className="px-4 sm:px-6">
                <p className="font-display text-xl sm:text-2xl text-stone-900">
                  <CountUp end={4.8} decimals={1} suffix="★" />
                </p>
                <p className="text-[11px] sm:text-xs text-stone-500">
                  Average rating
                </p>
              </div>
            </div>
          </div>

          <div className="pop-in hidden sm:flex justify-center md:justify-end" style={{ animationDelay: "0.3s" }}>
            <div className="relative w-full max-w-sm md:max-w-md">
              {/* Glow behind image */}
              <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-red-400/40 via-orange-300/40 to-amber-300/40 blur-2xl" />
              <div className="anim-float relative">
                <img
                  src="/images/hero_visual.png"
                  alt="A beautifully set restaurant table"
                  className="relative rounded-3xl shadow-2xl w-full object-cover ring-4 ring-white"
                />
              </div>

              <div className="anim-float-slow absolute -bottom-5 -left-6 bg-white rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3">
                <span className="h-10 w-10 rounded-full bg-gradient-to-br from-red-500 to-orange-500 text-white grid place-items-center">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5 fill-none stroke-current"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-semibold text-stone-900">
                    Table confirmed
                  </p>
                  <p className="text-xs text-stone-500">
                    Today, 8:00 PM · 2 guests
                  </p>
                </div>
              </div>

              <div className="anim-float absolute -top-4 -right-4 bg-white rounded-2xl shadow-xl px-3.5 py-2.5 flex items-center gap-2" style={{ animationDelay: "-2s" }}>
                <span className="text-amber-400 text-lg">★</span>
                <span className="text-sm font-semibold text-stone-900">4.8</span>
                <span className="text-xs text-stone-500">top rated</span>
              </div>
            </div>
          </div>
        </div>

        <SearchBar />
      </div>
    </section>

    {/* ================= CUISINE MARQUEE ================= */}
    <CuisineMarquee />

    {/* ================= CUISINES ================= */}
    <CuisineSection />

    {/* ================= FEATURED (your existing component) ================= */}
    <FeaturedRestaurants />

    {/* ================= HOW IT WORKS ================= */}
    <section
      id="how-it-works"
      className="bg-gradient-to-b from-amber-50/70 to-white py-16 sm:py-24 scroll-mt-16"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <SectionHeading
          eyebrow="Simple process"
          title="Reserve and order in four easy steps"
          subtitle="From search to a confirmed table and meal in just a few minutes."
        />
        <div className="relative grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="hidden lg:block absolute top-14 left-[12%] right-[12%] border-t-2 border-dashed border-orange-300" />
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 150}>
              <div className="group relative h-full rounded-2xl bg-white p-7 shadow-sm ring-1 ring-orange-100 hover:shadow-xl hover:shadow-orange-500/10 hover:-translate-y-2 transition-all duration-300">
                <span className="absolute top-5 right-6 font-display text-5xl text-amber-100 group-hover:text-amber-200 transition-colors">
                  {i + 1}
                </span>
                <span className="relative inline-grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-red-500 to-orange-500 text-white">
                  <span className="absolute inset-0 rounded-xl bg-orange-400 opacity-30 animate-ping" />
                  <svg
                    viewBox="0 0 24 24"
                    className="relative h-6 w-6 fill-none stroke-current"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {s.icon}
                  </svg>
                </span>
                <h3 className="mt-5 text-lg font-semibold text-stone-900">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm text-stone-600">{s.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>

    {/* ================= OFFER BANNER ================= */}
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
      <Reveal>
        <div className="anim-gradient relative overflow-hidden rounded-3xl bg-gradient-to-r from-red-500 via-orange-500 to-amber-400 px-6 sm:px-12 py-12 sm:py-14 text-white shadow-2xl shadow-orange-500/25">
          <div className="anim-float absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/15" />
          <div className="anim-float-slow absolute -right-4 -bottom-20 h-56 w-56 rounded-full bg-white/15" />
          <div className="anim-float absolute left-1/3 -bottom-10 h-24 w-24 rounded-full bg-white/10" />
          <div className="relative grid md:grid-cols-[1fr_auto] gap-6 items-center">
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] uppercase text-white/90">
                Limited time
              </p>
              <h2 className="mt-2 font-display text-3xl sm:text-4xl drop-shadow-sm">
                Get 20% off your first booking
              </h2>
              <p className="mt-3 text-white/95 max-w-xl">
                Create a free account and enjoy a welcome discount at selected
                partner restaurants.
              </p>
            </div>
            <Link
              to="/signup"
              className="btn-shine justify-self-start md:justify-self-end rounded-full bg-white text-red-600 font-semibold px-8 py-3 shadow-lg hover:scale-105 hover:shadow-xl transition-all"
            >
              Claim offer
            </Link>
          </div>
        </div>
      </Reveal>
    </section>

    {/* ================= WHY US ================= */}
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
      <SectionHeading
        eyebrow="Why diners love us"
        title="Everything you need for a perfect night out"
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={(i % 3) * 100}>
            <div className="group h-full rounded-2xl border border-stone-200 p-6 hover:border-amber-300 hover:shadow-xl hover:shadow-orange-500/10 hover:-translate-y-1 transition-all duration-300">
              <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 text-red-500 grid place-items-center transition-all duration-300 group-hover:from-red-500 group-hover:to-orange-500 group-hover:text-white group-hover:rotate-12">
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 fill-none stroke-current"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <h3 className="mt-4 font-semibold text-stone-900">{f.title}</h3>
              <p className="mt-1.5 text-sm text-stone-600">{f.text}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>

    {/* ================= STATES ================= */}
    <section className="bg-gradient-to-b from-white to-amber-50/70 py-16 sm:py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <SectionHeading
          eyebrow="Available in"
          title="Popular states"
          subtitle="Discover top-rated dining spots in your state."
        />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {POPULAR_STATES.map((c, i) => (
            <Reveal key={c.name} delay={i * 80}>
              <Link
                to={`/restaurants?state=${encodeURIComponent(c.name)}`}
                className="group block rounded-2xl bg-white p-5 text-center ring-1 ring-orange-100 hover:ring-orange-300 hover:shadow-xl hover:shadow-orange-500/10 hover:-translate-y-1.5 transition-all duration-300"
              >
                <p className="font-semibold text-stone-900 group-hover:text-red-600 transition-colors">
                  {c.name}
                </p>
                <p className="mt-1 text-xs text-orange-600 font-medium">
                  {c.count} restaurants
                </p>
                <span className="mx-auto mt-3 block h-0.5 w-0 bg-gradient-to-r from-red-500 to-amber-400 transition-all duration-300 group-hover:w-10" />
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>

    {/* ================= TESTIMONIALS ================= */}
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
      <SectionHeading eyebrow="Reviews" title="Loved by thousands of diners" />
      <div className="grid md:grid-cols-3 gap-6">
        {REVIEWS.map((r, i) => (
          <Reveal key={r.name} delay={i * 150}>
            <figure className="h-full rounded-2xl bg-white p-7 shadow-sm ring-1 ring-orange-100 hover:shadow-xl hover:shadow-orange-500/10 hover:-translate-y-2 transition-all duration-300">
              <Stars />
              <blockquote className="mt-4 text-stone-700">“{r.text}”</blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                <span className="h-10 w-10 rounded-full bg-gradient-to-br from-red-500 to-amber-400 text-white grid place-items-center font-semibold">
                  {r.name[0]}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-stone-900">
                    {r.name}
                  </span>
                  <span className="block text-xs text-stone-500">{r.role}</span>
                </span>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
    </section>

    {/* ================= FAQ ================= */}
    <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
      <SectionHeading eyebrow="FAQ" title="Questions? We've got answers" />
      <Reveal>
        <div className="border-t border-stone-200">
          {FAQS.map((f) => (
            <FaqItem key={f.q} {...f} />
          ))}
        </div>
      </Reveal>
    </section>

    {/* ================= OWNER CTA ================= */}
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl bg-stone-900 text-white px-6 sm:px-12 py-12 sm:py-14 grid md:grid-cols-[1fr_auto] gap-6 items-center">
          <div className="anim-blob absolute -left-10 -top-10 h-56 w-56 rounded-full bg-red-500/25 blur-3xl" />
          <div
            className="anim-blob absolute -right-10 -bottom-10 h-56 w-56 rounded-full bg-amber-400/25 blur-3xl"
            style={{ animationDelay: "-6s" }}
          />
          <div className="relative">
            <h2 className="font-display text-3xl sm:text-4xl">
              Own a restaurant?{" "}
              <span className="anim-gradient bg-gradient-to-r from-red-400 via-orange-400 to-amber-300 bg-clip-text text-transparent">
                Fill more tables.
              </span>
            </h2>
            <p className="mt-3 text-stone-300 max-w-xl">
              List your restaurant, manage your floor plan and reservations, and
              reach thousands of diners every day.
            </p>
          </div>
          <Link
            to="/register"
            className="btn-shine relative justify-self-start md:justify-self-end rounded-full bg-gradient-to-r from-red-500 to-orange-500 text-white font-semibold px-8 py-3 hover:scale-105 hover:shadow-lg hover:shadow-orange-500/30 transition-all"
          >
            Partner with us
          </Link>
        </div>
      </Reveal>
    </section>

    <Footer />
  </div>
);

export default Home;