/**
 * Extract player format and indoor/outdoor setting from Playo court names.
 * Ported from ~/playo-mcp/playo_mcp/parse.py. Anything not stated -> null, never guessed.
 */

const FORMAT_PATTERNS: RegExp[] = [
  /(\d{1,2})\s*(?:\/\s*(\d{1,2}))?\s*-?\s*a\s*-?\s*sid/i, // 5 a side, 6/7 - A Side, 11 a sid
  /(\d{1,2})\s*-?\s*aside/i, // 5aside, 6-aside
  /\b(\d{1,2})\s*a\b/i, // 5a Astroturf
  /\b(\d{1,2})\s*v\s*(\d{1,2})\b/i, // 5v5
];

export interface FormatInfo {
  format: string | null;
  playersMin: number | null;
  playersMax: number | null;
  formatSource: string;
}

export function parseFormat(courtName: string, sportId: string): FormatInfo {
  for (const pat of FORMAT_PATTERNS) {
    const m = courtName.match(pat);
    if (!m) continue;
    const a = parseInt(m[1], 10);
    let b = m[2] ? parseInt(m[2], 10) : a;
    if (pat.source.startsWith("\\b(\\d{1,2})\\s*v")) b = a; // 5v5 -> 5-a-side
    if (a >= 3 && a <= 11 && b >= 3 && b <= 11) {
      const label = a === b ? `${a}-a-side` : `${a}/${b}-a-side`;
      return { format: label, playersMin: a, playersMax: b, formatSource: "court name" };
    }
  }
  if (sportId === "SP44") {
    return {
      format: null,
      playersMin: null,
      playersMax: null,
      formatSource: "not listed (futsal halls are usually 5-a-side)",
    };
  }
  return { format: null, playersMin: null, playersMax: null, formatSource: "not listed" };
}

export interface SettingInfo {
  setting: "indoor" | "outdoor" | "roofed" | null;
  settingSource: string;
}

export function parseSetting(courtName: string): SettingInfo {
  const t = courtName.toLowerCase();
  if (t.includes("roofed") || t.includes("covered") || t.includes("shaded")) {
    return { setting: "roofed", settingSource: "court name" };
  }
  if (t.includes("outdoor") || t.includes("natural grass")) {
    return { setting: "outdoor", settingSource: "court name" };
  }
  if (t.includes("indoor") || t.includes("hall") || t.includes("wooden") || t.includes("dome")) {
    return { setting: "indoor", settingSource: "court name" };
  }
  return { setting: null, settingSource: "not listed" };
}
