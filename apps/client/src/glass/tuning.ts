/**
 * Every Break Glass feel number in one place: hit strength, the damage model, the crack network
 * and the shatter payoff. damage.test.ts pins the promises these make (3–5 ordinary taps, 1–2
 * hard hits on the centre, never more than 7 of anything).
 */

// --- hit strength (strength.ts) ------------------------------------------------------------------
/** Strength of a plain tap, on every device. */
export const BASE_STRENGTH = 0.2;
/** A press shorter than this is a plain tap; holding longer adds strength. */
export const TAP_MS = 150;
/** A press held this long is a full-strength hit. */
export const HOLD_FULL_MS = 450;
/** Mouse swing into the click at full strength, in pane diagonals per second. */
export const SWING_FULL = 3;
/** Pointer speed while down at full strength, in pane diagonals per second. */
export const FLICK_FULL = 2.5;

// --- damage (damage.ts) --------------------------------------------------------------------------
/** The average pane's strength budget. */
export const PANE_STRENGTH = 100;
/** Each pane's budget is PANE_STRENGTH × (1 ± this), seeded by the pane number. */
export const STRENGTH_SPREAD = 0.1;
/** Damage of a plain tap in the middle of the pane. */
export const BASE_DAMAGE = 26;
/** Damage multiplier of a full-strength hit (a plain tap is 1). */
export const MAX_MULT = 4.5;
/** A hit right on the frame does this share of the damage. */
export const EDGE_MIN = 0.62;
/** The weaker band along the frame, as a share of half the pane's short side. */
export const EDGE_BAND = 0.6;
/** Extra damage for a hit within WEAK_PX of an existing crack. */
export const WEAK_BONUS = 8;
export const WEAK_PX = 28;

// --- what the damage looks and sounds like (network.ts, main.ts) --------------------------------
/** Older cracks reach this much further at full damage. */
export const GROW = 0.6;
/** A hit that doesn't touch the network bridges to it when it is at most this far (× short side). */
export const BRIDGE_MAX = 1.2;
/** The hairline web starts at this share of the budget. */
export const WEB_AT = 0.7;
/** Hairlines at full damage. */
export const WEB_MAX = 48;
/** Flakes that fall from each impact. */
export const FLAKES = 7;
/** Wobble on the last hit before the shatter, px and ms. */
export const WOBBLE_PX = 2.5;
export const WOBBLE_MS = 280;

// --- shatter payoff (shards.ts, payoff.ts, main.ts) ---------------------------------------------
/** Target shard size as a share of the pane, right at the hit and far from it. */
export const SHARD_NEAR = 0.035;
export const SHARD_FAR = 0.004;
/** Distance (× pane diagonal) over which the target shrinks from near to far. */
export const SHARD_FALLOFF = 0.45;
/** Glittering slivers for the lightest and the hardest shatter. */
export const SLIVERS_MIN = 20;
export const SLIVERS_MAX = 40;
/** The jagged remnant stays on the frame this long, fading over the last REMNANT_FADE_MS. */
export const REMNANT_MS = 1000;
export const REMNANT_FADE_MS = 250;
