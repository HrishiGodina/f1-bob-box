// The position feed reports raw car coordinates in its own frame — origin,
// rotation and scale differ from the drawn outline, and the frame is set per
// session, so it cannot be baked. Fit it live instead: as cars circulate they
// trace the whole loop, and a similarity transform from those samples onto
// the outline registers the map within seconds.

export interface FeedCalibration {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export interface FitResult {
  calibration: FeedCalibration;
  score: number;
}

// Screen-space distances (the 400x400 viewBox): a fit this far off is garbage.
const ACCEPT_SCORE = 12;
const GOOD_SCORE = 2.5;
const MAX_START_SAMPLES = 160;
const MAX_START_OUTLINE = 90;
const MAX_FIT_SAMPLES = 600;
const MAX_FIT_OUTLINE = 150;

export function isGoodFit(result: FitResult): boolean {
  return result.score <= GOOD_SCORE;
}

interface Sim {
  scale: number;
  cos: number;
  sin: number;
  tx: number;
  ty: number;
}

function apply(sim: Sim, p: readonly number[]): [number, number] {
  const x = sim.scale * (sim.cos * p[0] - sim.sin * p[1]) + sim.tx;
  const y = sim.scale * (sim.sin * p[0] + sim.cos * p[1]) + sim.ty;
  return [x, y];
}

function procrustes(from: number[][], to: number[][]): Sim {
  const n = from.length;
  let cpx = 0, cpy = 0, cqx = 0, cqy = 0;
  for (let i = 0; i < n; i++) {
    cpx += from[i][0]; cpy += from[i][1];
    cqx += to[i][0]; cqy += to[i][1];
  }
  cpx /= n; cpy /= n; cqx /= n; cqy /= n;
  let sxx = 0, sxy = 0, syx = 0, syy = 0, varp = 0;
  for (let i = 0; i < n; i++) {
    const px = from[i][0] - cpx, py = from[i][1] - cpy;
    const qx = to[i][0] - cqx, qy = to[i][1] - cqy;
    sxx += px * qx; sxy += px * qy; syx += py * qx; syy += py * qy;
    varp += px * px + py * py;
  }
  const theta = Math.atan2(sxy - syx, sxx + syy);
  const cos = Math.cos(theta), sin = Math.sin(theta);
  const scale = varp > 0 ? (cos * (sxx + syy) + sin * (sxy - syx)) / varp : 1;
  return {
    scale,
    cos,
    sin,
    tx: cqx - scale * (cos * cpx - sin * cpy),
    ty: cqy - scale * (sin * cpx + cos * cpy),
  };
}

function nearest(p: readonly number[], target: readonly [number, number][]): [number, number] {
  let best = target[0];
  let bestD = Infinity;
  for (let i = 0; i < target.length; i++) {
    const dx = target[i][0] - p[0];
    const dy = target[i][1] - p[1];
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d; best = target[i];
    }
  }
  return best;
}

function symmetricScore(sim: Sim, samples: readonly number[][], outline: readonly [number, number][]): number {
  const moved = samples.map((s) => apply(sim, s));
  let s2o = 0;
  for (const p of moved) {
    const q = nearest(p, outline);
    s2o += Math.hypot(p[0] - q[0], p[1] - q[1]);
  }
  s2o /= moved.length;
  let o2s = 0;
  for (const o of outline) {
    let bestD = Infinity;
    for (const p of moved) {
      const d = Math.hypot(p[0] - o[0], p[1] - o[1]);
      if (d < bestD) bestD = d;
    }
    o2s += bestD;
  }
  o2s /= outline.length;
  return 0.5 * (s2o + o2s);
}

function stride<T>(list: readonly T[], max: number): T[] {
  const step = Math.max(1, Math.ceil(list.length / max));
  return list.filter((_, i) => i % step === 0);
}

function refine(sim: Sim, samples: readonly number[][], outline: readonly [number, number][], iters: number): Sim {
  let current = sim;
  let best = sim;
  let bestScore = symmetricScore(sim, samples, outline);
  for (let i = 0; i < iters; i++) {
    const from: number[][] = [];
    const to: number[][] = [];
    for (const s of samples) {
      const p = apply(current, s);
      const q = nearest(p, outline);
      from.push([s[0], s[1]]);
      to.push([q[0], q[1]]);
    }
    current = procrustes(from, to);
    const score = symmetricScore(current, samples, outline);
    if (score < bestScore) {
      bestScore = score;
      best = current;
    }
  }
  return best;
}

// Fits the raw position frame onto outline points already in screen space.
export function fitFeedCalibration(
  samples: readonly number[][],
  outline: readonly [number, number][]
): FitResult | null {
  if (samples.length < 80 || outline.length < 20) return null;

  const subSamples = stride(samples, MAX_START_SAMPLES);
  const subOutline = stride(outline, MAX_START_OUTLINE);
  const outlineSpan = span(outline);
  const sampleSpan = span(subSamples);
  const baseScale = sampleSpan > 0 ? outlineSpan / sampleSpan : 1;

  let seeds: Sim[] = [];
  for (let k = 0; k < 24; k++) {
    const theta = (k * Math.PI) / 12;
    const cos = Math.cos(theta), sin = Math.sin(theta);
    const c = centroid(subSamples);
    const q = centroid(outline);
    seeds.push({
      scale: baseScale,
      cos,
      sin,
      tx: q[0] - baseScale * (cos * c[0] - sin * c[1]),
      ty: q[1] - baseScale * (sin * c[0] + cos * c[1]),
    });
  }
  seeds = seeds.map((sim) => refine(sim, subSamples, subOutline, 8));
  seeds.sort((x, y) => symmetricScore(x, subSamples, subOutline) - symmetricScore(y, subSamples, subOutline));

  // full-resolution polish from the best seed, dropping off-track samples
  // (pit lane, garage) so they cannot drag the fit
  const fitSamples = stride(samples, MAX_FIT_SAMPLES);
  const fitOutline = stride(outline, MAX_FIT_OUTLINE);
  let bestSim = seeds[0];
  for (const seed of seeds.slice(0, 2)) {
    const full = refine(seed, fitSamples, fitOutline, 6);
    const dists = fitSamples.map((s) => {
      const p = apply(full, s);
      const q = nearest(p, fitOutline);
      return Math.hypot(p[0] - q[0], p[1] - q[1]);
    });
    const sorted = [...dists].sort((x, y) => x - y);
    const cut = sorted[Math.floor(sorted.length * 0.9)];
    const kept = fitSamples.filter((_, i) => dists[i] <= cut);
    const polished = kept.length >= fitSamples.length * 0.6 ? refine(full, kept, fitOutline, 6) : full;
    if (symmetricScore(polished, fitSamples, fitOutline) < symmetricScore(bestSim, fitSamples, fitOutline)) {
      bestSim = polished;
    }
  }

  const score = symmetricScore(bestSim, samples, fitOutline);
  if (!Number.isFinite(score) || score > ACCEPT_SCORE) return null;

  const { scale, cos, sin, tx, ty } = bestSim;
  return {
    score,
    calibration: {
      a: (scale * cos) / 360,
      b: (-scale * sin) / 360,
      c: (tx - 20) / 360,
      d: (-scale * sin) / 360,
      e: (-scale * cos) / 360,
      f: 1 - (ty - 20) / 360,
    },
  };
}

function centroid(points: readonly (readonly number[])[]): [number, number] {
  let x = 0, y = 0;
  for (const p of points) {
    x += p[0];
    y += p[1];
  }
  return [x / points.length, y / points.length];
}

function span(points: readonly (readonly number[])[]): number {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
  }
  return Math.hypot(maxX - minX, maxY - minY);
}