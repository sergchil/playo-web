"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
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

function Pill({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium transition-colors cursor-pointer ${
        active ? "bg-ink text-white" : "bg-chip text-ink hover:bg-chip-hover"
      }`}
    >
      {children}
    </button>
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
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FindSlotsResult | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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

  const toggleOpen = (venue: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(venue)) next.delete(venue);
      else next.add(venue);
      return next;
    });

  return (
    <div className="flex-1">
      {/* Filters — the whole top of the app */}
      {/* Opaque, and its white extends upward so cards scrolled above the bar never
          show through translucent in-app browser chrome (iOS 26 / Telegram). */}
      <div className="sticky top-0 z-20 border-b border-line bg-white pt-[env(safe-area-inset-top)] before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-screen before:bg-white before:content-['']">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={toggleFridays}
            aria-pressed={!fridaysOnly}
            aria-label={fridaysOnly ? "Show all days" : "Show Fridays only"}
            className="flex h-14 w-16 shrink-0 cursor-pointer flex-col items-center justify-center rounded-2xl border border-ink/15 text-ink transition-colors hover:bg-chip"
          >
            <span className="text-xs text-muted">{fridaysOnly ? "Fridays" : "All days"}</span>
            <span className="text-sm font-semibold">{fridaysOnly ? "All →" : "Fri →"}</span>
          </button>
          <div className="rail rail-fade -mr-4 flex min-w-0 flex-1 gap-2 overflow-x-auto pr-4 sm:mr-0 sm:pr-0">
            {days.map((d) => {
              const active = d.iso === date;
              return (
                <button
                  key={d.iso}
                  type="button"
                  onClick={() => setDate(d.iso)}
                  aria-pressed={active}
                  className={`flex h-14 w-16 shrink-0 cursor-pointer flex-col items-center justify-center rounded-2xl transition-colors ${
                    active ? "bg-ink text-white" : "bg-chip text-ink hover:bg-chip-hover"
                  }`}
                >
                  <span className={`text-xs ${active ? "text-white/70" : "text-muted"}`}>{d.dow}</span>
                  <span className="text-sm font-semibold">{d.dom}</span>
                </button>
              );
            })}
          </div>
          </div>

          <div className="rail -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <Pill active={sport === "both"} onClick={() => setSport("both")}>
              All
            </Pill>
            <Pill active={sport === "football"} onClick={() => setSport("football")}>
              Football
            </Pill>
            <Pill active={sport === "futsal"} onClick={() => setSport("futsal")}>
              Futsal
            </Pill>
          </div>

          <div className="flex items-center gap-2">
            <div
              role="radiogroup"
              aria-label="Booking length"
              className="flex h-10 flex-1 rounded-full bg-chip p-1"
            >
              {NEEDS.map((n) => (
                <button
                  key={n.v}
                  type="button"
                  role="radio"
                  aria-checked={need === n.v}
                  onClick={() => setNeed(n.v)}
                  className={`flex-1 cursor-pointer rounded-full text-sm font-semibold transition-colors ${
                    need === n.v ? "bg-ink text-white" : "text-ink hover:bg-chip-hover"
                  }`}
                >
                  {n.label}
                </button>
              ))}
            </div>
            <label className="relative shrink-0">
              <span className="sr-only">Start time from</span>
              <select
                value={timeFrom}
                onChange={(e) => setTimeFrom(e.target.value)}
                className="h-10 cursor-pointer appearance-none rounded-full bg-chip pl-4 pr-9 text-sm font-medium text-ink hover:bg-chip-hover"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    From {h}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink">
                <Chevron open={false} />
              </span>
            </label>
          </div>

          <div className="flex items-center gap-2">
          <label className="relative block flex-1">
            <span className="sr-only">Area or venue</span>
            <svg
              viewBox="0 0 24 24"
              className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              inputMode="search"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              placeholder="Area or venue"
              className="h-11 w-full rounded-full bg-chip pl-10 pr-4 text-base text-ink placeholder:text-muted focus:bg-white focus:outline-none focus:ring-2 focus:ring-ink"
            />
          </label>
            <button
              type="button"
              onClick={() => setFavoritesOnly((v) => !v)}
              aria-pressed={favoritesOnly}
              aria-label="Show favourites only"
              className={`flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors ${
                favoritesOnly ? "bg-ink text-white" : "bg-chip text-ink hover:bg-chip-hover"
              }`}
            >
              <StarIcon filled={favoritesOnly} />
              Saved
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 pb-16 pt-4 sm:px-6">
        {!loading && !error && data && (
          <p className="mb-3 text-sm text-body">
            <span className="font-semibold text-ink">{grouped.length}</span> venues free for {dur(need)}+ after {timeFrom}
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
          <ul className="grid gap-3 lg:grid-cols-2" aria-busy="true" aria-label="Loading pitches">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="h-[92px] animate-pulse rounded-xl bg-white shadow-card" />
            ))}
          </ul>
        )}

        {!loading && !error && loaded && data && grouped.length === 0 && (
          <div className="rounded-xl bg-white p-8 text-center shadow-card">
            <p className="font-semibold">Nothing free for {dur(need)} after {timeFrom}</p>
            <p className="mt-1 text-sm text-body">Try a shorter booking, an earlier time or another day.</p>
          </div>
        )}

        {!loading && !error && (
          <ul className="grid items-start gap-3 lg:grid-cols-2">
            {grouped.slice(0, visibleCount).map(({ venue, courts, best, cheapest }) => {
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
            })}
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
