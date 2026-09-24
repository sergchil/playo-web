"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FindSlotsResult, FreeWindow, SlotResult } from "@/lib/findSlots";
import { useFavorites } from "@/lib/useFavorites";

type Sport = "both" | "football" | "futsal";

const PAGE_SIZE = 16;
const HOURS = Array.from({ length: 18 }, (_, i) => `${String(i + 6).padStart(2, "0")}:00`);

function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type DayChip = { iso: string; dow: string; dom: string };

/** fridaysOnly: the next 8 Fridays (~2 months). Otherwise every day for 14 days. */
function dayChips(fridaysOnly: boolean): DayChip[] {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const out: DayChip[] = [];
  for (let i = 0; out.length < (fridaysOnly ? 8 : 14); i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (fridaysOnly && d.getDay() !== 5) continue;
    out.push({
      iso: isoLocal(d),
      dow: fridaysOnly ? "Fri" : i === 0 ? "Today" : i === 1 ? "Tmrw" : d.toLocaleDateString("en-US", { weekday: "short" }),
      dom: `${d.getDate()} ${d.toLocaleDateString("en-US", { month: "short" })}`,
    });
  }
  return out;
}

function upcomingFriday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7));
  return isoLocal(d);
}

type Need = 120 | 90 | 60;
const NEEDS: { v: Need; label: string }[] = [
  { v: 120, label: "2h" },
  { v: 90, label: "1.5h" },
  { v: 60, label: "1h" },
];

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** "00:00" at the end of a window means midnight. */
function endMin(hhmm: string): number {
  return hhmm === "00:00" ? 1440 : toMin(hhmm);
}

function dur(mins: number): string {
  return `${mins / 60}h`;
}

/** Free stretches drawn on a strip from the chosen start time to midnight. */
function WindowBar({ windows, from }: { windows: FreeWindow[]; from: string }) {
  const start = toMin(from);
  const span = Math.max(1440 - start, 60);
  const marks: number[] = [];
  for (let t = Math.ceil(start / 60) * 60; t <= 1440; t += 60) marks.push(t);
  const step = marks.length > 7 ? 2 : 1;
  return (
    <div className="mt-2" aria-hidden="true">
      <div className="relative h-2.5 rounded-full bg-chip">
        {windows.map((w) => (
          <div
            key={w.from}
            className="absolute inset-y-0 rounded-full bg-pitch"
            style={{
              left: `${((toMin(w.from) - start) / span) * 100}%`,
              width: `${((endMin(w.to) - toMin(w.from)) / span) * 100}%`,
            }}
          />
        ))}
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-muted">
        {marks
          .filter((_, i) => i % step === 0)
          .map((t) => (
            <span
              key={t}
              className="absolute -translate-x-1/2 tabular-nums first:translate-x-0 last:-translate-x-full"
              style={{ left: `${((t - start) / span) * 100}%` }}
            >
              {String((t / 60) % 24).padStart(2, "0")}
            </span>
          ))}
      </div>
    </div>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
      <path
        d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  label: string;
  value: T;
  options: { v: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`flex h-9 rounded-full bg-chip p-0.5 ${className}`}>
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={`min-w-0 flex-1 cursor-pointer rounded-full px-2 text-sm font-semibold transition-colors ${
            value === o.v ? "bg-ink text-white" : "text-ink hover:bg-chip-hover"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Placeholder shaped like a collapsed venue card: name, meta, label, time range, price. */
function SkeletonCard() {
  return (
    <li className="flex items-start gap-3 rounded-xl bg-white p-4 shadow-card" aria-hidden="true">
      <div className="min-w-0 flex-1">
        <div className="shimmer h-4 w-3/5 rounded-full" />
        <div className="shimmer mt-2 h-3 w-2/5 rounded-full" />
        <div className="shimmer mt-4 h-2.5 w-20 rounded-full" />
        <div className="shimmer mt-2 h-5 w-1/2 rounded-full" />
        <div className="shimmer mt-2 h-3 w-1/3 rounded-full" />
      </div>
      <div className="shimmer size-6 shrink-0 rounded-full" />
    </li>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true">
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const SPORTS: { v: Sport; label: string }[] = [
  { v: "both", label: "All" },
  { v: "football", label: "Football" },
  { v: "futsal", label: "Futsal" },
];

export default function Home() {
  const [fridaysOnly, setFridaysOnly] = useState(true);
  const days = useMemo(() => dayChips(fridaysOnly), [fridaysOnly]);
  const [date, setDate] = useState(upcomingFriday);

  const toggleFridays = () => {
    const next = !fridaysOnly;
    setFridaysOnly(next);
    // Going back to Fridays-only while a non-Friday is picked: snap to the next Friday.
    if (next && !dayChips(true).some((d) => d.iso === date)) setDate(upcomingFriday());
  };
  const [sport, setSport] = useState<Sport>("both");
  const [timeFrom, setTimeFrom] = useState("20:00");
  const [need, setNeed] = useState<Need>(120);
  const [area, setArea] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(true);
  const [venueInfo, setVenueInfo] = useState<Record<string, { area?: string; url?: string; bookingUrl?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FindSlotsResult | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [compact, setCompact] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [spacerH, setSpacerH] = useState(150);
  const headerRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const typingRef = useRef(false);

  // Spacer tracks the full (expanded) header height, including the safe-area inset.
  useEffect(() => {
    const panel = panelRef.current;
    const header = headerRef.current;
    if (!panel || !header) return;
    const measure = () => {
      const inset = parseFloat(getComputedStyle(header).paddingTop) || 0;
      setSpacerH(panel.offsetHeight + inset + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(panel);
    return () => ro.disconnect();
  }, []);

  // Apple-style: shrink to one line on scroll down, open again on a deliberate scroll up or at the top.
  useEffect(() => {
    let lastY = window.scrollY;
    let upTravel = 0;
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;
      if (y < 40) {
        upTravel = 0;
        setCompact(false);
        return;
      }
      if (dy > 0) {
        upTravel = 0;
        if (y > 120 && !typingRef.current) setCompact(true);
      } else if (dy < 0) {
        upTravel -= dy;
        if (upTravel > 80) setCompact(false);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const { favorites, isFavorite, toggle, loaded } = useFavorites();

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ date, sport, timeFrom });
      const res = await fetch(`/api/slots?${qs.toString()}`);
      if (!res.ok) throw new Error(`Server error (${res.status})`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [date, sport, timeFrom]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  // Venue directory (cached 1h) so favourites with nothing free can still show area + Playo link.
  useEffect(() => {
    fetch("/api/venues?sport=both")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { venues?: { name: string; area?: string; url?: string; bookingUrl?: string }[] } | null) => {
        if (!j?.venues) return;
        setVenueInfo(Object.fromEntries(j.venues.map((v) => [v.name, v])));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setExpanded(new Set());
  }, [date, sport, timeFrom, area, favoritesOnly, need]);

  const grouped = useMemo(() => {
    if (!data) return [];
    const q = area.trim().toLowerCase();
    type Court = SlotResult & { fit: FreeWindow[]; longest: FreeWindow };
    const map = new Map<string, Court[]>();
    for (const r of data.results) {
      if (favoritesOnly && !favorites.includes(r.venue)) continue;
      if (q && !`${r.area ?? ""} ${r.venue}`.toLowerCase().includes(q)) continue;
      // Only stretches long enough for the booking length you picked, on courts that allow it.
      if (r.maxBookMin < need) continue;
      const fit = (r.windows ?? []).filter((w) => w.durationMin >= need);
      if (!fit.length) continue;
      const longest = fit.reduce((a, b) => (b.durationMin > a.durationMin ? b : a));
      if (!map.has(r.venue)) map.set(r.venue, []);
      map.get(r.venue)!.push({ ...r, fit, longest });
    }
    return Array.from(map.entries())
      .map(([venue, courts]) => {
        const sorted = [...courts].sort(
          (a, b) => b.longest.durationMin - a.longest.durationMin || a.fit[0].from.localeCompare(b.fit[0].from),
        );
        const cheapest = Math.min(...sorted.flatMap((c) => c.fit.map((w) => w.pricePerHourAed)));
        return { venue, courts: sorted, best: sorted[0], cheapest };
      })
      .sort((a, b) => {
        const fav = Number(isFavorite(b.venue)) - Number(isFavorite(a.venue));
        if (fav) return fav;
        const d = b.best.longest.durationMin - a.best.longest.durationMin;
        if (d) return d;
        return a.best.fit[0].from.localeCompare(b.best.fit[0].from);
      });
  }, [data, area, favoritesOnly, favorites, isFavorite, need]);

  // Favourites with nothing matching: always listed (after available favourites), marked unavailable.
  const unavailableFavs = useMemo(() => {
    if (!data) return [];
    const q = area.trim().toLowerCase();
    const shown = new Set(grouped.map((g) => g.venue));
    return favorites
      .filter((name) => !shown.has(name))
      .map((name) => {
        const rows = data.results.filter((r) => r.venue === name);
        const info = venueInfo[name] ?? {};
        const areaName = rows[0]?.area ?? info.area;
        // Best shorter stretch, so you know if a shorter booking would work.
        const shorter = rows
          .flatMap((r) => r.windows ?? [])
          .sort((a, b) => b.durationMin - a.durationMin || a.from.localeCompare(b.from))[0];
        return { name, area: areaName, shorter, link: rows[0]?.bookingUrl ?? info.bookingUrl ?? info.url };
      })
      .filter((f) => !q || `${f.area ?? ""} ${f.name}`.toLowerCase().includes(q));
  }, [data, area, favorites, grouped, venueInfo]);

  // Split so unavailable favourites sit right below the available favourites, above everything else.
  const favCount = grouped.filter((g) => isFavorite(g.venue)).length;

  const toggleOpen = (venue: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(venue)) next.delete(venue);
      else next.add(venue);
      return next;
    });

  const summary = [
    (() => {
      const d = new Date(`${date}T12:00:00`);
      return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getDate()} ${d.toLocaleDateString("en-US", { month: "short" })}`;
    })(),
    `${timeFrom}+`,
    dur(need),
    SPORTS.find((x) => x.v === sport)!.label,
    ...(area.trim() ? [`“${area.trim()}”`] : []),
  ].join(" · ");

  const card = ({ venue, courts, best, cheapest }: (typeof grouped)[number]) => {
    const open = expanded.has(venue);
    const w = best.longest;
    const fav = isFavorite(venue);
    return (
      <li key={venue} className="overflow-hidden rounded-xl bg-white shadow-card">
        <div className="flex items-start gap-2 p-4">
          <button
            type="button"
            onClick={() => toggleOpen(venue)}
            aria-expanded={open}
            className="min-w-0 flex-1 cursor-pointer text-left"
          >
            <h2 className="truncate text-base font-semibold leading-snug">{venue}</h2>
            <p className="mt-0.5 truncate text-sm capitalize text-muted">
              {[best.area, best.sport, best.format].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">
              Free to book
            </p>
            <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-lg font-semibold tabular-nums">
              {w.from} → {w.to}
              <span className="text-sm font-medium text-pitch">{dur(w.durationMin)} free</span>
            </p>
            <p className="mt-0.5 text-sm text-body">
              {courts.length} {courts.length === 1 ? "court" : "courts"} · from AED {cheapest}/h
            </p>
          </button>
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => toggle(venue)}
              aria-label={fav ? `Remove ${venue} from saved` : `Save ${venue}`}
              aria-pressed={fav}
              className={`grid size-11 cursor-pointer place-items-center rounded-full hover:bg-chip ${
                fav ? "text-ink" : "text-muted"
              }`}
            >
              <StarIcon filled={fav} />
            </button>
            <button
              type="button"
              onClick={() => toggleOpen(venue)}
              aria-label={open ? "Hide times" : "Show all times"}
              className="grid size-11 cursor-pointer place-items-center rounded-full text-ink hover:bg-chip"
            >
              <Chevron open={open} />
            </button>
          </div>
        </div>

        {open && (
          <div className="border-t border-line px-4 pb-4">
            {courts.map((c) => (
              <div key={c.court} className="border-b border-line py-3 last:border-b-0">
                <p className="text-sm font-medium">
                  {c.court}
                  <span className="font-normal text-muted">
                    {c.setting ? ` · ${c.setting}` : ""}
                  </span>
                </p>
                {c.fit.map((fw) => (
                  <p key={fw.from} className="mt-1 flex items-baseline justify-between gap-3 tabular-nums">
                    <span className="text-base font-semibold">
                      {fw.from} → {fw.to}
                      <span className="ml-2 text-sm font-medium text-pitch">{dur(fw.durationMin)}</span>
                    </span>
                    <span className="shrink-0 text-sm text-body">
                      AED {fw.pricePerHourAed}/h
                    </span>
                  </p>
                ))}
                <WindowBar windows={c.fit} from={timeFrom} />
              </div>
            ))}
            <p className="pt-1 text-xs text-muted">
              Start any time inside a green stretch; book up to its end time.
            </p>
            <a
              href={best.bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 flex h-11 items-center justify-center rounded-full bg-ink text-sm font-medium text-white"
            >
              Book on Playo
            </a>
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="flex-1">
      {/* Fixed header over a spacer the height of the full filters, so collapsing never shifts the list.
          Its white extends upward so cards never show through translucent in-app browser chrome. */}
      <div style={{ height: spacerH }} aria-hidden="true" />
      <header
        ref={headerRef}
        className="fixed inset-x-0 top-0 z-20 border-b border-line bg-white pt-[env(safe-area-inset-top)] before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-screen before:bg-white before:content-['']"
      >
        {/* Collapsed: one-line summary. Tap to open filters. */}
        <div className={`grid transition-[grid-template-rows] duration-200 ${compact ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div className="overflow-hidden">
            <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2 sm:px-6">
              <button
                type="button"
                onClick={() => setCompact(false)}
                aria-label={`Filters: ${summary}. Tap to change`}
                tabIndex={compact ? 0 : -1}
                className="flex h-10 min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 rounded-full bg-chip pl-4 pr-3 text-sm font-semibold"
              >
                <span className="truncate tabular-nums">{summary}</span>
                <Chevron open={false} />
              </button>
              <button
                type="button"
                onClick={() => setFavoritesOnly((v) => !v)}
                aria-pressed={favoritesOnly}
                aria-label="Show favourites only"
                tabIndex={compact ? 0 : -1}
                className={`grid size-10 shrink-0 cursor-pointer place-items-center rounded-full ${
                  favoritesOnly ? "bg-ink text-white" : "bg-chip text-ink"
                }`}
              >
                <StarIcon filled={favoritesOnly} />
              </button>
            </div>
          </div>
        </div>

        {/* Expanded: full filters, three tight rows. */}
        <div
          className={`grid transition-[grid-template-rows] duration-200 ${compact ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}
          inert={compact}
        >
          <div className="overflow-hidden">
            <div ref={panelRef} className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-2.5 sm:px-6">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleFridays}
                  aria-pressed={!fridaysOnly}
                  className={`h-9 shrink-0 cursor-pointer rounded-full px-3 text-sm font-semibold transition-colors ${
                    fridaysOnly ? "border border-ink/15 text-ink" : "bg-ink text-white"
                  }`}
                >
                  All days
                </button>
                <div className="rail rail-fade -mr-4 flex min-w-0 flex-1 gap-1.5 overflow-x-auto pr-4 sm:mr-0 sm:pr-0">
                  {days.map((d) => {
                    const active = d.iso === date;
                    return (
                      <button
                        key={d.iso}
                        type="button"
                        onClick={() => setDate(d.iso)}
                        aria-pressed={active}
                        className={`h-9 shrink-0 cursor-pointer rounded-full px-3 text-sm font-semibold tabular-nums transition-colors ${
                          active ? "bg-ink text-white" : "bg-chip text-ink hover:bg-chip-hover"
                        }`}
                      >
                        {fridaysOnly ? d.dom : `${d.dow} ${d.dom.split(" ")[0]}`}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Segmented label="Sport" value={sport} options={SPORTS} onChange={setSport} className="flex-1" />
                <label className="relative shrink-0">
                  <span className="sr-only">Start time from</span>
                  <select
                    value={timeFrom}
                    onChange={(e) => setTimeFrom(e.target.value)}
                    className="h-9 cursor-pointer appearance-none rounded-full bg-chip pl-3 pr-8 text-sm font-semibold tabular-nums text-ink hover:bg-chip-hover"
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {h}+
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink">
                    <Chevron open={false} />
                  </span>
                </label>
              </div>

              {searchOpen ? (
                <div className="flex items-center gap-2">
                  <label className="relative block flex-1">
                    <span className="sr-only">Area or venue</span>
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
                      <SearchIcon />
                    </span>
                    <input
                      autoFocus
                      type="search"
                      inputMode="search"
                      value={area}
                      onChange={(e) => setArea(e.target.value)}
                      onFocus={() => (typingRef.current = true)}
                      onBlur={() => (typingRef.current = false)}
                      placeholder="Area or venue"
                      className="h-9 w-full rounded-full bg-chip pl-9 pr-3 text-base text-ink placeholder:text-muted focus:bg-white focus:outline-none focus:ring-2 focus:ring-ink"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setArea("");
                      setSearchOpen(false);
                    }}
                    className="h-9 shrink-0 cursor-pointer px-1 text-sm font-semibold"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Segmented label="Booking length" value={need} options={NEEDS} onChange={setNeed} className="flex-1" />
                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    aria-label="Search area or venue"
                    className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full bg-chip text-ink hover:bg-chip-hover"
                  >
                    <SearchIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => setFavoritesOnly((v) => !v)}
                    aria-pressed={favoritesOnly}
                    aria-label="Show favourites only"
                    className={`grid size-9 shrink-0 cursor-pointer place-items-center rounded-full transition-colors ${
                      favoritesOnly ? "bg-ink text-white" : "bg-chip text-ink hover:bg-chip-hover"
                    }`}
                  >
                    <StarIcon filled={favoritesOnly} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {loading && (
          <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden" aria-hidden="true">
            <div className="loadbar h-full w-2/5 bg-pitch" />
          </div>
        )}
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-4 sm:px-6">
        {!loading && !error && data && (
          <p className="mb-3 text-sm text-body">
            {favoritesOnly ? (
              <>
                <span className="font-semibold text-ink">{grouped.length}</span> of {grouped.length + unavailableFavs.length} saved free for {dur(need)}+ after {timeFrom} ·{" "}
                <button type="button" onClick={() => setFavoritesOnly(false)} className="cursor-pointer font-medium text-ink underline underline-offset-4">
                  See all venues
                </button>
              </>
            ) : (
              <>
                <span className="font-semibold text-ink">{grouped.length}</span> venues free for {dur(need)}+ after {timeFrom}
              </>
            )}
          </p>
        )}

        {error && (
          <div className="rounded-xl bg-white p-6 text-center shadow-card">
            <p className="font-semibold">Couldn’t reach Playo</p>
            <p className="mt-1 text-sm text-body">{error}</p>
            <button
              type="button"
              onClick={fetchSlots}
              className="mt-4 h-10 cursor-pointer rounded-full bg-ink px-5 text-sm font-medium text-white"
            >
              Retry
            </button>
          </div>
        )}

        {loading && (
          <>
            <p className="mb-3 text-sm text-body" role="status">
              Checking pitches on Playo…
            </p>
            <ul className="grid gap-3 lg:grid-cols-2" aria-busy="true" aria-label="Loading pitches">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </ul>
          </>
        )}

        {!loading && !error && loaded && data && grouped.length === 0 && unavailableFavs.length === 0 && (
          <div className="rounded-xl bg-white p-8 text-center shadow-card">
            <p className="font-semibold">Nothing free for {dur(need)} after {timeFrom}</p>
            <p className="mt-1 text-sm text-body">
              {favoritesOnly ? "No saved venues yet. Tap ★ above to see all venues, then star the ones you like." : "Try a shorter booking, an earlier time or another day."}
            </p>
          </div>
        )}

        {!loading && !error && (
          <ul className="grid items-start gap-3 lg:grid-cols-2">
            {grouped.slice(0, favCount).map(card)}
            {unavailableFavs.map((f) => (
              <li key={f.name} className="overflow-hidden rounded-xl bg-white shadow-card">
                <div className="flex items-start gap-2 p-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold leading-snug text-body">{f.name}</h2>
                    {f.area && <p className="mt-0.5 truncate text-sm text-muted">{f.area}</p>}
                    <p className="mt-3 inline-flex h-6 items-center rounded-full bg-chip px-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
                      Unavailable
                    </p>
                    <p className="mt-1.5 text-sm text-body">
                      {f.shorter
                        ? <>No {dur(need)} slot after {timeFrom}. Only <span className="whitespace-nowrap font-semibold tabular-nums text-ink">{f.shorter.from} → {f.shorter.to}</span> ({dur(f.shorter.durationMin)}).</>
                        : <>Nothing free after {timeFrom} this day.</>}
                    </p>
                    {f.link && (
                      <a href={f.link} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-ink underline underline-offset-4">
                        Open on Playo
                      </a>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(f.name)}
                    aria-label={`Remove ${f.name} from saved`}
                    aria-pressed={true}
                    className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-ink hover:bg-chip"
                  >
                    <StarIcon filled />
                  </button>
                </div>
              </li>
            ))}
            {grouped.slice(favCount, Math.max(visibleCount, favCount)).map(card)}
          </ul>
        )}

        {!loading && grouped.length > visibleCount && (
          <button
            type="button"
            onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
            className="mx-auto mt-4 flex h-11 cursor-pointer items-center rounded-full bg-chip px-6 text-sm font-medium hover:bg-chip-hover"
          >
            Show {Math.min(PAGE_SIZE, grouped.length - visibleCount)} more
          </button>
        )}
      </main>
    </div>
  );
}
