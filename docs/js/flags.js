// Emoji flag helpers. Renders national flags from ISO 3166-1 alpha-2 codes
// using Unicode regional-indicator symbols — no image assets required.

const NEUTRAL_FLAG = "\u{1F3F3}\u{FE0F}"; // white flag, used when no/invalid code

// Convert a 2-letter country code (e.g. "AR") into its emoji flag (🇦🇷).
export function isoToFlag(iso) {
    if (typeof iso !== "string" || iso.length !== 2) return NEUTRAL_FLAG;
    const base = "A".charCodeAt(0);
    const cc = iso.toUpperCase();
    const a = cc.charCodeAt(0) - base;
    const b = cc.charCodeAt(1) - base;
    if (a < 0 || a > 25 || b < 0 || b > 25) return NEUTRAL_FLAG;
    return String.fromCodePoint(0x1F1E6 + a, 0x1F1E6 + b);
}

// "🇦🇷 Argentina" for a team object { name, iso, flag? }. A team may carry an
// explicit `flag` emoji (e.g. England 🏴󠁧󠁢󠁥󠁮󠁧󠁿, which has no alpha-2 code);
// otherwise the flag is derived from the ISO code. Falls back gracefully.
export function teamDisplay(team) {
    if (!team) return "—";
    const flag = team.flag || isoToFlag(team.iso);
    return `${flag} ${team.name}`;
}
