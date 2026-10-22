import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../api/axios.js";

const OWNER_RESTAURANTS_ENDPOINT = "/restaurants/mine";

// Table booking is live. Flip this to true when online food ordering launches
// and the "Order Food" / "My Orders" links will appear automatically.
const ORDERS_ENABLED = false;

const RECENT_KEY = "bl_recent_searches";
const MAX_RECENT = 5;
const POPULAR_SEARCHES = ["Biryani", "Pizza", "Cafe", "North Indian", "Desserts", "Rooftop"];

/* ------------------------------------------------------------------ */
/*  Icons                                                              */
/* ------------------------------------------------------------------ */

const Icon = ({ d, className = "h-6 w-6" }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    className={className}
    aria-hidden="true"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const ICONS = {
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6L6 18",
  search: "M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14z",
  back: "M10 19l-7-7m0 0l7-7m-7 7h18",
  plus: "M12 4v16m8-8H4",
  home: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10",
  restaurants: "M3 21h18M5 21V7l8-4v18M13 9h6v12M9 9h.01M9 12h.01M9 15h.01",
  calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  orders: "M9 2a1 1 0 00-1 1v1H5a2 2 0 00-2 2v13a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-3V3a1 1 0 00-1-1H9zM7 8h10M7 12h10M7 16h6",
  help: "M9.5 9a2.5 2.5 0 015 .5c0 1.5-2 1.75-2 3.25M12 17h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  info: "M12 16v-4M12 8h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  logout: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
  user: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21a8 8 0 0116 0",
  clock: "M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z",
  heart: "M12 20s-7-4.4-9-9a5 5 0 019-3 5 5 0 019 3c-2 4.6-9 9-9 9z",
  tag: "M3 12V4h8l10 10-8 8L3 12zM7.5 8.5h.01",
  mic: "M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3zM19 11a7 7 0 01-14 0M12 18v3M8 21h8",
  chevron: "M9 5l7 7-7 7",
  trending: "M3 17l6-6 4 4 8-8M15 7h6v6",
};

/* ------------------------------------------------------------------ */
/*  Small helpers                                                      */
/* ------------------------------------------------------------------ */

const Badge = ({ count }) =>
  count > 0 ? (
    <span className="inline-flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold leading-none text-stone-900">
      {count > 99 ? "99+" : count}
    </span>
  ) : null;

// Browser speech recognition (Chrome, Edge, Safari). Not available in Firefox.
const SpeechRecognitionAPI =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

const readRecents = () => {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(list) ? list.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
};

const writeRecents = (list) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: recents just won't persist */
  }
};

const getInitials = (name) => {
  const letters = (name || "")
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return letters || "U";
};

/* ------------------------------------------------------------------ */
/*  Hooks                                                              */
/* ------------------------------------------------------------------ */

/* Voice search. Live text goes to the box; the final phrase triggers onFinal. */
function useVoiceSearch({ onTranscript, onFinal, onProblem }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const handlers = useRef({});
  handlers.current = { onTranscript, onFinal, onProblem };

  const toggle = useCallback(() => {
    if (!SpeechRecognitionAPI) {
      handlers.current.onProblem("Voice search isn't supported in this browser. Try Chrome, Edge or Safari.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-IN"; // use "hi-IN" for Hindi or "en-US" for US English
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => setListening(true);
    recognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");
      handlers.current.onTranscript(transcript);
      if (e.results[e.results.length - 1].isFinal) handlers.current.onFinal(transcript.trim());
    };
    recognition.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        handlers.current.onProblem("Microphone access is blocked. Allow it in your browser settings and try again.");
      }
    };
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  }, [listening]);

  // Stop the microphone if the navbar unmounts
  useEffect(() => () => recognitionRef.current?.abort(), []);

  return { listening, toggle };
}

/* Pending bookings across all of an owner's restaurants (polls once a minute while the tab is visible) */
function useOwnerPending(enabled) {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setRestaurants([]);
      return undefined;
    }
    let cancelled = false;
    let inFlight = false;

    const load = async () => {
      if (inFlight) return; // never stack requests if the server is slow
      inFlight = true;
      setLoading(true);
      try {
        const { data } = await api.get(OWNER_RESTAURANTS_ENDPOINT);
        const list = Array.isArray(data) ? data : [];
        const withCounts = await Promise.all(
          list.map(async (r) => {
            try {
              const { data: bookings } = await api.get(`/bookings/restaurant/${r._id}`);
              const pendingCount = Array.isArray(bookings)
                ? bookings.filter((b) => b.status === "pending").length
                : 0;
              return { ...r, pendingCount };
            } catch {
              return { ...r, pendingCount: 0 };
            }
          })
        );
        if (!cancelled) setRestaurants(withCounts);
      } catch {
        if (!cancelled) setRestaurants([]);
      } finally {
        inFlight = false;
        if (!cancelled) setLoading(false);
      }
    };

    const tick = () => {
      if (!document.hidden) load();
    };
    load();
    const interval = setInterval(tick, 60000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [enabled]);

  return { restaurants, loading };
}

/* ------------------------------------------------------------------ */
/*  Navbar                                                             */
/* ------------------------------------------------------------------ */

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isOwner = user?.role === "owner";

  const [searchQuery, setSearchQuery] = useState(
    () => new URLSearchParams(location.search).get("search") || ""
  );
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [recents, setRecents] = useState(readRecents);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [manageMenuOpen, setManageMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [notice, setNotice] = useState("");

  const menuRef = useRef(null);
  const avatarBtnRef = useRef(null);
  const manageRef = useRef(null);
  const searchWrapRef = useRef(null);
  const searchInputRef = useRef(null);
  const drawerRef = useRef(null);
  const drawerCloseRef = useRef(null);
  const hamburgerRef = useRef(null);
  const drawerWasOpen = useRef(false);

  const { restaurants: ownerRestaurants, loading: loadingPending } = useOwnerPending(isOwner);

  const restaurantsWithPending = ownerRestaurants
    .filter((r) => r.pendingCount > 0)
    .sort((a, b) => b.pendingCount - a.pendingCount);
  const totalPending = restaurantsWithPending.reduce((sum, r) => sum + r.pendingCount, 0);

  /* ---------- Search ---------- */
  const runSearch = useCallback(
    (raw) => {
      const q = (raw || "").trim();
      setMobileSearchOpen(false);
      setSuggestOpen(false);
      if (q) {
        setRecents((prev) => {
          const next = [q, ...prev.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, MAX_RECENT);
          writeRecents(next);
          return next;
        });
      }
      setSearchQuery(q);
      navigate(q ? `/restaurants?search=${encodeURIComponent(q)}` : "/restaurants");
    },
    [navigate]
  );

  const handleSearch = (e) => {
    e.preventDefault();
    runSearch(searchQuery);
  };

  const clearRecents = () => {
    setRecents([]);
    writeRecents([]);
  };

  const { listening, toggle: toggleVoice } = useVoiceSearch({
    onTranscript: setSearchQuery,
    onFinal: runSearch,
    onProblem: setNotice,
  });

  // Auto-dismiss the notice
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(t);
  }, [notice]);

  /* ---------- Auth ---------- */
  const handleLogout = () => {
    setMenuOpen(false);
    setDrawerOpen(false);
    logout();
    navigate("/");
  };

  /* ---------- Route changes: close everything, sync search box with the URL ---------- */
  useEffect(() => {
    setDrawerOpen(false);
    setMenuOpen(false);
    setManageMenuOpen(false);
    setMobileSearchOpen(false);
    setSuggestOpen(false);
    const q = new URLSearchParams(location.search).get("search");
    setSearchQuery(location.pathname === "/restaurants" && q ? q : "");
  }, [location.pathname, location.search]);

  /* ---------- Outside click, Escape and the "/" shortcut ---------- */
  useEffect(() => {
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (manageRef.current && !manageRef.current.contains(e.target)) setManageMenuOpen(false);
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) setSuggestOpen(false);
    };

    const onKey = (e) => {
      // "/" jumps to search (desktop input, or opens the mobile search bar)
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const t = e.target;
        const typing = t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
        if (!typing) {
          if (searchInputRef.current && searchInputRef.current.offsetParent !== null) {
            e.preventDefault();
            searchInputRef.current.focus();
          } else {
            const btn = document.getElementById("nb-mobile-search-btn");
            if (btn && btn.offsetParent !== null) {
              e.preventDefault();
              btn.click();
            }
          }
        }
      }
      if (e.key === "Escape") {
        // Give focus back to the avatar if the account menu had it
        if (menuRef.current?.contains(document.activeElement)) avatarBtnRef.current?.focus();
        setMenuOpen(false);
        setManageMenuOpen(false);
        setDrawerOpen(false);
        setMobileSearchOpen(false);
        setSuggestOpen(false);
      }
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  /* ---------- Drawer: scroll lock, focus in, focus back ---------- */
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (drawerOpen) {
      drawerWasOpen.current = true;
      const r = requestAnimationFrame(() => drawerCloseRef.current?.focus());
      return () => cancelAnimationFrame(r);
    }
    if (drawerWasOpen.current) {
      drawerWasOpen.current = false;
      hamburgerRef.current?.focus();
    }
    return undefined;
  }, [drawerOpen]);

  // Keep Tab inside the drawer while it is open
  const trapFocus = (e) => {
    if (e.key !== "Tab" || !drawerRef.current) return;
    const focusable = drawerRef.current.querySelectorAll("a[href], button:not([disabled])");
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  /* ---------- Soft shadow once the page scrolls ---------- */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* ---------- Owner shortcuts ---------- */
  const goToRestaurantOrders = (id) => {
    setManageMenuOpen(false);
    setDrawerOpen(false);
    navigate(`/owner/restaurants/${id}/manage?filter=pending`);
  };

  const handleReviewOrders = () => {
    if (restaurantsWithPending.length === 1) goToRestaurantOrders(restaurantsWithPending[0]._id);
    else if (restaurantsWithPending.length > 1) setManageMenuOpen((p) => !p);
    else navigate("/owner");
  };

  // Highlights the current page
  const isActive = (to = "") => {
    if (to.includes("?")) return location.pathname + location.search === to;
    if (to === "/" || to === "/owner") return location.pathname === to;
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  };

  const initials = getInitials(user?.name);

  /* ---------- Shared class strings ---------- */
  const iconBtn =
    "relative flex h-10 w-10 items-center justify-center rounded-full text-stone-700 transition-colors hover:bg-orange-50 hover:text-red-600 active:bg-orange-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400";

  const micBtn = `flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
    listening ? "animate-pulse bg-red-100 text-red-600" : "bg-stone-100 text-stone-700 hover:bg-orange-50 hover:text-red-600"
  }`;

  const drawerLink =
    "flex items-center gap-4 rounded-xl px-3 py-2.5 text-sm text-stone-800 transition-colors hover:bg-orange-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400";

  const dropdownLink =
    "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-stone-700 transition-colors hover:bg-orange-50 hover:text-stone-900 focus:outline-none focus-visible:bg-orange-50";

  // Closed panels use `invisible` so their links can't be reached with the Tab key
  const panel = (open) =>
    `absolute right-0 top-full z-50 mt-3 origin-top-right overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-2xl shadow-stone-900/10 transition-[opacity,transform,visibility] duration-200 ease-out ${
      open
        ? "visible translate-y-0 scale-100 opacity-100"
        : "invisible pointer-events-none -translate-y-1 scale-95 opacity-0"
    }`;

  const ownerPill =
    "inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white px-5 py-2.5 text-sm font-medium text-stone-700 transition-all duration-200 hover:border-orange-300 hover:bg-orange-50 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400";

  const primaryBtn =
    "inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-gradient-to-r from-red-500 to-orange-500 font-semibold text-white shadow-md shadow-orange-500/25 transition-all duration-200 hover:shadow-lg hover:shadow-orange-500/30 hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2";

  /* ---------- Menu content ---------- */
  const customerLinks = [
    { to: "/restaurants", label: "Restaurants" },
    { to: "/offers", label: "Offers" },
    ...(ORDERS_ENABLED ? [{ to: "/order-online", label: "Order Food" }] : []),
  ];

  // Drawer sections differ by role. `to` = route link, `action: "review"` = pending-orders shortcut.
  const drawerSections = isOwner
    ? [
        {
          title: "Dashboard",
          items: [
            { to: "/owner", label: "My Restaurants", icon: ICONS.restaurants },
            { to: "/owner/restaurants/new", label: "Add a Restaurant", icon: ICONS.plus },
            { action: "review", label: "Pending bookings", icon: ICONS.calendar },
          ],
        },
        {
          title: "Manage",
          items: [
            { to: "/owner/slots", label: "Manage Slots", icon: ICONS.clock },
            { to: "/owner/reviews", label: "Customer Reviews", icon: ICONS.star },
          ],
        },
      ]
    : [
        {
          items: [
            { to: "/", label: "Home", icon: ICONS.home },
            { to: "/restaurants", label: "Book a Table", icon: ICONS.calendar },
            ...(ORDERS_ENABLED ? [{ to: "/order-online", label: "Order Food", icon: ICONS.orders }] : []),
          ],
        },
        {
          title: "Explore",
          items: [
            { to: "/restaurants?sort=rating", label: "Top Rated", icon: ICONS.star },
            { to: "/restaurants?open=now", label: "Open Now", icon: ICONS.clock },
            { to: "/offers", label: "Offers & Deals", icon: ICONS.tag },
          ],
        },
      ];

  // Avatar menu: personal stuff only. The profile link lives in the header card.
  const accountItems = isOwner
    ? []
    : [
        { to: "/my-bookings", label: "My Bookings", icon: ICONS.calendar },
        ...(ORDERS_ENABLED ? [{ to: "/my-orders", label: "My Orders", icon: ICONS.orders }] : []),
        { to: "/favorites", label: "Favourites", icon: ICONS.heart },
      ];

  // Suggestions under the search box
  const trimmedQuery = searchQuery.trim();
  const matchingPopular = trimmedQuery
    ? POPULAR_SEARCHES.filter((p) => p.toLowerCase().includes(trimmedQuery.toLowerCase()))
    : POPULAR_SEARCHES;
  const showRecents = !trimmedQuery && recents.length > 0;

  const renderLogo = (onClick) => (
    <Link
      to={isOwner ? "/owner" : "/"}
      onClick={onClick}
      aria-label="BhookLagi home"
      className="flex flex-shrink-0 items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
    >
      <span className="block h-10 w-10 overflow-hidden rounded-full bg-white ring-2 ring-orange-300/70 md:h-11 md:w-11">
        <img src="/Icon2.png" alt="" className="h-full w-full object-cover" />
      </span>
      <div className="hidden flex-col sm:flex">
        <img
          src="/Bhooklagi2.png"
          alt="BhookLagi"
          className={`w-auto object-contain ${isOwner ? "h-7 md:h-8" : "h-8 md:h-9"}`}
        />
        {isOwner && (
          <span className="mt-0.5 flex w-fit items-center gap-1 rounded-full bg-gradient-to-r from-red-500 to-orange-500 py-[2px] pl-1.5 pr-2 text-[8px] font-semibold uppercase leading-none tracking-[0.2em] text-white">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-2 w-2">
              <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z" />
            </svg>
            Partner Portal
          </span>
        )}
      </div>
    </Link>
  );

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  return (
    <>
      {/* ---------- Left drawer ---------- */}
      <div
        className={`fixed inset-0 z-40 bg-stone-900/40 backdrop-blur-[2px] transition-opacity duration-200 ${
          drawerOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Main menu"
        aria-hidden={!drawerOpen}
        onKeyDown={trapFocus}
        className={`fixed left-0 top-0 z-50 flex h-full w-72 flex-col bg-white shadow-2xl shadow-stone-900/20 transition-[transform,visibility] duration-200 ease-out ${
          drawerOpen ? "visible translate-x-0" : "invisible -translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center gap-3 border-b border-orange-100 px-4">
          <button ref={drawerCloseRef} className={iconBtn} onClick={() => setDrawerOpen(false)} aria-label="Close menu">
            <Icon d={ICONS.close} />
          </button>
          {renderLogo(() => setDrawerOpen(false))}
        </div>

        {/* Sign-in prompt (guests only) */}
        {!user && (
          <div className="px-4 pt-4">
            <Link
              to="/login"
              onClick={() => setDrawerOpen(false)}
              className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-red-50 via-orange-50 to-amber-50 p-3 ring-1 ring-orange-100 transition hover:ring-orange-300"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-red-500 shadow-sm">
                <Icon d={ICONS.user} />
              </span>
              <span>
                <span className="block text-sm font-semibold text-stone-900">Sign in</span>
                <span className="block text-xs text-stone-600">to book a table</span>
              </span>
            </Link>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {drawerSections.map((section, i) => (
            <div key={i} className={i > 0 ? "mt-3 border-t border-stone-200 pt-3" : ""}>
              {section.title && (
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-stone-400">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) =>
                  item.action === "review" ? (
                    <button
                      key={item.label}
                      onClick={() => {
                        setDrawerOpen(false);
                        if (restaurantsWithPending.length === 1) goToRestaurantOrders(restaurantsWithPending[0]._id);
                        else navigate("/owner");
                      }}
                      className={`${drawerLink} w-full`}
                    >
                      <Icon d={item.icon} className="h-5 w-5 text-stone-500" />
                      <span className="flex-1 text-left">{item.label}</span>
                      <Badge count={totalPending} />
                    </button>
                  ) : (
                    <Link
                      key={item.label}
                      to={item.to}
                      onClick={() => setDrawerOpen(false)}
                      aria-current={isActive(item.to) ? "page" : undefined}
                      className={`${drawerLink} ${
                        isActive(item.to) ? "bg-orange-50 font-medium text-red-600 ring-1 ring-orange-200" : ""
                      }`}
                    >
                      <Icon d={item.icon} className={`h-5 w-5 ${isActive(item.to) ? "text-red-500" : "text-stone-500"}`} />
                      {item.label}
                    </Link>
                  )
                )}
              </div>
            </div>
          ))}

          <div className="mt-3 space-y-0.5 border-t border-stone-200 pt-3">
            <Link to="/help" onClick={() => setDrawerOpen(false)} className={drawerLink}>
              <Icon d={ICONS.help} className="h-5 w-5 text-stone-500" />
              Help &amp; Support
            </Link>
            <Link to="/about" onClick={() => setDrawerOpen(false)} className={drawerLink}>
              <Icon d={ICONS.info} className="h-5 w-5 text-stone-500" />
              About
            </Link>
          </div>
        </div>

        {user && (
          <div className="border-t border-stone-200 p-3">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-4 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              <Icon d={ICONS.logout} className="h-5 w-5" />
              Log out
            </button>
          </div>
        )}
      </aside>

      {/* ---------- Top bar ---------- */}
      <header
        className={`sticky top-0 z-30 h-16 border-b transition-[box-shadow,background-color] duration-300 md:h-[72px] ${
          scrolled
            ? "border-orange-100 bg-white/90 shadow-lg shadow-orange-900/5 backdrop-blur-md"
            : "border-stone-200 bg-white"
        }`}
      >
        {/* Thin brand line that fades in once you scroll */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-red-500 via-orange-500 to-amber-400 transition-opacity duration-300 ${
            scrolled ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* Mobile expanded search (replaces the bar while open) */}
        {!isOwner && mobileSearchOpen && (
          <form onSubmit={handleSearch} role="search" className="flex h-full items-center gap-2 px-2 sm:hidden">
            <button type="button" className={iconBtn} onClick={() => setMobileSearchOpen(false)} aria-label="Close search">
              <Icon d={ICONS.back} />
            </button>
            <input
              autoFocus
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={listening ? "Listening…" : "Search restaurants, cuisines, cities"}
              aria-label="Search restaurants"
              className="h-10 min-w-0 flex-1 rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-800 placeholder:text-stone-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
            <button type="submit" className={iconBtn} aria-label="Search">
              <Icon d={ICONS.search} />
            </button>
            <button
              type="button"
              onClick={toggleVoice}
              className={micBtn}
              aria-label={listening ? "Stop voice search" : "Search with your voice"}
            >
              <Icon d={ICONS.mic} className="h-5 w-5" />
            </button>
          </form>
        )}

        <nav
          aria-label="Primary"
          className={`h-full grid-cols-[auto_1fr_auto] items-center gap-2 px-2 sm:px-4 ${
            !isOwner && mobileSearchOpen ? "hidden sm:grid" : "grid"
          }`}
        >
          {/* Left: hamburger + logo */}
          <div className="flex items-center gap-1 sm:gap-3">
            <button
              ref={hamburgerRef}
              className={iconBtn}
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              aria-expanded={drawerOpen}
            >
              <Icon d={ICONS.menu} />
            </button>
            {renderLogo()}
          </div>

          {/* Center: search + suggestions + mic (customers) */}
          <div className="flex justify-center px-2">
            {!isOwner && (
              <div ref={searchWrapRef} className="relative hidden w-full max-w-2xl items-center gap-2 sm:flex">
                <form onSubmit={handleSearch} className="flex flex-1" role="search">
                  <div className="relative flex-1">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-stone-400">
                      <Icon d={ICONS.search} className="h-4 w-4" />
                    </span>
                    <input
                      ref={searchInputRef}
                      type="text"
                      aria-keyshortcuts="/"
                      aria-label="Search restaurants"
                      aria-expanded={suggestOpen}
                      aria-controls="nb-suggestions"
                      autoComplete="off"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setSuggestOpen(true);
                      }}
                      onFocus={() => setSuggestOpen(true)}
                      placeholder={listening ? "Listening…" : "Search restaurants, cuisines, cities"}
                      className="h-11 w-full rounded-l-full border border-stone-300 bg-stone-50 pl-10 pr-10 text-sm text-stone-800 placeholder:text-stone-400 transition focus:border-orange-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-200"
                    />
                    {searchQuery ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery("");
                          searchInputRef.current?.focus();
                        }}
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-stone-400 hover:bg-stone-200 hover:text-stone-700"
                      >
                        <Icon d={ICONS.close} className="h-4 w-4" />
                      </button>
                    ) : (
                      <kbd
                        aria-hidden="true"
                        className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-stone-300 bg-white px-1.5 text-[11px] font-medium text-stone-400 lg:block"
                      >
                        /
                      </kbd>
                    )}
                  </div>
                  <button
                    type="submit"
                    aria-label="Search"
                    className="flex h-11 w-14 items-center justify-center rounded-r-full bg-gradient-to-r from-red-500 to-orange-500 text-white transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
                  >
                    <Icon d={ICONS.search} className="h-5 w-5" />
                  </button>
                </form>

                <button
                  type="button"
                  onClick={toggleVoice}
                  className={`${micBtn} md:h-11 md:w-11`}
                  aria-label={listening ? "Stop voice search" : "Search with your voice"}
                  title="Search with your voice"
                >
                  <Icon d={ICONS.mic} className="h-5 w-5" />
                </button>

                {/* Suggestions */}
                <div
                  id="nb-suggestions"
                  className={`absolute left-0 right-12 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-2xl shadow-stone-900/10 transition-[opacity,transform,visibility] duration-150 ${
                    suggestOpen
                      ? "visible translate-y-0 opacity-100"
                      : "invisible pointer-events-none -translate-y-1 opacity-0"
                  }`}
                >
                  {trimmedQuery && (
                    <button
                      type="button"
                      onClick={() => runSearch(trimmedQuery)}
                      className="flex w-full items-center gap-3 border-b border-stone-100 px-4 py-3 text-left text-sm text-stone-800 hover:bg-orange-50"
                    >
                      <Icon d={ICONS.search} className="h-4 w-4 text-red-500" />
                      <span className="truncate">
                        Search for <span className="font-semibold">“{trimmedQuery}”</span>
                      </span>
                    </button>
                  )}

                  {showRecents && (
                    <div className="border-b border-stone-100 py-2">
                      <div className="flex items-center justify-between px-4 pb-1">
                        <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Recent</p>
                        <button
                          type="button"
                          onClick={clearRecents}
                          className="text-xs font-medium text-red-500 hover:underline"
                        >
                          Clear
                        </button>
                      </div>
                      {recents.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => runSearch(r)}
                          className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm text-stone-700 hover:bg-orange-50"
                        >
                          <Icon d={ICONS.clock} className="h-4 w-4 text-stone-400" />
                          <span className="truncate">{r}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {matchingPopular.length > 0 && (
                    <div className="px-4 py-3">
                      <p className="pb-2 text-xs font-semibold uppercase tracking-wider text-stone-400">
                        {trimmedQuery ? "Suggestions" : "Popular searches"}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {matchingPopular.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => runSearch(p)}
                            className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-sm text-stone-700 ring-1 ring-amber-100 transition hover:bg-orange-100 hover:text-red-600"
                          >
                            <Icon d={ICONS.trending} className="h-3.5 w-3.5 text-orange-500" />
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right: links + actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            {!isOwner && (
              <button
                id="nb-mobile-search-btn"
                className={`${iconBtn} sm:hidden`}
                onClick={() => setMobileSearchOpen(true)}
                aria-label="Search"
              >
                <Icon d={ICONS.search} />
              </button>
            )}

            {!isOwner && (
              <ul className="mr-1 hidden items-center gap-1 lg:flex">
                {customerLinks.map((link) => {
                  const active = isActive(link.to);
                  return (
                    <li key={link.to}>
                      <Link
                        to={link.to}
                        aria-current={active ? "page" : undefined}
                        className={`group relative block rounded-full px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 ${
                          active ? "text-red-600" : "text-stone-600 hover:text-stone-900"
                        }`}
                      >
                        {link.label}
                        <span
                          className={`absolute inset-x-3 -bottom-0.5 h-[2px] origin-left rounded-full bg-gradient-to-r from-red-500 to-amber-400 transition-transform duration-300 ${
                            active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                          }`}
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            {isOwner && (
              <>
                <Link to="/owner/restaurants/new" className={`${ownerPill} hidden lg:inline-flex`}>
                  <Icon d={ICONS.plus} className="h-4 w-4 text-red-500" />
                  Add a Restaurant
                </Link>

                <div className="relative hidden lg:block" ref={manageRef}>
                  <button
                    onClick={handleReviewOrders}
                    aria-haspopup={restaurantsWithPending.length > 1 ? "menu" : undefined}
                    aria-expanded={restaurantsWithPending.length > 1 ? manageMenuOpen : undefined}
                    disabled={loadingPending && ownerRestaurants.length === 0}
                    className={`${ownerPill} disabled:opacity-60`}
                  >
                    <Icon d={ICONS.calendar} className="h-4 w-4 text-red-500" />
                    Pending bookings
                    <Badge count={totalPending} />
                  </button>

                  <div className={`${panel(manageMenuOpen)} w-80`} role="menu" aria-label="Pending bookings by restaurant">
                    <div className="border-b border-orange-100 bg-gradient-to-br from-red-50 via-orange-50 to-amber-50 px-4 py-3">
                      <p className="text-sm font-semibold text-stone-900">Pending bookings</p>
                      <p className="text-xs text-stone-600">Choose which restaurant to visit</p>
                    </div>
                    <div className="max-h-72 overflow-y-auto py-1">
                      {restaurantsWithPending.map((r) => (
                        <button
                          key={r._id}
                          role="menuitem"
                          onClick={() => goToRestaurantOrders(r._id)}
                          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-orange-50 focus:bg-orange-50 focus:outline-none"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-stone-800">{r.name}</span>
                            {r.city && <span className="block truncate text-xs text-stone-500">{r.city}</span>}
                          </span>
                          <Badge count={r.pendingCount} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <Link
                  to="/owner"
                  aria-current={isActive("/owner") ? "page" : undefined}
                  className={`${primaryBtn} hidden px-5 py-2.5 text-sm lg:inline-flex`}
                >
                  <Icon d={ICONS.restaurants} className="h-4 w-4" />
                  My Restaurants
                </Link>
              </>
            )}

            {user ? (
              <div className="relative" ref={menuRef}>
                <button
                  ref={avatarBtnRef}
                  onClick={() => setMenuOpen((p) => !p)}
                  aria-label="Account menu"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-red-500 via-orange-500 to-amber-400 text-sm font-semibold text-white shadow-md shadow-orange-500/25 ring-2 ring-white transition-all duration-200 hover:shadow-lg focus:outline-none focus-visible:ring-orange-400 md:h-11 md:w-11 ${
                    menuOpen ? "scale-105 ring-orange-200" : ""
                  }`}
                >
                  {initials}
                </button>

                <div className={`${panel(menuOpen)} w-72`} role="menu" aria-label="Account">
                  {/* The whole card is the single profile link */}
                  <Link
                    to="/profile"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="group block bg-gradient-to-br from-red-50 via-orange-50 to-amber-50 px-5 pb-4 pt-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400"
                  >
                    <div className="flex items-center gap-4">
                      <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-500 via-orange-500 to-amber-400 text-lg font-semibold text-white shadow-md ring-2 ring-white">
                        {initials}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-stone-900">{user.name}</p>
                        <p className="truncate text-xs text-stone-600">{user.email}</p>
                        {isOwner && (
                          <span className="mt-1.5 inline-flex rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-2 py-[2px] text-[9px] font-semibold uppercase tracking-[0.18em] text-white">
                            Partner Account
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-orange-200/70 pt-3 text-sm font-semibold text-red-600">
                      <span>View profile</span>
                      <Icon d={ICONS.chevron} className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </div>
                  </Link>

                  {accountItems.length > 0 && (
                    <div className="p-1.5">
                      {accountItems.map((item) => (
                        <Link
                          key={item.label}
                          to={item.to}
                          role="menuitem"
                          onClick={() => setMenuOpen(false)}
                          className={dropdownLink}
                        >
                          <Icon
                            d={item.icon}
                            className="h-5 w-5 text-stone-500 transition-colors group-hover:text-red-500"
                          />
                          {item.label}
                          <Icon
                            d={ICONS.chevron}
                            className="ml-auto h-4 w-4 -translate-x-1 text-red-500 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
                          />
                        </Link>
                      ))}
                    </div>
                  )}

                  <div className="border-t border-stone-100 p-1.5">
                    <button
                      role="menuitem"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus:outline-none focus-visible:bg-red-50"
                    >
                      <Icon d={ICONS.logout} className="h-5 w-5" />
                      Log out
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <Link to="/login" className={`${primaryBtn} h-10 px-5 text-sm`}>
                <Icon d={ICONS.user} className="h-4 w-4" />
                Sign in
              </Link>
            )}
          </div>
        </nav>
      </header>

      {/* Friendly message instead of a browser alert() */}
      {notice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-20 z-50 max-w-[90vw] -translate-x-1/2 rounded-full bg-stone-900 px-5 py-2.5 text-center text-sm text-white shadow-xl"
        >
          {notice}
        </div>
      )}
    </>
  );
};

export default Navbar;