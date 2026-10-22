import { useState } from "react";
import { Link } from "react-router-dom";

const FALLBACK_IMG = "/images/placeholder.jpg";
const MAX_CUISINES = 3;

/* Accepts an array, a comma separated string, or nothing */
const normalizeCuisines = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string")
    return value.split(",").map((c) => c.trim()).filter(Boolean);
  return [];
};

const RestaurantCard = ({ restaurant }) => {
  const name = restaurant.name || "Restaurant";
  const rating = Math.min(5, Math.max(0, Number(restaurant.rating) || 0));
  const numReviews = Number(restaurant.numReviews) || 0;
  const roundedRating = Math.round(rating);
  const cuisines = normalizeCuisines(restaurant.cuisine);
  const shownCuisines = cuisines.slice(0, MAX_CUISINES);
  const extraCuisines = cuisines.length - shownCuisines.length;

  const [imgSrc, setImgSrc] = useState(restaurant.image || FALLBACK_IMG);

  // Fall back to the placeholder once, so a missing placeholder can't loop
  const handleImgError = () => {
    if (imgSrc !== FALLBACK_IMG) setImgSrc(FALLBACK_IMG);
  };

  return (
    <Link
      to={`/restaurants/${restaurant._id}`}
      className="group block overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-amber-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2"
    >
      <div className="relative overflow-hidden bg-stone-100">
        <img
          src={imgSrc}
          alt={name}
          loading="lazy"
          onError={handleImgError}
          className="h-48 w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />

        {/* Subtle gradient so the badge stays readable over any photo */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />

        {numReviews > 0 && (
          <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1.5 shadow-md backdrop-blur-sm">
            <span className="text-sm leading-none text-amber-400">★</span>
            <span className="text-xs font-semibold text-stone-900">
              {rating.toFixed(1)}
            </span>
          </div>
        )}
      </div>

      <div className="p-4">
        <h3 className="font-display text-lg text-stone-900 transition-colors group-hover:text-red-600">
          {name}
        </h3>

        {restaurant.city && (
          <p className="mt-0.5 text-sm text-stone-500">{restaurant.city}</p>
        )}

        {numReviews > 0 ? (
          <div className="mt-2.5 flex items-center gap-2">
            <div
              className="flex text-xs tracking-tight"
              role="img"
              aria-label={`Rated ${rating.toFixed(1)} out of 5`}
            >
              <span className="text-amber-400">{"★".repeat(roundedRating)}</span>
              <span className="text-stone-200">{"★".repeat(5 - roundedRating)}</span>
            </div>
            <span className="text-xs text-stone-400">
              {rating.toFixed(1)} · {numReviews} review{numReviews !== 1 ? "s" : ""}
            </span>
          </div>
        ) : (
          <p className="mt-2.5 text-xs italic text-stone-400">No reviews yet</p>
        )}

        {shownCuisines.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {shownCuisines.map((c) => (
              <span
                key={c}
                className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-stone-600"
              >
                {c}
              </span>
            ))}
            {extraCuisines > 0 && (
              <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-500">
                +{extraCuisines}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
};

export default RestaurantCard;