/**
 * Synthesized glass: an impact (noise burst plus a falling sine thump), a crackle (short noise
 * grains through a bandpass), and a tinkle per shard as it lands (a sine plus an inharmonic
 * partial), and a low creak under each hit that groans louder and longer as the pane nears its
 * limit (a falling triangle tone with stick-slip tremolo, plus low filtered noise). Everything goes through a small feedback-delay room. All from one second of white
 * noise made once; no samples. Louder and brighter for harder hits.
 */
import type { Rng } from "@committee-snake/shared";
import { type AudioEngine, createAudioEngine } from "../fx/audio";

const STORAGE_KEY = "break-glass:muted";
const TINKLE_VOICES = 12;

interface Impact {
  /** Lowpass cutoff of the noise burst, Hz. */
  cutoff: number;
  thumpFrom: number;
  thumpTo: number;
  gain: number;
}

interface Grain {
  /** Start, seconds after the hit. */
  at: number;
  dur: number;
  freq: number;
  gain: number;
}

interface Ping {
  freq: number;
  /** Inharmonic partial, as a multiple of freq. */
  partial: number;
  /** Seconds to fade out. */
  decay: number;
  gain: number;
}

interface Creak {
  /** Seconds after the hit. */
  delay: number;
  dur: number;
  freqFrom: number;
  freqTo: number;
  /** Stick-slip tremolo rate, Hz. */
  tremolo: number;
  gain: number;
}

/** The creak for a pane at `ratio` (0..1) of its strength: quiet and short early, a loud groan at the end. */
export const creakParams = (ratio: number, rng: Rng): Creak => {
  const r = Math.min(1, Math.max(0, ratio));
  return {
    delay: 0.05 + 0.04 * rng.next(),
    dur: 0.25 + 0.55 * r,
    freqFrom: 95 + 40 * rng.next(),
    freqTo: 55 + 15 * rng.next(),
    tremolo: 14 + 16 * rng.next(),
    gain: 0.03 + 0.42 * r * r,
  };
};

/** Overall loudness for a hit of strength s. */
export const loudness = (s: number): number => 0.4 + 0.6 * s;

export const impactParams = (s: number): Impact => ({
  cutoff: 1500 + 4500 * s,
  thumpFrom: 110 * (1 + 0.2 * s),
  thumpTo: 45,
  gain: loudness(s),
});

/** 8–20 grains over 200–400 ms; more and longer for harder hits. */
export function crackleGrains(s: number, rng: Rng): Grain[] {
  const count = Math.round(8 + 12 * s);
  const spread = 0.2 + 0.2 * s;
  const grains: Grain[] = [];
  for (let i = 0; i < count; i++) {
    grains.push({
      at: rng.next() * spread,
      dur: 0.003 + 0.005 * rng.next(),
      freq: 2000 + 3000 * rng.next(),
      gain: (0.2 + 0.4 * rng.next()) * loudness(s),
    });
  }
  return grains.sort((a, b) => a.at - b.at);
}

export const tinklePing = (s: number, rng: Rng): Ping => ({
  freq: (2400 + 3600 * rng.next()) * (1 + 0.15 * s),
  partial: 2.76,
  decay: 0.3 + 1.2 * rng.next(),
  gain: (0.05 + 0.07 * rng.next()) * loudness(s),
});

export interface GlassSound {
  readonly engine: AudioEngine;
  impact(s: number): void;
  crackle(s: number): void;
  tinkle(s: number): void;
  /** The creak under a hit, for a pane at `ratio` of its strength. */
  creak(ratio: number): void;
  /** Fewer simultaneous tinkles, when frames run long. */
  setVoices(n: number): void;
  /** Sounds actually started, by kind. */
  readonly played: { impact: number; crackle: number; tinkle: number; creak: number };
}

interface Graph {
  ctx: AudioContext;
  noise: AudioBuffer;
  /** Dry bus and reverb send. */
  dry: GainNode;
  send: GainNode;
}

function buildGraph(ctx: AudioContext): Graph {
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const dry = ctx.createGain();
  dry.connect(ctx.destination);
  // A tiny room: two feedback delays with a lowpass in the loop.
  const send = ctx.createGain();
  const wet = ctx.createGain();
  wet.gain.value = 0.25;
  wet.connect(ctx.destination);
  for (const t of [0.037, 0.053]) {
    const d = ctx.createDelay(0.1);
    d.delayTime.value = t;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3200;
    const fb = ctx.createGain();
    fb.gain.value = 0.4;
    send.connect(d);
    d.connect(lp);
    lp.connect(fb);
    fb.connect(d);
    lp.connect(wet);
  }
  return { ctx, noise, dry, send };
}

export function createGlassSound(rng: Rng): GlassSound {
  const engine = createAudioEngine({ storageKey: STORAGE_KEY, touchStartsMuted: false });
  const played = { impact: 0, crackle: 0, tinkle: 0, creak: 0 };
  let graph: Graph | null = null;
  let voices = TINKLE_VOICES;
  let ringing = 0;

  const live = (): Graph | null => {
    const ctx = engine.live();
    if (!ctx) return null;
    if (graph?.ctx !== ctx) graph = buildGraph(ctx);
    return graph;
  };
  /** A gain envelope into the dry bus and the room. */
  const env = (g: Graph, t: number, peak: number, dur: number, wet: number): GainNode => {
    const v = g.ctx.createGain();
    v.gain.setValueAtTime(0, t);
    v.gain.linearRampToValueAtTime(peak, t + 0.001);
    v.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    v.connect(g.dry);
    const s = g.ctx.createGain();
    s.gain.value = wet;
    v.connect(s);
    s.connect(g.send);
    return v;
  };
  const burst = (
    g: Graph,
    t: number,
    dur: number,
    filter: BiquadFilterNode,
  ): AudioBufferSourceNode => {
    const src = g.ctx.createBufferSource();
    src.buffer = g.noise;
    src.connect(filter);
    src.start(t, Math.random() * 0.9, dur + 0.01);
    return src;
  };

  return {
    engine,
    impact(s) {
      const g = live();
      if (!g) return;
      const p = impactParams(s);
      const t = g.ctx.currentTime;
      const lp = g.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = p.cutoff;
      lp.connect(env(g, t, 0.6 * p.gain, 0.02, 0.5));
      burst(g, t, 0.02, lp);
      const osc = g.ctx.createOscillator();
      osc.frequency.setValueAtTime(p.thumpFrom, t);
      osc.frequency.exponentialRampToValueAtTime(p.thumpTo, t + 0.06);
      osc.connect(env(g, t, 0.8 * p.gain, 0.09, 0.2));
      osc.start(t);
      osc.stop(t + 0.1);
      played.impact++;
    },
    crackle(s) {
      const g = live();
      if (!g) return;
      const t0 = g.ctx.currentTime + 0.01;
      for (const gr of crackleGrains(s, rng)) {
        const bp = g.ctx.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = gr.freq;
        bp.Q.value = 1.5;
        bp.connect(env(g, t0 + gr.at, gr.gain, gr.dur, 0.4));
        burst(g, t0 + gr.at, gr.dur, bp);
      }
      played.crackle++;
    },
    tinkle(s) {
      const g = live();
      if (!g || ringing >= voices) return;
      const p = tinklePing(s, rng);
      const t = g.ctx.currentTime;
      const v = env(g, t, p.gain, p.decay, 0.6);
      for (const [f, a] of [
        [p.freq, 1],
        [p.freq * p.partial, 0.35],
      ] as const) {
        const osc = g.ctx.createOscillator();
        osc.frequency.value = f;
        const level = g.ctx.createGain();
        level.gain.value = a;
        osc.connect(level);
        level.connect(v);
        osc.start(t);
        osc.stop(t + p.decay + 0.02);
        if (a === 1) {
          ringing++;
          osc.onended = () => {
            ringing--;
          };
        }
      }
      played.tinkle++;
    },
    creak(ratio) {
      const g = live();
      if (!g) return;
      const p = creakParams(ratio, rng);
      const t = g.ctx.currentTime + p.delay;
      const v = g.ctx.createGain();
      v.gain.setValueAtTime(0, t);
      v.gain.linearRampToValueAtTime(p.gain, t + 0.05);
      v.gain.exponentialRampToValueAtTime(0.0001, t + p.dur);
      const lp = g.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 420;
      lp.connect(v);
      v.connect(g.dry);
      // Stick-slip: a square LFO chops the tone into the ratchet of a pane under load.
      const chop = g.ctx.createGain();
      chop.gain.value = 0.55;
      chop.connect(lp);
      const lfo = g.ctx.createOscillator();
      lfo.type = "square";
      lfo.frequency.value = p.tremolo;
      const depth = g.ctx.createGain();
      depth.gain.value = 0.45;
      lfo.connect(depth);
      depth.connect(chop.gain);
      const osc = g.ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(p.freqFrom, t);
      osc.frequency.exponentialRampToValueAtTime(p.freqTo, t + p.dur);
      osc.connect(chop);
      const bp = g.ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 180;
      bp.Q.value = 4;
      bp.connect(chop);
      burst(g, t, p.dur, bp);
      for (const o of [osc, lfo]) {
        o.start(t);
        o.stop(t + p.dur + 0.02);
      }
      played.creak++;
    },
    setVoices(n) {
      voices = n;
    },
    played,
  };
}
