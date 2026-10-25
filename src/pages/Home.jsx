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


@keyframes marqueeLtr { from { transform: translateX(-50%) } to { transform: translateX(0) } }
@keyframes pinBounce  { 0%,100% { transform: translateY(0) } 40% { transform: translateY(-7px) } 60% { transform: translateY(0) } 75% { transform: translateY(-3px) } }
@keyframes ringPulse  { 0% { transform: scale(.8); opacity: .6 } 100% { transform: scale(1.9); opacity: 0 } }
@keyframes cardIn     { from { opacity: 0; transform: translateX(-30px) scale(.95) } to { opacity: 1; transform: none } }

.anim-marquee-ltr { animation: marqueeLtr 40s linear infinite; }
.city-marquee:hover .anim-marquee-ltr { animation-play-state: paused; }
.anim-pin         { animation: pinBounce 2.4s ease-in-out infinite; }
.anim-ring        { animation: ringPulse 2.4s ease-out infinite; }
.card-in          { opacity: 0; animation: cardIn .6s cubic-bezier(.2,.7,.2,1) forwards; }
.city-card .card-shine {
  position: absolute; top: 0; left: -70%; width: 40%; height: 100%; opacity: 0; pointer-events: none;
  background: linear-gradient(120deg, transparent, rgba(255,255,255,.7), transparent);
  transform: skewX(-20deg);
}
.city-card:hover .card-shine { opacity: 1; animation: shine .9s ease-out; }

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

/* Prevent any accidental sideways scroll on small screens */
html, body { max-width: 100%; overflow-x: hidden; }

/* Inputs at 16px stop iOS Safari from zooming the page on focus */
@media (max-width: 639px) {
  .no-zoom { font-size: 16px !important; }
}

/* Touch devices: don't leave cards "stuck" in their hover state */
@media (hover: none) {
  .marquee:hover .anim-marquee { animation-play-state: running; }
  .city-marquee:hover .anim-marquee-ltr { animation-play-state: running; }
}

@media (prefers-reduced-motion: reduce) {
  .anim-float, .anim-float-slow, .anim-blob, .anim-gradient, .anim-marquee,
  .anim-marquee-ltr, .anim-pin, .anim-ring,
  .btn-shine::after { animation: none !important; }
  .fade-up, .pop-in, .card-in { animation: none !important; opacity: 1 !important; }
  .city-marquee { overflow-x: auto !important; }
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
        className={`fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 h-11 w-11 sm:h-12 sm:w-12 rounded-full bg-gradient-to-br from-red-500 to-orange-500 text-white shadow-lg shadow-orange-500/40 grid place-items-center transition-all duration-300 hover:scale-110 ${
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
/*  Dynamic filters (built from the restaurants in your database)      */
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

// Accepts either an array or { restaurants: [...] } from the API
const toList = (data) =>
  Array.isArray(data)
    ? data
    : Array.isArray(data?.restaurants)
    ? data.restaurants
    : [];

/* Unique cuisines across all restaurants, most popular first */
const buildCuisines = (data) => {
  const counts = new Map();
  toList(data).forEach((r) =>
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

/* Unique cities across all restaurants, most restaurants first */
const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

const buildCities = (data) => {
  const counts = new Map();
  toList(data).forEach((r) => {
    const name = String(r.city || "").trim();
    if (!name) return;
    const key = name.toLowerCase(); // "bhopal" and "Bhopal " count as one city
    const entry = counts.get(key) || { name: titleCase(name), count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  });
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name)
  );
};

// Shown until the API answers, or if it is empty or fails
const FALLBACK_CITIES = [
  "Bhopal", "Indore", "Delhi", "Mumbai", "Bengaluru", "Jaipur",
].map((name) => ({ name, count: 0 }));

// One shared request for cuisines AND cities (refreshed every 5 minutes)
const CACHE_MS = 5 * 60 * 1000;
let filterCache = { promise: null, at: 0 };

const loadFilters = () => {
  if (!filterCache.promise || Date.now() - filterCache.at > CACHE_MS) {
    filterCache = {
      at: Date.now(),
      promise: api
        .get("/restaurants")
        .then(({ data }) => ({
          cuisines: buildCuisines(data),
          cities: buildCities(data),
        }))
        .catch((err) => {
          filterCache = { promise: null, at: 0 };
          throw err;
        }),
    };
  }
  return filterCache.promise;
};

function useFilterData() {
  const [state, setState] = useState({ data: null, loading: true });

  useEffect(() => {
    let alive = true;
    loadFilters()
      .then((data) => alive && setState({ data, loading: false }))
      .catch(() => alive && setState({ data: null, loading: false }));
    return () => {
      alive = false;
    };
  }, []);

  return state;
}

/* Live cuisines, or the built-in list if the API is empty or fails */
function useCuisineList() {
  const { data, loading } = useFilterData();
  const live = Boolean(data?.cuisines?.length);
  return { cuisines: live ? data.cuisines : CUISINES, loading, live };
}

/* Live cities, or a short fallback list */
function useCityList() {
  const { data, loading } = useFilterData();
  const live = Boolean(data?.cities?.length);
  return { cities: live ? data.cities : FALLBACK_CITIES, loading, live };
}

const STEPS = [
  {
    title: "Search",
    text: "Pick your city, date, time and number of guests.",
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
  {
    name: "Vikram D.",
    role: "Booked 5 times",
    text: "Seeing the floor plan before booking is a game changer. I avoided the noisy table near the kitchen.",
  },
  {
    name: "Sneha R.",
    role: "Booked 17 times",
    text: "Our birthday dinner went smoothly. The corner table was reserved just as I selected it.",
  },
  {
    name: "Arjun P.",
    role: "Booked 3 times",
    text: "Simple, fast and reliable. I booked from my phone while stuck in traffic.",
  },
  {
    name: "Kavya N.",
    role: "Booked 26 times",
    text: "I plan client lunches every week and this saves me so much time. The reminders are a nice touch.",
  },
  {
    name: "Mohit J.",
    role: "Booked 11 times",
    text: "Changed my reservation twice without any hassle. The restaurant had the update right away.",
  },
  {
    name: "Divya L.",
    role: "Booked 9 times",
    text: "Loved choosing a quiet booth for a date night. The ambience matched the photos perfectly.",
  },
  {
    name: "Karan T.",
    role: "Booked 6 times",
    text: "Walked in, gave my name and was seated immediately. No confusion about the table at all.",
  },
  {
    name: "Meera B.",
    role: "Booked 19 times",
    text: "Family brunches used to be chaos. Now I reserve a long table and everyone sits together.",
  },
  {
    name: "Sandeep V.",
    role: "Booked 13 times",
    text: "The live availability is accurate. I have never shown up to find my table taken.",
  },
  {
    name: "Tanvi G.",
    role: "Booked 4 times",
    text: "Booking a rooftop table for sunset was so easy. The view was every bit as good as promised.",
  },
  {
    name: "Rahul C.",
    role: "Booked 15 times",
    text: "Great for last-minute plans. I found a table for six within minutes on a Friday night.",
  },
  {
    name: "Ishita W.",
    role: "Booked 7 times",
    text: "The interface is clean and clear. Even my parents figured out how to book on their own.",
  },
  {
    name: "Nikhil A.",
    role: "Booked 22 times",
    text: "Our team outings are now stress free. Everyone knows exactly where we are sitting before we arrive.",
  },
  {
    name: "Pooja H.",
    role: "Booked 10 times",
    text: "I like that I can pick an accessible table near the entrance for my grandmother. Thoughtful feature.",
  },
  {
    name: "Aditya F.",
    role: "Booked 2 times",
    text: "First time using it and it was painless. The table I chose was ready and waiting.",
  },
  {
    name: "Shreya O.",
    role: "Booked 18 times",
    text: "Perfect for friend get-togethers. We grabbed an outdoor table and the evening was lovely.",
  },
  {
    name: "Harsh E.",
    role: "Booked 12 times",
    text: "Quick booking, instant confirmation and no surprises at the restaurant. Exactly what I wanted.",
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
  <Reveal className="text-center max-w-2xl mx-auto mb-8 sm:mb-14">
    {eyebrow && (
      <p className="text-[11px] sm:text-xs font-semibold tracking-[0.2em] uppercase text-red-600">
        {eyebrow}
      </p>
    )}
    <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-4xl text-stone-900 break-words">
      {title}
    </h2>
    <div className="mx-auto mt-4 h-1 w-16 rounded-full bg-gradient-to-r from-red-500 via-orange-500 to-amber-400" />
    {subtitle && (
      <p className="mt-4 text-sm sm:text-base text-stone-600">{subtitle}</p>
    )}
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
    <div className="marquee relative overflow-hidden border-y border-orange-100 bg-gradient-to-r from-red-50 via-amber-50 to-orange-50 py-3 sm:py-4">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-8 sm:w-16 bg-gradient-to-r from-white to-transparent z-10" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 sm:w-16 bg-gradient-to-l from-white to-transparent z-10" />
      <div className="anim-marquee flex w-max gap-2 sm:gap-3">
        {items.map((c, i) => (
          <Link
            key={`${c.name}-${i}`}
            to={`/restaurants?cuisine=${encodeURIComponent(c.name)}`}
            className="flex items-center gap-2 whitespace-nowrap rounded-full bg-white px-3 py-2 sm:px-4 text-xs sm:text-sm font-medium text-stone-700 ring-1 ring-orange-100 hover:ring-orange-300 hover:text-red-600 hover:shadow-md transition"
          >
            <span className="text-base sm:text-lg">{c.emoji}</span>
            {c.name}
          </Link>
        ))}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Cuisine section: one endless row, hover effects, no controls        */
/*  Uses (already in your Home.jsx): Link, SectionHeading, useCuisineList */
/*  Replaces: the old CuisineSection (and delete the old CuisineMarquee) */
/* ------------------------------------------------------------------ */

const CUISINE_CSS = `
@keyframes cuisineLtr { from { transform: translateX(-50%) } to { transform: translateX(0) } }
@keyframes cuisineBob { 0%,100% { transform: translateY(0) rotate(0) } 50% { transform: translateY(-4px) rotate(-4deg) } }
@keyframes cuisineShine { 0% { left: -70% } 100% { left: 140% } }

.cuisine-track { animation: cuisineLtr 45s linear infinite; will-change: transform; }
.cuisine-bob   { display: inline-block; animation: cuisineBob 3.4s ease-in-out infinite; }

.cuisine-card .cuisine-shine {
  position: absolute; top: 0; left: -70%; width: 40%; height: 100%;
  opacity: 0; pointer-events: none; transform: skewX(-20deg);
  background: linear-gradient(120deg, transparent, rgba(255,255,255,.75), transparent);
}
.cuisine-card:hover .cuisine-shine { opacity: 1; animation: cuisineShine .8s ease-out; }

/* Pause while hovering (only on devices that can hover, so phones never freeze) */
@media (hover: hover) {
  .cuisine-row:hover .cuisine-track { animation-play-state: paused; }
}

@media (prefers-reduced-motion: reduce) {
  .cuisine-track, .cuisine-bob { animation: none !important; }
  .cuisine-row { overflow-x: auto; }
}
`;

const EDGE_MASK = {
  WebkitMaskImage:
    "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
  maskImage:
    "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
};

// Repeat a short list until it is long enough to fill a wide screen
const fillTo = (arr, min) => {
  if (!arr.length) return [];
  let out = [...arr];
  while (out.length < min) out = [...out, ...arr];
  return out;
};

const CuisineCard = ({ c, live, popular, index, hidden }) => (
  <Link
    to={`/restaurants?cuisine=${encodeURIComponent(c.name)}`}
    aria-hidden={hidden || undefined}
    tabIndex={hidden ? -1 : 0}
    className="cuisine-card group relative block w-36 sm:w-44 shrink-0 mr-3 sm:mr-4 overflow-hidden rounded-3xl bg-white p-4 sm:p-5 text-center ring-1 ring-stone-200 hover:ring-orange-300 hover:shadow-2xl hover:shadow-orange-500/20 hover:-translate-y-2 transition-all duration-300"
  >
    <span className="cuisine-shine" />
    <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-red-500/0 via-orange-400/0 to-amber-300/0 group-hover:from-red-500/5 group-hover:via-orange-400/10 group-hover:to-amber-300/20 transition-all duration-500" />

    {popular && (
      <span className="absolute top-2 right-2 rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
        Popular
      </span>
    )}

    <span className="relative mx-auto grid h-14 w-14 sm:h-16 sm:w-16 place-items-center rounded-2xl bg-gradient-to-br from-amber-50 to-orange-100 ring-1 ring-orange-100 transition-all duration-300 group-hover:from-red-500 group-hover:to-orange-500 group-hover:rotate-6 group-hover:scale-110">
      <span
        className="cuisine-bob text-3xl sm:text-4xl"
        style={{ animationDelay: `${(index % 7) * -0.6}s` }}
      >
        {c.emoji}
      </span>
    </span>

    <span className="relative mt-3 block text-sm font-semibold text-stone-800 group-hover:text-red-600 transition-colors break-words">
      {c.name}
    </span>
    {live && (
      <span className="relative mt-0.5 block text-xs text-stone-400">
        {c.count} {c.count === 1 ? "place" : "places"}
      </span>
    )}
    <span className="relative mt-2 flex items-center justify-center gap-1 text-xs font-semibold text-red-500 opacity-0 translate-y-1 transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0">
      Explore
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5 fill-none stroke-current"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </span>
  </Link>
);

const CuisineSection = () => {
  const { cuisines, loading, live } = useCuisineList();

  const items = fillTo(cuisines, 8);
  const popular = live ? new Set(cuisines.slice(0, 3).map((c) => c.name)) : new Set();
  // Constant speed regardless of how many cuisines there are
  const duration = Math.max(32, items.length * 4.5);

  return (
    <section className="relative overflow-hidden py-12 sm:py-20 bg-gradient-to-b from-white via-orange-50/40 to-white">
      <style>{CUISINE_CSS}</style>

      {/* Soft drifting colour behind the row */}
      <div className="anim-blob pointer-events-none absolute -left-24 top-1/4 h-60 w-60 sm:h-80 sm:w-80 rounded-full bg-amber-300/25 blur-3xl" />
      <div
        className="anim-blob pointer-events-none absolute -right-24 bottom-1/4 h-60 w-60 sm:h-80 sm:w-80 rounded-full bg-red-300/20 blur-3xl"
        style={{ animationDelay: "-8s" }}
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
        <SectionHeading
          eyebrow="Explore"
          title="What are you craving?"
          subtitle="Browse by cuisine and find the right place for any mood."
        />
      </div>

      <div className="cuisine-row relative" style={EDGE_MASK} aria-busy={loading}>
        {loading ? (
          <div className="flex gap-3 sm:gap-4 overflow-hidden px-4 sm:px-6 py-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-[148px] w-36 sm:w-44 shrink-0 animate-pulse rounded-3xl bg-gradient-to-br from-stone-100 to-amber-50"
              />
            ))}
          </div>
        ) : (
          /* The list is rendered twice so the loop never shows a gap */
          <div
            className="cuisine-track flex w-max py-3"
            style={{ animationDuration: `${duration}s` }}
          >
            {[...items, ...items].map((c, i) => (
              <CuisineCard
                key={`${c.name}-${i}`}
                c={c}
                live={live}
                popular={popular.has(c.name)}
                index={i}
                hidden={i >= items.length}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

/* Cities pulled automatically from your restaurants */
const CityCard = ({ c, live, index = 0 }) => (
  <Link
    to={`/restaurants?city=${encodeURIComponent(c.name)}`}
    className="city-card group relative block w-40 sm:w-52 shrink-0 mr-3 sm:mr-4 overflow-hidden rounded-2xl bg-white p-4 sm:p-5 text-center ring-1 ring-orange-100 hover:ring-orange-300 hover:shadow-xl hover:shadow-orange-500/25 hover:-translate-y-2 transition-all duration-300"
  >
    <span className="card-shine" />
    <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-red-500/0 to-amber-300/0 group-hover:from-red-500/10 group-hover:to-amber-300/25 transition-all duration-500" />

    <span className="relative mx-auto grid h-11 w-11 place-items-center">
      <span
        className="anim-ring absolute inset-0 rounded-full bg-orange-400/50"
        style={{ animationDelay: `${(index % 6) * 0.4}s` }}
      />
      <span
        className="anim-pin relative grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-red-500 to-orange-500 text-white shadow-md shadow-orange-500/30 transition-transform duration-300 group-hover:scale-125"
        style={{ animationDelay: `${(index % 6) * 0.3}s` }}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 fill-none stroke-current"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
      </span>
    </span>

    <p className="relative mt-3 font-semibold text-stone-900 group-hover:text-red-600 transition-colors break-words">
      {c.name}
    </p>
    {live && (
      <p className="relative mt-1 text-xs text-orange-600 font-medium">
        {c.count} {c.count === 1 ? "restaurant" : "restaurants"}
      </p>
    )}
    <span className="relative mx-auto mt-3 block h-0.5 w-6 bg-gradient-to-r from-red-500 to-amber-400 transition-all duration-300 group-hover:w-14" />
  </Link>
);

const CitySection = () => {
  const { cities, loading, live } = useCityList();

  // Repeat short lists so the strip always fills wide screens
  let base = cities;
  while (base.length > 0 && base.length < 8) base = [...base, ...cities];
  const items = [...base, ...base];
  // Keep the speed steady no matter how many cities there are
  const duration = Math.max(28, base.length * 5);

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-white to-amber-50/70 py-12 sm:py-4">
      {/* Soft drifting colour behind the cards */}
      <div className="anim-blob pointer-events-none absolute -left-20 top-10 h-52 w-52 sm:h-72 sm:w-72 rounded-full bg-orange-300/25 blur-3xl" />
      <div
        className="anim-blob pointer-events-none absolute -right-20 bottom-0 h-52 w-52 sm:h-72 sm:w-72 rounded-full bg-red-300/20 blur-3xl"
        style={{ animationDelay: "-7s" }}
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
        <SectionHeading
          eyebrow="Available in"
          title="Find restaurants in your city"
          subtitle="Pick your city and see where you can book tonight."
        />
      </div>

      <div
        className="city-marquee relative mt-2"
        aria-busy={loading}
        style={{
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
          maskImage:
            "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
        }}
      >
        {loading ? (
          <div className="flex w-max py-6 px-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="mr-3 sm:mr-4 h-[130px] w-40 sm:w-52 shrink-0 animate-pulse rounded-2xl bg-gradient-to-br from-stone-100 to-amber-50"
              />
            ))}
          </div>
        ) : (
          /* Track moves left to right; the list is doubled so the loop has no gap */
          <div
            className="anim-marquee-ltr flex w-max py-6"
            style={{ animationDuration: `${duration}s` }}
          >
            {items.map((c, i) => (
              <div
                key={`${c.name}-${i}`}
                className="card-in"
                style={{ animationDelay: `${Math.min(i, 8) * 80}ms` }}
                aria-hidden={i >= base.length}
              >
                <CityCard c={c} live={live} index={i} />
              </div>
            ))}
          </div>
        )}
      </div>

      
    </section>
  );
};

/* ------------------------------------------------------------------ */
/*  Premium FAQ                                                         */
/*  Needs (already in your Home.jsx): useState, useRef, Link, Reveal,   */
/*  FAQS.  Replaces: the old FaqItem component + the inline FAQ section. */
/*  Use it as:  <FaqSection />                                           */
/* ------------------------------------------------------------------ */

const FAQ_CSS = `
@keyframes faqFloat { 0%,100% { transform: translateY(0) rotate(0) } 50% { transform: translateY(-6px) rotate(-4deg) } }
.faq-float { animation: faqFloat 4.5s ease-in-out infinite; }
.faq-dots {
  background-image: radial-gradient(rgba(251,146,60,.28) 1px, transparent 1px);
  background-size: 22px 22px;
  -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
  mask-image: radial-gradient(ellipse at center, black 30%, transparent 75%);
}
@media (prefers-reduced-motion: reduce) {
  .faq-float { animation: none !important; }
}
`;

const FaqItem = ({ id, index, q, a, open, onToggle }) => (
  <div
    className={`relative rounded-2xl p-px transition-all duration-500 ${
      open
        ? "bg-gradient-to-r from-red-500 via-orange-500 to-amber-400 shadow-xl shadow-orange-500/15"
        : "bg-stone-200/80 hover:bg-orange-200 hover:shadow-md hover:shadow-orange-500/10"
    }`}
  >
    <div
      className={`rounded-[15px] transition-colors duration-500 ${
        open ? "bg-gradient-to-br from-white to-amber-50/60" : "bg-white"
      }`}
    >
      <h3>
        <button
          id={`faq-btn-${id}`}
          data-faq-btn
          aria-expanded={open}
          aria-controls={`faq-panel-${id}`}
          onClick={onToggle}
          className="group flex w-full items-center gap-3 sm:gap-4 px-4 sm:px-6 py-4 sm:py-5 text-left rounded-[15px] focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
        >
          <span
            className={`w-6 shrink-0 font-display text-sm tabular-nums transition-colors duration-300 ${
              open ? "text-red-500" : "text-stone-300 group-hover:text-orange-400"
            }`}
          >
            {String(index + 1).padStart(2, "0")}
          </span>

          <span
            className={`flex-1 text-sm sm:text-base font-semibold transition-colors duration-300 ${
              open ? "text-stone-900" : "text-stone-800 group-hover:text-red-600"
            }`}
          >
            {q}
          </span>

          <span
            className={`grid h-8 w-8 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-full transition-all duration-500 ${
              open
                ? "rotate-180 bg-gradient-to-br from-red-500 to-orange-500 text-white shadow-md shadow-orange-500/30"
                : "bg-amber-50 text-red-600 group-hover:bg-orange-100"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 fill-none stroke-current"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M5 12h14" />
              <path
                d="M12 5v14"
                className="transition-transform duration-300"
                style={{
                  transformOrigin: "center",
                  transformBox: "fill-box",
                  transform: open ? "scaleY(0)" : "scaleY(1)",
                }}
              />
            </svg>
          </span>
        </button>
      </h3>

      <div
        id={`faq-panel-${id}`}
        role="region"
        aria-labelledby={`faq-btn-${id}`}
        aria-hidden={!open}
        className={`grid transition-[grid-template-rows] duration-500 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <p
            className={`pl-[3.25rem] sm:pl-16 pr-4 sm:pr-14 pb-5 sm:pb-6 text-sm sm:text-base leading-relaxed text-stone-600 transition-all duration-500 ${
              open ? "translate-y-0 opacity-100 delay-100" : "-translate-y-2 opacity-0"
            }`}
          >
            {a}
          </p>
        </div>
      </div>
    </div>
  </div>
);

const FaqSection = () => {
  const [openIdx, setOpenIdx] = useState(0); // first question starts open
  const listRef = useRef(null);

  // Keyboard support: Up / Down / Home / End move between questions
  const onKeyDown = (e) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const btns = [...listRef.current.querySelectorAll("[data-faq-btn]")];
    const current = btns.indexOf(document.activeElement);
    if (current === -1) return;
    e.preventDefault();
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
        ? btns.length - 1
        : (current + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length;
    btns[next].focus();
  };

  return (
    <section className="relative overflow-hidden py-12 sm:py-24">
      <style>{FAQ_CSS}</style>

      {/* Decorative background */}
      <div className="faq-dots pointer-events-none absolute inset-0" />
      <div className="anim-blob pointer-events-none absolute -left-24 top-10 h-60 w-60 sm:h-80 sm:w-80 rounded-full bg-amber-300/25 blur-3xl" />
      <div
        className="anim-blob pointer-events-none absolute -right-24 bottom-10 h-60 w-60 sm:h-80 sm:w-80 rounded-full bg-red-300/20 blur-3xl"
        style={{ animationDelay: "-6s" }}
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-10 lg:gap-16 items-start">
        {/* Left: intro + support card (sticks while the list scrolls on desktop) */}
        <div className="text-center lg:text-left lg:sticky lg:top-24">
          <Reveal from="left">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-[11px] sm:text-xs font-semibold uppercase tracking-[0.2em] text-red-600 ring-1 ring-orange-200 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              FAQ
            </span>

            <h2 className="mt-4 font-display text-3xl sm:text-4xl lg:text-5xl leading-[1.1] text-stone-900">
              Questions?{" "}
              <span className="anim-gradient bg-gradient-to-r from-red-500 via-orange-500 to-amber-400 bg-clip-text text-transparent">
                We've got answers.
              </span>
            </h2>

            <div className="mx-auto lg:mx-0 mt-5 h-1 w-16 rounded-full bg-gradient-to-r from-red-500 via-orange-500 to-amber-400" />

            <p className="mt-5 text-sm sm:text-base text-stone-600 max-w-md mx-auto lg:mx-0">
              Everything you need to know about booking a table, ordering ahead
              and changing your plans.
            </p>
          </Reveal>

          <Reveal from="left" delay={150} className="mt-8 hidden sm:block">
            <div className="relative overflow-hidden rounded-3xl bg-stone-900 p-6 text-left text-white shadow-2xl shadow-stone-900/20">
              <div className="anim-blob absolute -right-10 -top-10 h-40 w-40 rounded-full bg-red-500/30 blur-3xl" />
              <div className="relative flex items-start gap-4">
                <span className="faq-float grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 shadow-lg shadow-orange-500/30">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-6 w-6 fill-none stroke-current"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />
                  </svg>
                </span>
                <div>
                  <p className="font-semibold">Still have questions?</p>
                  <p className="mt-1 text-sm text-stone-300">
                    Can't find what you're looking for? Reach out and we'll help.
                  </p>
                  {/* TODO: point this at your real contact / support page */}
                  <Link
                    to="/contact"
                    className="btn-shine mt-4 inline-block rounded-full bg-white px-5 py-2 text-sm font-semibold text-red-600 transition-all hover:scale-105 hover:shadow-lg"
                  >
                    Contact us
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Right: accordion (one open at a time) */}
        <div ref={listRef} onKeyDown={onKeyDown} className="space-y-3 sm:space-y-4">
          {FAQS.map((f, i) => (
            <Reveal key={f.q} delay={i * 80}>
              <FaqItem
                id={i}
                index={i}
                q={f.q}
                a={f.a}
                open={openIdx === i}
                onToggle={() => setOpenIdx(openIdx === i ? -1 : i)}
              />
            </Reveal>
          ))}

          {/* Mobile version of the support prompt */}
          <Reveal className="sm:hidden pt-2 text-center">
            <p className="text-sm text-stone-600">
              Still have questions?{" "}
              <Link to="/contact" className="font-semibold text-red-600 underline underline-offset-4">
                Contact us
              </Link>
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ */
/*  Booking search bar                                                 */
/* ------------------------------------------------------------------ */

const todayISO = () => new Date().toISOString().split("T")[0];

const SearchBar = () => {
  const navigate = useNavigate();
  const { cities } = useCityList();
  const [form, setForm] = useState({
    city: "",
    date: todayISO(),
    time: "20:00",
    guests: "2",
  });

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    // Leave empty values out so "All cities" doesn't add a blank ?city=
    const clean = Object.fromEntries(
      Object.entries(form).filter(([, v]) => v !== "")
    );
    const params = new URLSearchParams(clean).toString();
    navigate(`/restaurants?${params}`);
  };

  const field =
    "no-zoom w-full min-w-0 bg-transparent text-sm text-stone-900 placeholder-stone-400 focus:outline-none";
  const label =
    "block text-[11px] font-semibold uppercase tracking-wider text-stone-500 mb-1";
  const cell =
    "min-w-0 bg-white px-3 sm:px-4 py-3 transition-colors focus-within:bg-amber-50";

  return (
    <form
      onSubmit={submit}
      className="fade-up mt-8 sm:mt-10 grid grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_auto] gap-px bg-orange-100 rounded-2xl overflow-hidden shadow-2xl shadow-orange-500/20 ring-1 ring-orange-200"
      style={{ animationDelay: "0.6s" }}
    >
      <div className={`col-span-2 lg:col-span-1 ${cell}`}>
        <label htmlFor="city" className={label}>
          City
        </label>
        <select
          id="city"
          name="city"
          value={form.city}
          onChange={update}
          className={field}
        >
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
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
      <div className={`col-span-2 lg:col-span-1 ${cell}`}>
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
  <div className="bg-white text-stone-800 overflow-x-clip">
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

      {/* Drifting colour blobs (smaller on phones so they don't overpower the text) */}
      <div className="anim-blob absolute -top-16 -left-16 sm:-top-24 sm:-left-24 h-56 w-56 sm:h-96 sm:w-96 rounded-full bg-red-400/30 blur-3xl" />
      <div
        className="anim-blob absolute top-1/3 -right-16 sm:-right-24 h-56 w-56 sm:h-96 sm:w-96 rounded-full bg-amber-300/40 blur-3xl"
        style={{ animationDelay: "-5s" }}
      />
      <div
        className="anim-blob absolute -bottom-16 sm:-bottom-24 left-1/3 h-48 w-48 sm:h-80 sm:w-80 rounded-full bg-orange-300/35 blur-3xl"
        style={{ animationDelay: "-9s" }}
      />
      <div className="absolute bottom-0 left-0 right-0 h-24 sm:h-32 bg-gradient-to-t from-white to-transparent" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-20 pb-16 sm:pb-28">
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
              className="fade-up mt-5 font-display text-3xl sm:text-4xl lg:text-6xl md:text-5xl text-stone-900 leading-[1.15] sm:leading-[1.1]"
              style={{ animationDelay: "0.15s" }}
            >
              Book the perfect table,
              <br />
              <span className="anim-gradient bg-gradient-to-r from-red-500 via-orange-500 to-amber-400 bg-clip-text text-transparent">
                every time.
              </span>
            </h1>

            <p
              className="fade-up mt-4 sm:mt-5 text-base sm:text-lg text-stone-600 max-w-xl mx-auto md:mx-0"
              style={{ animationDelay: "0.3s" }}
            >
              Find a restaurant, pick your exact table, and reserve it in
              seconds. No calls, no waiting.
            </p>

            <div
              className="fade-up mt-6 sm:mt-8 flex flex-col min-[420px]:flex-row flex-wrap gap-3 justify-center md:justify-start"
              style={{ animationDelay: "0.45s" }}
            >
              <Link
                to="/restaurants"
                className="btn-shine text-center rounded-full bg-gradient-to-r from-red-500 to-orange-500 text-white px-7 py-3 text-sm sm:text-base font-semibold shadow-lg shadow-orange-500/30 hover:shadow-xl hover:shadow-orange-500/40 hover:-translate-y-0.5 transition-all"
              >
                Reserve now
              </Link>
              <a
                href="#how-it-works"
                className="text-center rounded-full bg-white text-stone-800 ring-1 ring-stone-300 px-7 py-3 text-sm sm:text-base font-semibold hover:ring-orange-400 hover:text-red-600 hover:-translate-y-0.5 transition-all"
              >
                How it works
              </a>
            </div>

            <div
              className="fade-up mt-8 sm:mt-10 flex items-stretch justify-center md:justify-start divide-x divide-orange-200"
              style={{ animationDelay: "0.6s" }}
            >
              <div className="px-3 sm:px-6 first:pl-0">
                <p className="font-display text-lg sm:text-2xl text-stone-900">
                  <CountUp end={500} suffix="+" />
                </p>
                <p className="text-[10px] sm:text-xs text-stone-500">
                  Partner restaurants
                </p>
              </div>
              <div className="px-3 sm:px-6">
                <p className="font-display text-lg sm:text-2xl text-stone-900">
                  <CountUp end={50} suffix="k+" />
                </p>
                <p className="text-[10px] sm:text-xs text-stone-500">
                  Tables booked
                </p>
              </div>
              <div className="px-3 sm:px-6">
                <p className="font-display text-lg sm:text-2xl text-stone-900">
                  <CountUp end={4.8} decimals={1} suffix="★" />
                </p>
                <p className="text-[10px] sm:text-xs text-stone-500">
                  Average rating
                </p>
              </div>
            </div>
          </div>

          {/* Image is now shown on phones too (previously hidden below 640px) */}
          <div
            className="pop-in flex justify-center md:justify-end px-3 sm:px-0 pb-4 sm:pb-0"
            style={{ animationDelay: "0.3s" }}
          >
            <div className="relative w-full max-w-xs sm:max-w-sm md:max-w-md">
              {/* Glow behind image */}
              <div className="absolute -inset-3 sm:-inset-4 rounded-[2rem] bg-gradient-to-br from-red-400/40 via-orange-300/40 to-amber-300/40 blur-2xl" />
              <div className="anim-float relative">
                <img
                  src="/images/hero_visual.png"
                  alt="A beautifully set restaurant table"
                  className="relative rounded-3xl shadow-2xl w-full max-h-[320px] sm:max-h-none object-cover ring-4 ring-white"
                />
              </div>

              <div className="anim-float-slow absolute -bottom-5 -left-2 sm:-left-6 bg-white rounded-2xl shadow-xl px-3 py-2 sm:px-4 sm:py-3 flex items-center gap-2 sm:gap-3">
                <span className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-gradient-to-br from-red-500 to-orange-500 text-white grid place-items-center">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4 sm:h-5 sm:w-5 fill-none stroke-current"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                <div>
                  <p className="text-xs sm:text-sm font-semibold text-stone-900">
                    Table confirmed
                  </p>
                  <p className="text-[10px] sm:text-xs text-stone-500">
                    Today, 8:00 PM · 2 guests
                  </p>
                </div>
              </div>

              <div
                className="anim-float absolute -top-4 -right-2 sm:-right-4 bg-white rounded-2xl shadow-xl px-3 py-2 sm:px-3.5 sm:py-2.5 flex items-center gap-2"
                style={{ animationDelay: "-2s" }}
              >
                <span className="text-amber-400 text-lg">★</span>
                <span className="text-sm font-semibold text-stone-900">4.8</span>
                <span className="text-xs text-stone-500">top rated</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    {/* ================= CUISINE MARQUEE ================= */}
    <CuisineMarquee />

    {/* ================= CUISINES ================= */}
    <CuisineSection />

    {/* ================= FEATURED (your existing component) ================= */}
    <FeaturedRestaurants />

    {/* ================= CITIES (automatic, from your restaurants) ================= */}
    <CitySection />

    {/* ================= HOW IT WORKS ================= */}
    <section
      id="how-it-works"
      className="bg-gradient-to-b from-amber-50/70 to-white py-12 sm:py-4 scroll-mt-16"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <SectionHeading
          eyebrow="Simple process"
          title="Reserve and order in four easy steps"
          subtitle="From search to a confirmed table and meal in just a few minutes."
        />
        <div className="relative grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <div className="hidden lg:block absolute top-14 left-[12%] right-[12%] border-t-2 border-dashed border-orange-300" />
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 150}>
              <div className="group relative h-full rounded-2xl bg-white p-5 sm:p-7 shadow-sm ring-1 ring-orange-100 hover:shadow-xl hover:shadow-orange-500/10 hover:-translate-y-2 transition-all duration-300">
                <span className="absolute top-4 right-5 sm:top-5 sm:right-6 font-display text-4xl sm:text-5xl text-amber-100 group-hover:text-amber-200 transition-colors">
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
                <h3 className="mt-4 sm:mt-5 text-lg font-semibold text-stone-900">
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
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-20">
      <Reveal>
        <div className="anim-gradient relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-r from-red-500 via-orange-500 to-amber-400 px-5 sm:px-12 py-10 sm:py-14 text-white shadow-2xl shadow-orange-500/25">
          <div className="anim-float absolute -right-16 -top-16 h-48 w-48 sm:h-64 sm:w-64 rounded-full bg-white/15" />
          <div className="anim-float-slow absolute -right-4 -bottom-20 h-44 w-44 sm:h-56 sm:w-56 rounded-full bg-white/15" />
          <div className="anim-float absolute left-1/3 -bottom-10 h-24 w-24 rounded-full bg-white/10" />
          <div className="relative grid md:grid-cols-[1fr_auto] gap-6 items-center">
            <div>
              <p className="text-[11px] sm:text-xs font-semibold tracking-[0.2em] uppercase text-white/90">
                Limited time
              </p>
              <h2 className="mt-2 font-display text-2xl sm:text-3xl md:text-4xl drop-shadow-sm">
                Get 20% off your first booking
              </h2>
              <p className="mt-3 text-sm sm:text-base text-white/95 max-w-xl">
                Create a free account and enjoy a welcome discount at selected
                partner restaurants.
              </p>
            </div>
            <Link
              to="/signup"
              className="btn-shine text-center justify-self-stretch sm:justify-self-start md:justify-self-end rounded-full bg-white text-red-600 font-semibold px-8 py-3 shadow-lg hover:scale-105 hover:shadow-xl transition-all"
            >
              Claim offer
            </Link>
          </div>
        </div>
      </Reveal>
    </section>

    {/* ================= WHY US ================= */}
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-12 sm:pb-24">
      <SectionHeading
        eyebrow="Why diners love us"
        title="Everything you need for a perfect night out"
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {FEATURES.map((f, i) => (
          <Reveal key={f.title} delay={(i % 3) * 100}>
            <div className="group h-full rounded-2xl border border-stone-200 p-5 sm:p-6 hover:border-amber-300 hover:shadow-xl hover:shadow-orange-500/10 hover:-translate-y-1 transition-all duration-300">
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

    

    {/* ================= TESTIMONIALS ================= */}
    <section className="py-12 sm:py-24 overflow-hidden">
      <style>{`
        @keyframes marquee-ltr {
          from { transform: translateX(-50%); }
          to   { transform: translateX(0); }
        }
        .marquee-track { animation: marquee-ltr 70s linear infinite; }
        .marquee:hover .marquee-track { animation-play-state: paused; }
        @media (hover: none) {
          .marquee:hover .marquee-track { animation-play-state: running; }
        }
        @media (prefers-reduced-motion: reduce) {
          .marquee-track { animation: none; }
        }
      `}</style>

      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <SectionHeading eyebrow="Reviews" title="Loved by thousands of diners" />
      </div>

      <div
        className="marquee mt-6 sm:mt-10"
        style={{
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black 6%, black 94%, transparent)",
          maskImage:
            "linear-gradient(to right, transparent, black 6%, black 94%, transparent)",
        }}
      >
        {/* Reviews are rendered twice so the loop never shows a gap */}
        <div className="marquee-track flex w-max py-4">
          {[...REVIEWS, ...REVIEWS].map((r, i) => (
            <figure
              key={`${r.name}-${i}`}
              aria-hidden={i >= REVIEWS.length}
              className="w-[17rem] sm:w-80 shrink-0 mr-4 sm:mr-6 rounded-2xl bg-white p-5 sm:p-7 shadow-sm ring-1 ring-orange-100 hover:shadow-xl hover:shadow-orange-500/10 hover:-translate-y-2 transition-all duration-300"
            >
              <Stars />
              <blockquote className="mt-4 text-sm sm:text-base text-stone-700 whitespace-normal">
                “{r.text}”
              </blockquote>
              <figcaption className="mt-5 sm:mt-6 flex items-center gap-3">
                <span className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-red-500 to-amber-400 text-white grid place-items-center font-semibold">
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
          ))}
        </div>
      </div>
    </section>

    

    {/* ================= OWNER CTA ================= */}
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-12 sm:pb-24">
      <Reveal>
        <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-stone-900 text-white px-5 sm:px-12 py-10 sm:py-14 grid md:grid-cols-[1fr_auto] gap-6 items-center">
          <div className="anim-blob absolute -left-10 -top-10 h-44 w-44 sm:h-56 sm:w-56 rounded-full bg-red-500/25 blur-3xl" />
          <div
            className="anim-blob absolute -right-10 -bottom-10 h-44 w-44 sm:h-56 sm:w-56 rounded-full bg-amber-400/25 blur-3xl"
            style={{ animationDelay: "-6s" }}
          />
          <div className="relative">
            <h2 className="font-display text-2xl sm:text-3xl md:text-4xl">
              Own a restaurant?{" "}
              <span className="anim-gradient bg-gradient-to-r from-red-400 via-orange-400 to-amber-300 bg-clip-text text-transparent">
                Fill more tables.
              </span>
            </h2>
            <p className="mt-3 text-sm sm:text-base text-stone-300 max-w-xl">
              List your restaurant, manage your floor plan and reservations, and
              reach thousands of diners every day.
            </p>
          </div>
          <Link
            to="/register"
            className="btn-shine relative text-center justify-self-stretch sm:justify-self-start md:justify-self-end rounded-full bg-gradient-to-r from-red-500 to-orange-500 text-white font-semibold px-8 py-3 hover:scale-105 hover:shadow-lg hover:shadow-orange-500/30 transition-all"
          >
            Partner with us
          </Link>
        </div>
      </Reveal>
    </section>
    
     {/* ================= FAQ ================= */}
    <FaqSection />

    <Footer />
  </div>
);

export default Home;