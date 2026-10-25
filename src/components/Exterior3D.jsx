import { useEffect, useRef, useState, useCallback } from "react";

const DIRS = [
  { key: "front", label: "Front" },
  { key: "right", label: "Right" },
  { key: "back", label: "Back" },
  { key: "left", label: "Left" },
];

const norm = (deg) => ((deg % 360) + 360) % 360;

// mode="orbit"  -> you walk around the building (photos show each side from outside)
// mode="inside" -> you stand in the middle and look around
const Exterior3D = ({ views, mode = "orbit" }) => {
  const stageRef = useRef(null);
  const drag = useRef({ active: false, x: 0 });
  const snapTimer = useRef(null);
  const [w, setW] = useState(600);
  const [yaw, setYaw] = useState(0);
  const [snapping, setSnapping] = useState(false);
  const [auto, setAuto] = useState(true);

  const inside = mode === "inside";
  const sign = inside ? 1 : -1;

  // Track container width so the cube scales responsively
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Gentle auto-rotate until the user touches it
  useEffect(() => {
    if (!auto) return;
    let raf;
    const tick = () => {
      setYaw((y) => y + 0.15);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [auto]);

  // Clear pending timer on unmount
  useEffect(() => () => clearTimeout(snapTimer.current), []);

  const onDown = (e) => {
    stageRef.current.setPointerCapture(e.pointerId);
    drag.current = { active: true, x: e.clientX };
    setAuto(false);
    setSnapping(false);
  };

  const onMove = (e) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.x;
    drag.current.x = e.clientX;
    setYaw((y) => y + dx * 0.3);
  };

  const onUp = () => {
    drag.current.active = false;
  };

  // Smoothly rotate to a chosen side by the shortest path
  const goTo = useCallback(
    (i) => {
      const target = sign * i * 90;
      let delta = norm(target - yaw);
      if (delta > 180) delta -= 360;
      setAuto(false);
      setSnapping(true);
      setYaw((y) => y + delta);
      clearTimeout(snapTimer.current);
      snapTimer.current = setTimeout(() => setSnapping(false), 650);
    },
    [yaw, sign]
  );

  const activeIndex = Math.round(norm(sign * yaw) / 90) % 4;

  // Geometry
  const S = inside ? w : w * 0.5; // face size
  const P = inside ? w * 0.55 : w * 2; // perspective distance
  const sceneTransform = inside
    ? `translateZ(${P}px) rotateY(${yaw}deg)`
    : `translateZ(${-S / 2}px) rotateY(${yaw}deg)`;
  const faceTransform = (i) =>
    inside
      ? `rotateY(${-i * 90}deg) translateZ(${-S / 2}px)`
      : `rotateY(${i * 90}deg) translateZ(${S / 2}px)`;

  return (
    <div className="w-full">
      <div
        ref={stageRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="relative aspect-video w-full overflow-hidden rounded-2xl bg-neutral-900 cursor-grab active:cursor-grabbing select-none touch-pan-y"
        style={{ perspective: `${P}px` }}
      >
        <div
          className="absolute inset-0"
          style={{
            transformStyle: "preserve-3d",
            transform: sceneTransform,
            transition: snapping ? "transform 0.6s ease-in-out" : "none",
          }}
        >
          {DIRS.map((d, i) => (
            <img
              key={d.key}
              src={views[d.key]}
              alt={`Restaurant exterior, ${d.label.toLowerCase()} side`}
              draggable={false}
              className="absolute left-1/2 top-1/2 object-cover"
              style={{
                width: S,
                height: S,
                marginLeft: -S / 2,
                marginTop: -S / 2,
                transform: faceTransform(i),
                backfaceVisibility: inside ? "visible" : "hidden",
              }}
            />
          ))}
        </div>

        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs font-medium text-white">
          {DIRS[activeIndex].label} view
        </span>
        <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-xs text-white">
          ⟷ Drag to look around
        </span>
      </div>

      {/* Direction buttons */}
      <div className="mt-4 flex justify-center gap-2">
        {DIRS.map((d, i) => (
          <button
            key={d.key}
            onClick={() => goTo(i)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
              activeIndex === i
                ? "bg-gradient-to-r from-[#1a6636] to-[#0f3d20] text-white border border-[#D4AF37]/60"
                : "border border-neutral-200 text-neutral-700 hover:border-[#D4AF37]"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default Exterior3D;