import type { PlayerId } from "@committee-snake/shared";

/**
 * Hot seats (M2): up to four people share one keyboard, one key set each. Pure: no DOM, no
 * clock; times are the caller's ms. Seats live in memory only, so a reload is an empty lobby.
 */
export type Seat = 0 | 1 | 2 | 3;

export interface SeatInfo {
  readonly seat: Seat;
  readonly id: PlayerId;
  /** Named after the seat's keys, so everyone knows who is who. Matches NICKNAME_RE. */
  readonly name: string;
  readonly claimedAt: number;
}

/** Claimed seats, in seat order. */
export type Seats = readonly SeatInfo[];

export const MAX_SEATS = 4;
const IDS: readonly PlayerId[] = ["p1", "p2", "p3", "p4"];
const NAMES: readonly string[] = ["ARROWS", "WASD", "IJKL", "NUMPAD"];
/** The lobby starts by itself this long after a second player joins. */
export const AUTO_START_MS = 5000;

/** Claim `seat` at `now`. Idempotent: an already claimed seat keeps its first claim time. */
export function claim(seats: Seats, seat: Seat, now: number): Seats {
  if (seats.some((s) => s.seat === seat)) return seats;
  const info: SeatInfo = {
    seat,
    id: IDS[seat] ?? `p${seat + 1}`,
    name: NAMES[seat] ?? `P${seat + 1}`,
    claimedAt: now,
  };
  return [...seats, info].sort((a, b) => a.seat - b.seat);
}

export const seatIds = (seats: Seats): PlayerId[] => seats.map((s) => s.id);

/** Lobby screen text; `coarse` is a touch-first device, where tapping the LCD starts. */
export function lobbyText(seats: Seats, coarse: boolean): string[] {
  const n = seats.length;
  const join =
    n === 0 ? "PRESS A KEY TO JOIN." : `${n} PLAYER${n === 1 ? "" : "S"}. PRESS A KEY TO JOIN.`;
  return ["COMMITTEE SNAKE", "", join, coarse ? "TAP SCREEN TO START" : "ENTER TO START"];
}

/**
 * When the lobby starts on its own: 5 s after the second claim, or 5 s after entering the lobby
 * when two or more seats carried over from the last round. Null with fewer than two seats.
 */
export function autoStartAt(seats: Seats, lobbySince: number): number | null {
  if (seats.length < 2) return null;
  const second = seats
    .map((s) => s.claimedAt)
    .sort((a, b) => a - b)
    .at(1);
  return Math.max(second ?? lobbySince, lobbySince) + AUTO_START_MS;
}
