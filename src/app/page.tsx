"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FindSlotsResult, SlotResult } from "@/lib/findSlots";
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

function dur(mins: number): string {
  return `${mins / 60}h`;
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

function DurationBadge({ mins }: { mins: number }) {
  const tone =
    mins >= 120
      ? "bg-pitch text-white"
      : mins >= 90
        ? "bg-pitch-soft text-pitch"
        : "bg-chip text-body";
  return (
    <span className={`inline-flex h-7 items-center rounded-full px-2.5 text-sm font-semibold ${tone}`}>
      {dur(mins)}
    </span>
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
  }, [date, sport, timeFrom, area, favoritesOnly]);

  const grouped = useMemo(() => {
    if (!data) return [];
    const q = area.trim().toLowerCase();
    const map = new Map<string, SlotResult[]>();
    for (const r of data.results) {
      if (favoritesOnly && !favorites.includes(r.venue)) continue;
      if (q && !`${r.area ?? ""} ${r.venue}`.toLowerCase().includes(q)) continue;
      if (!map.has(r.venue)) map.set(r.venue, []);
      map.get(r.venue)!.push(r);
    }
    return Array.from(map.entries())
      .map(([venue, courts]) => {
        const sorted = [...courts].sort(
          (a, b) =>
            b.maxDurationMin - a.maxDurationMin ||
            a.available[0].start.localeCompare(b.available[0].start),
        );
        return { venue, courts: sorted, best: sorted[0] };
      })
      .sort((a, b) => {
        const fav = Number(isFavorite(b.venue)) - Number(isFavorite(a.venue));
        if (fav) return fav;
        const d = b.best.maxDurationMin - a.best.maxDurationMin;
        if (d) return d;
        return a.best.available[0].start.localeCompare(b.best.available[0].start);
      });
  }, [data, area, favoritesOnly, favorites, isFavorite]);

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
            <span className="mx-1 h-6 w-px shrink-0 bg-line" aria-hidden="true" />
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
            <span className="font-semibold text-ink">{grouped.length}</span> venues with 1h+ free
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
            <p className="font-semibold">Nothing free for 1h+</p>
            <p className="mt-1 text-sm text-body">Try an earlier start time or another day.</p>
          </div>
        )}

        {!loading && !error && (
          <ul className="grid items-start gap-3 lg:grid-cols-2">
            {grouped.slice(0, visibleCount).map(({ venue, courts, best }) => {
              const open = expanded.has(venue);
              const slot = best.available[0];
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
                      <p className="mt-2 flex items-center gap-2 text-sm">
                        <DurationBadge mins={best.maxDurationMin} />
                        <span className="font-semibold">
                          {slot.start}–{slot.end}
                        </span>
                        <span className="text-body">AED {slot.priceAed}</span>
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
                        <div key={c.court} className="pt-3">
                          <p className="text-sm font-medium">
                            {c.court}
                            <span className="font-normal text-muted">
                              {[c.format, c.setting].filter(Boolean).map((s) => ` · ${s}`)}
                            </span>
                          </p>
                          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {c.available.map((s) => (
                              <a
                                key={`${s.start}-${s.durationMin}`}
                                href={c.bookingUrl}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`${s.start} to ${s.end}, ${dur(s.durationMin)}, AED ${s.priceAed}, book on Playo`}
                                className={`flex flex-col items-center justify-center rounded-lg border py-2 transition-colors hover:border-ink ${
                                  s.durationMin >= 120 ? "border-pitch/40 bg-pitch-soft/50" : "border-line"
                                }`}
                              >
                                <span className="text-sm font-semibold">{s.start}</span>
                                <span className="text-xs text-body">
                                  {dur(s.durationMin)} · {s.priceAed}
                                </span>
                              </a>
                            ))}
                          </div>
                        </div>
                      ))}
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
