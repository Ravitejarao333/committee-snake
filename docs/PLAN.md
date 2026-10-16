# Committee Snake — Build Plan

**One line:** Classic phone Snake, except everyone in the room votes on where it turns, and the majority wins. **Tagline:** *Democracy was a mistake.* **Platform:** Browser, **desktop-first** (mobile works in v1, polished in v1.1), shareable link, nothing to install. **Target:** v1 playable online in \~3 weekends.

---

## 1. The core idea in 30 seconds

One snake per room. Every player holds a **standing vote** for UP, DOWN, LEFT or RIGHT. Every tick, the server counts the live votes and the snake turns toward the winner. Eat food, grow, go faster. When the snake dies, a **Blame Screen** names exactly who voted for the fatal move. That screen is the laugh, the clip, and the reason people send the link to friends.

Two kinds of rooms:

|  | Public Room | Private Room |
| --- | --- | --- |
| Who | Anyone on the internet | Friends with the link/code |
| Join | One "Play Now" button | `snake.example/r/K7QP` or type 4-char code |
| Rounds | Continuous; auto-restarts | Host presses Start |
| Settings | Fixed (fair for strangers) | Host chooses mode, speed, walls, map |
| Size | Max 24 voters + unlimited spectators per shard | Max 24 voters + spectators |
| Lifetime | Always exists | Closes after 10 minutes empty |

---

## 2. Theme: "the phone in your school bag, 2002"

We evoke the monochrome phone-LCD era **without copying any brand**. Nothing below names or imitates a specific manufacturer's logo, startup screen or ringtone.

### 2.1 Screen

- **Palette (only two colors on the game screen, like the original LCD):**
  - Background "lit LCD": `#C7F0D8`
  - Pixels: `#43523D`
  - Optional "unlit pixel ghost" grid lines at 6% opacity of `#43523D`. This sells the LCD feel more than anything else.
- **Grid:** 32 × 20 cells. Bigger than the original phone screen, because 20 people need room to argue, but the same chunky look.
- **Cell rendering:** each cell is drawn as a square with a 1px gap. The snake body uses the classic "segment with a notch" style. The head is a slightly different shape with an eye pixel, and the mouth opens one frame before eating.
- **LCD effects (subtle, toggleable):**
  - *Ghosting:* the tail end leaves a faint 120ms afterimage, like slow LCD response.
  - *Contrast flicker:* at game start, the screen "powers on" from blank to full contrast over 300ms.
  - *Scanline shimmer:* 2% opacity horizontal bands drifting slowly. This is your "wave" animation, done subtly.
- **Font:** a pixel font, e.g. *Press Start 2P* or *VT323* (both Google Fonts, open licence). Scores and the HUD use it.

### 2.2 The phone frame (desktop)

The game screen sits inside a drawn, chunky candybar-phone body (original design, our own shape), with:

- A **keypad** below the screen. Keys **2 / 4 / 6 / 8** are the vote buttons, exactly like the old control scheme, and they light up when pressed.
- **Keyboard mapping:** arrow keys, WASD, the number row's 2/4/6/8 and the numpad all vote, and every press lights the matching on-screen key. (Most laptops have no numpad, so arrows are the real default; the keypad glow keeps the nostalgia.)
- **Desktop layout:** the phone sits centred and large. A **roster panel** on the left lists every player with their avatar and current vote. A **feed panel** on the right shows the last 5 Blame Screens as mini cards and a live emote stream. Below 1000px wide, both panels collapse into tabs.
- **5** = emote wheel. ***** = mute. **#** = leave room.
- A fake signal-strength bar that shows real ping (4 bars \<80ms, 1 bar >300ms). Battery icon = room capacity.

### 2.3 Mobile (v1: works; v1.1: polished)

**v1 bar:** someone tapping a WhatsApp link on a phone can join, vote and see the Blame Screen. The phone frame disappears (they're *holding* a phone), the LCD goes full-width, and a plain on-screen **2/4/6/8 keypad** sits under it. Side panels are hidden behind a roster button.

**v1.1:** swipe-to-vote, haptic tick on vote (`navigator.vibrate`), keypad sizing tuned on real devices, and native share-sheet polish.

### 2.4 Sound (all original, generated in-browser)

Pure square-wave beeps made with the Web Audio API. No samples, no copyrighted tones.

| Event | Sound |
| --- | --- |
| Your vote registered | 30ms blip at 880 Hz |
| Snake turns | 20ms tick at 440 Hz |
| Eat food | two-note up chirp (660 → 990 Hz) |
| Bonus creature appears | 3 rapid beeps |
| Death | descending 4-note "wah-wah" |
| Blame screen reveal | single low "dun" |

Sound is **off by default on mobile** and on after the first tap on desktop (browsers require a gesture anyway).

---

## 3. Game rules (precise)

### 3.1 Tick loop

- The game advances in discrete **ticks**. Classic Snake moved in steps, not smoothly, and we keep that for authenticity.
- **Speed:** starts at **3 ticks/second**, then +0.25 tps every 5 food eaten, capped at **8 tps**.
- Each tick, in this exact order:
  1. Tally votes (§3.2) → pick the new direction.
  2. Move the head one cell.
  3. Check collision (wall or self) → death.
  4. Check food → grow by 1, increment score, spawn new food.
  5. Check bonus creature → +bonus points, no growth.
  6. Broadcast the new state.

### 3.2 Voting: the heart of the game

- **Standing votes.** Your vote *stays* until you change it. You don't have to mash every tick. This single decision matters most: per-tick voting at 3–8 Hz is impossible for humans and feels random rather than funny.
- **Vote expiry.** A vote expires **4 seconds** after your last key press. Your seat goes grey ("napping"). This stops AFK players from silently steering.
- **Vote queue.** Each player holds up to two presses: the live *head* and one *pending* direction (ADR 0007). When the head wins a tick, the pending press takes over, so Up-then-Left inside one tick turns Up and then Left on consecutive ticks, and Down-then-Left escapes the right wall. A third press replaces the pending one. A pending press that has become a reverse is dropped. A head that keeps losing keeps its place. Expiry counts from your latest press.
- **Reverse votes don't count.** A vote for the opposite of the current direction can't win (classic rule). It's shown in its own grey "🙃 nonsense" tally so everyone can see who's trolling.
- **Tie-break:** if the current direction is among the tied winners, keep going straight. Otherwise pick among the tied directions with the seeded RNG (§6.3), so replays stay deterministic.
- **No votes at all:** keep going straight.
- **Live tally UI:** four bars around the screen edge (↑ top, ↓ bottom, ← left, → right) fill proportionally to live votes. Players' tiny pixel avatars stack on the bar they're voting for. This is the main animation of the game: avatars sliding between bars, bars pulsing on every tick.

### 3.3 Food and bonus

- **Food:** a single pixel-dot. Spawns at a random empty cell not within 2 cells of the head.
- **Bonus creature:** a 2×1 pixel critter appears every 5th food for **20 ticks**, with a countdown shown next to it. Worth 5–50 points depending on how fast you get it. Classic, and great for committee chaos ("WHY WOULD YOU GO FOR THE BUG").

### 3.4 Walls

- **Public:** solid walls (deaths are funnier).
- **Private:** host chooses solid or wrap-around.

### 3.5 Modes

| Mode | Rule | Where |
| --- | --- | --- |
| **Democracy** | Majority wins | Public + private (default) |
| **Chaos** | The **least** popular non-zero vote wins | Private; public every 5th round, announced in advance |
| **Dictator** | One random player steers alone for 10s, then the crown passes; everyone sees who's in charge | Private (v1.1) |
| **Two Snakes** | Room splits into two committees, each with its own snake, on one shared board | v2 |

### 3.6 Round flow

```
LOBBY (public: 5s; private: until host presses Start)
  → COUNTDOWN 3-2-1 (screen "powers on")
  → PLAYING
  → DEATH (freeze 600ms, snake blinks 3× like the old phones)
  → BLAME SCREEN (6s)
  → back to LOBBY
```

### 3.7 The Blame Screen (this is the product)

Shown for 6 seconds after every death:

```
╔══════════════════════════════╗
║        GAME OVER             ║
║   Score 48   Length 21       ║
║                              ║
║  The committee chose: LEFT   ║
║  ← LEFT   7  (FATAL)         ║
║  ↑ UP     3                  ║
║  → RIGHT  1                  ║
║                              ║
║  🔪 Assassins: priya, k1ng,  ║
║     snakeman, +4 others      ║
║  🙏 Tried to save it: rahul  ║
╚══════════════════════════════╝
```

Below it, **awards** (pick 2–3 per round):

- *The Assassin* — voted for the fatal move.
- *The Contrarian* — most votes that lost.
- *Most Agreeable* — highest % of their votes that won.
- *Professional Napper* — longest expired-vote streak.
- *Bug Hunter* — voted toward the bonus critter most.
- *The Prophet* — voted against the fatal move.

Plus a **funny caption** picked from a list keyed to how you died. Examples:

- Hit wall at length \< 5: *"Committee formed. Committee dissolved."*
- Ate own tail: *"The snake was its own worst enemy. Like the committee."*
- Died while chasing the bonus bug: *"Greed. Always greed."*
- Chaos mode: *"Nobody wanted this. That's how it won."*

A **Share** button exports the Blame Screen as a PNG via `canvas.toBlob()` and uses the native share sheet on mobile (`navigator.share`). This is the virality loop.

### 3.8 Emotes (no text chat in v1)

- 6 preset emotes: 😂 😱 🐍 👏 🤡 🙏
- Press 5 (or tap) → wheel → pick. The emote floats up from your avatar on the vote bars.
- Rate limit: 1 emote per 1.5s per player.
- **No free-text chat.** This is a deliberate decision: it removes the entire moderation problem from v1 and keeps the screen readable.

---

## 4. Player identity

- **No accounts in v1.** On first visit: pick a nickname (3–12 chars, `[a-zA-Z0-9_]`) or accept a random one ("SleepyCobra4"; generated names must also be ≤12 chars).
- Server-side **profanity filter** on nicknames (word list + leetspeak normalisation). Rejected names silently become a random one.
- **Avatar:** a 7×7 pixel face generated deterministically from a hash of the player id (like GitHub identicons, but LCD style).
- A **session token** (random 128-bit, stored in `localStorage`) lets you reconnect within 30s and keep your seat and stats. (Fine on your own hosted site; it's only artifact sandboxes that restrict storage.)

---

## 5. Architecture

### 5.1 Decision: authoritative server, dumb clients

Snake is discrete, tiny and deterministic. That means:

- The **server owns the only real game state**. Clients send votes and render what the server says.
- **No client-side prediction**, no rollback, no lag compensation. These are the hardest parts of multiplayer, and we skip them entirely.
- Cheating is impossible beyond "voting," which is the game.

### 5.2 Decision: Cloudflare Workers + Durable Objects

**Each room = one Durable Object (DO).** A DO is a single-threaded mini-server with its own ID and storage, living on Cloudflare's edge. One room per object maps perfectly onto "one snake, one tick loop, one source of truth."

Why this over alternatives:

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| **Cloudflare Workers + Durable Objects** | Room-per-object is the exact shape of this game; no servers to manage; global edge (good India latency); a free tier exists | Cloudflare-specific APIs; learning curve | ✅ **Choose** |
| Node + `ws` on a VPS | Simplest mental model | You manage scaling, restarts, TLS, a single region | Good fallback |
| Colyseus | Built for rooms + matchmaking | Still needs hosting; heavier than needed | Overkill |
| Firebase / Supabase Realtime | Fast to start | Not built for authoritative tick loops; would push game logic to clients | ❌ |
| WebRTC peer-to-peer | No server cost | Host advantage, NAT pain, no public rooms | ❌ |

Cost facts to plan around (from [Cloudflare's Durable Objects pricing page](https://developers.cloudflare.com/durable-objects/platform/pricing); re-check before launch, limits change):

- Durable Objects work on the Workers Free plan, but only the SQLite-backed kind. That's fine for us.
- Votes are cheap: incoming WebSocket messages are billed at a 20:1 ratio, and outgoing messages are free. Our heavy traffic (broadcasting state every tick) is outgoing.
- **Caveat:** the WebSocket Hibernation API won't save money *during* a game. It only stops duration charges when no events are running, and a live game ticks 3–8 times a second, so the object stays awake. Rooms cost only while a game is actually running; empty rooms must stop ticking (§5.6).
- Upgrade path: the [Workers Paid plan](https://developers.cloudflare.com/workers/platform/pricing/) starts at $5/month and includes Durable Objects usage. Expect to need it only if the game takes off.

### 5.3 System diagram

```
            ┌───────────────────────────┐
 Browser ──►│  Static client (assets)   │   HTML/JS/CSS, cached at edge
            └───────────────────────────┘
               │ wss://<same origin>/room/:id
               ▼
            ┌───────────────────────────┐
            │  Router Worker            │   validates, routes by room id
            └───────────────────────────┘
               │                │
     /public/join          /room/:code
               ▼                ▼
   ┌──────────────────┐   ┌──────────────────┐
   │ Lobby DO (1)     │   │ Room DO (many)   │   tick loop, votes, state
   │ tracks public    │──►│ public-shard-3   │
   │ shards + counts  │   │ private-K7QP     │
   └──────────────────┘   └──────────────────┘
```

### 5.4 Public room matchmaking

- A single **Lobby DO** holds a list of public shards and their live voter counts (each shard reports every 5s).
- **Fill-first assignment:** a new player goes to the *fullest* shard that is under 24 voters. Not round-robin. Busy rooms are fun and empty rooms are sad.
- If every shard is full, create `public-N+1`.
- If a shard drops to 0 for 2 minutes, it's retired.
- Over 24 voters? You can still join as a **spectator** (you see everything and can emote, but can't vote) and you're first in line for the next free seat.

**Why cap at 24?** In a 200-person committee, your vote is meaningless and the fun dies. 24 keeps every vote visible on the bars and the Blame Screen readable.

### 5.5 Cold-start problem (public room with 1 player)

The biggest risk at launch is someone clicking Play and finding an empty room. Mitigations:

- If a public shard has \< 3 humans, add **ghost voters**, clearly labelled with a 👻 and a grey avatar. They vote semi-randomly: 60% toward food, 25% straight, 15% chaos. They're always disclosed and never counted in awards.
- With 1 human, the HUD says *"You are the committee. Invite people to ruin it."* plus a copy-link button.
- Ghosts leave one at a time as humans arrive.

### 5.6 Room lifecycle

- **Private room:** created by `POST /room` → returns a 4-char code from an alphabet without lookalikes (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`, no I/O/0/1/L). That gives about 920k combinations; on a collision, retry.
- **Tick loop** runs only in state PLAYING/COUNTDOWN. In LOBBY with nobody connected, set a DO **alarm** for 10 minutes; if still empty, delete the room's storage and stop.
- The host is the first player in. If the host leaves, the longest-connected player becomes host.

### 5.7 Protocol

JSON over WebSocket for v1 (readable and debuggable). Each message has a type `t`. All client messages are validated with **zod** on the server; anything malformed or over 512 bytes is dropped, and repeated bad messages close the socket.

**Client → Server**

```ts
{ t: "hello", token?: string, name: string }      // on connect
{ t: "vote", d: "U" | "D" | "L" | "R" }           // idempotent; latest wins
{ t: "emote", e: 0..5 }
{ t: "start" }                                     // host only, private rooms
{ t: "settings", mode, speed, walls }              // host only, in lobby
{ t: "ping", c: clientTimeMs }
```

**Server → Client**

```ts
{ t: "welcome", you: PlayerId, token, room: RoomSnapshot }
{ t: "tick", n: tickNo, head: [x,y], dir, grew: bool,
  food: [x,y], bonus?: {x,y,ttl}, score, len }
{ t: "tally", n: tickNo, v: {U:7,D:0,L:2,R:1,X:1}, who: {pid: dir} }
{ t: "death", n, cause, fatalDir, tally, awards, caption, seed }
{ t: "roster", players: [...] }                    // on join/leave only
{ t: "emote", p: PlayerId, e }
{ t: "pong", c, s: serverTimeMs }
```

Design notes:

- **Ticks send deltas, not the full snake.** Clients maintain the snake themselves: push the new head, pop the tail unless `grew`. A full `RoomSnapshot` is sent on join and on reconnect, and every 50 ticks as a safety resync.
- **Tally is throttled** to at most 10 messages/second and sent only when it changes. This keeps the bars feeling live without spamming.
- Sizes: a tick is \~80 bytes, so even at 8 tps × 24 players that's trivial.

### 5.8 Latency and fairness

- The tally that counts is the one at the **server tick boundary**. With standing votes, a 200ms ping just means your vote lands one tick later, which is fair and invisible.
- The client shows your vote **immediately** (optimistic highlight on your key). That's the only "prediction" we do.
- The ping bar (§2.2) makes lag visible, so nobody blames the game for it.

---

## 6. Code structure and engineering practices

### 6.1 Monorepo

```
committee-snake/
├── packages/
│   └── shared/            # pure TypeScript, no I/O
│       ├── sim.ts         # step(state, votes, rng) -> {state, events}
│       ├── tally.ts       # vote counting, tie-breaks, modes
│       ├── rng.ts         # seeded PRNG (mulberry32)
│       ├── protocol.ts    # zod schemas + TS types
│       ├── awards.ts      # award + caption logic
│       └── *.test.ts
├── apps/
│   ├── server/            # Cloudflare Worker + DOs
│   │   ├── router.ts
│   │   ├── lobby.ts
│   │   └── room.ts
│   └── client/            # Vite + TypeScript, Canvas 2D
│       ├── main.ts
│       ├── net.ts         # socket, reconnect, ping
│       ├── render/        # lcd.ts, snake.ts, bars.ts, blame.ts
│       ├── input.ts       # keys, keypad, swipe
│       └── audio.ts       # Web Audio beeps
└── package.json           # pnpm workspaces
```

### 6.2 Decision: the simulation is a pure function

```ts
step(state: GameState, votes: VoteMap, rng: Rng): { state: GameState; events: GameEvent[] }
```

- No clocks, no sockets, no randomness except the passed-in RNG.
- The server calls it on each tick. Tests call it directly. A replay tool can call it from a seed plus a vote log.
- This one decision makes the whole game testable and debuggable.

### 6.3 Seeded randomness

Each round gets a 32-bit seed. Food spawns, tie-breaks and ghost votes all come from it. Store `(seed, vote log per tick)` for the last round in the DO's storage. Any reported bug can be replayed exactly.

### 6.4 Rendering

- **Canvas 2D, no game engine.** A 32×20 grid doesn't need Phaser or PixiJS, and plain Canvas loads instantly on cheap phones.
- **Render loop:** `requestAnimationFrame` at 60fps for the UI animations (bars, emotes, LCD shimmer). The snake itself only redraws on ticks, which is authentic.
- **Pixel-perfect scaling:** compute an integer cell size from the viewport, set `imageSmoothingEnabled = false`, and size the canvas for `devicePixelRatio`.
- UI outside the canvas (lobby, nickname, settings) is plain HTML + CSS. No framework needed in v1.

### 6.5 Reconnect

- On socket close: retry after 0.5s, 1s, 2s, 4s, then every 5s (with jitter), and show "Reconnecting…" on the LCD.
- On reconnect, send `hello` with your token → the server restores your seat → full snapshot.

### 6.6 Abuse and limits

| Threat | Defence |
| --- | --- |
| Vote spam | Votes are idempotent; the server keeps only the latest; over 20 msgs/s from one socket → disconnect |
| Many tabs / bots | Max 3 connections per IP per room; ghost-like behaviour (perfect timing) isn't a real threat because a single vote barely matters |
| Offensive names | Server-side filter (§4); "report name" via the emote wheel's long-press → after 3 reports the name becomes random |
| Room-code guessing | Private rooms aren't secret-critical; rate-limit room creation to 10/hour per IP |
| Oversized/malformed messages | zod validation, 512-byte cap |

### 6.7 Testing

- **Unit tests (Vitest)** on `shared`: movement, growth, wall/self collision, every tie-break case, reverse-vote rejection, vote expiry, chaos mode, award selection.
- **Property test:** run 10,000 random-vote games; assert the snake never overlaps itself without dying and the food never spawns on the snake.
- **Load test:** a script that opens 24 fake clients to one room and 50 rooms at once; measure tick jitter (target \< 30ms p95).
- **Manual:** test in Chrome, Firefox and Safari on desktop at every milestone, at 1366×768 (the most common budget-laptop size) as well as on your own screen. Do one smoke test on a cheap Android phone over 4G at M3 and M6 to confirm the v1 mobile bar.

### 6.8 Observability

- Log every room event as structured JSON (`room`, `tick`, `event`), viewable in Cloudflare's dashboard logs.
- Track counters: active rooms, voters per room, rounds/hour, average round length, Blame Screen shares.
- Privacy-friendly page analytics (Cloudflare Web Analytics; no cookies).

### 6.9 Accessibility

- Two-color monochrome with high contrast works for colour-blind players by default.
- `prefers-reduced-motion` turns off shimmer, ghosting and the emote float.
- Keypad buttons have ARIA labels ("Vote up", etc.).

---

## 7. Milestones

| # | Goal | Done when | Est. |
| --- | --- | --- | --- |
| **M0** | Pure sim + tests | `step()` passes all unit and property tests | 1 day |
| **M1** | Local single-player | LCD look, keypad, beeps; you can play solo in the browser | 1–2 days |
| **M2** | **Hot-seat committee** (local) | 4 people on one keyboard (WASD / arrows / IJKL / numpad) vote; tally bars + Blame Screen work. **Test whether it's funny here, before any server.** | 1 day |
| **M3** | Private rooms online | Create room → share link → friends join → host starts → full round with Blame Screen | 3–4 days |
| **M4** | Public rooms | Lobby DO, fill-first shards, ghost voters, auto-restart, spectators | 2–3 days |
| **M5** | Polish | Awards, captions, PNG share, emotes, reconnect, reduced motion, desktop side panels | 2–3 days |
| **M6** | Launch | Domain, OG preview image, load test passed, posted | 1 day |

**Gate after M2:** if 4 friends on one laptop aren't laughing within 3 rounds, change the rules (vote expiry time, speed, captions) before writing any network code.

---

## 8. Launch plan

- **Name check:** search "Committee Snake" on itch.io and app stores first, and grab the domain.
- **Link preview:** a 1200×630 Open Graph image showing a Blame Screen with "🔪 Assassins: you and 6 strangers". Link previews on WhatsApp and X are how this spreads.
- **Where to post:** r/WebGames, r/IndieGaming, itch.io (as a browser game), X with a 15-second clip of a 20-person death, Product Hunt once it's stable, and DM a few small streamers (one "chat plays the snake" stream is worth more than any post).
- **India angle:** the old-phone theme is pure nostalgia here; a Hinglish caption pack ("Committee ne kaand kar diya") as a toggle would be a fun local hook.
- **First-week metrics:** median session length (target > 5 min), rounds per session (> 4), share-button clicks per 100 rounds, and % of private rooms with 3+ players.

---

## 9. Later (v2 ideas, not now)

- *Two Snakes* mode: two committees, one board.
- Daily public "World Record Committee" with a global longest-snake leaderboard.
- Twitch integration: chat messages `2/4/6/8` count as votes.
- Unlockable LCD palettes (blue backlight, amber, "cracked screen").
- Replay viewer from seed + vote log, exported as a GIF.

---

## 10. Decisions summary

| Decision | Choice | Why |
| --- | --- | --- |
| Vote model | Standing votes, 4s expiry | Per-tick voting at 3–8 Hz is impossible for humans; expiry stops AFK steering |
| Authority | Server-authoritative, no prediction | Discrete tiny state; skips the hardest multiplayer problems |
| Backend | Cloudflare Workers + 1 Durable Object per room | Room-per-object matches the game exactly; edge latency; low cost |
| Public scaling | Fill-first shards, 24-voter cap, spectators | Keeps rooms lively and every vote visible |
| Cold start | Labelled 👻 ghost voters | Empty rooms kill new games |
| Chat | Preset emotes only | Zero moderation burden in v1 |
| Rendering | Canvas 2D, no engine, integer scaling | Instant load on cheap phones; crisp pixels |
| Sim | Pure `step()` + seeded RNG | Testable, replayable, debuggable |
| Theme | Generic early-2000s monochrome phone; original art and sound | Nostalgia without IP risk |
| Build order | Local hot-seat before networking | Prove it's funny before spending a week on servers |
| Platform priority | Desktop-first; mobile functional in v1, polished in v1.1 | Launch channels and streamers are desktop; keyboard voting feels best; the phone-frame nostalgia shows on big screens; shared links still open on phones |