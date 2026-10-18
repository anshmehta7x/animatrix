/** Minimal in-place radix-2 FFT and spectrum helpers. */
import { InvalidArgumentError } from "@anshmehta7x/animatrix-core";

/** In-place complex FFT. `re`/`im` length must be a power of two. */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  if (n & (n - 1)) throw new InvalidArgumentError("FFT size must be a power of two");
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Magnitude spectrum (first n/2 bins) of a Hann-windowed real signal. */
export function magnitudes(samples: Float32Array): Float32Array {
  const n = samples.length;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < n; i++)
    re[i] = samples[i]! * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  fft(re, im);
  const out = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) out[i] = Math.hypot(re[i]!, im[i]!) / (n / 4);
  return out;
}

/**
 * Group FFT bins into `bands` log-spaced bands between `lo` and `hi` Hz and convert to 0..1
 * using a dB range (`floorDb`..0).
 */
export function logBands(
  mags: Float32Array,
  sampleRate: number,
  bands: number,
  lo = 40,
  hi = 16000,
  floorDb = -70,
): Float32Array {
  const binHz = sampleRate / (mags.length * 2);
  const out = new Float32Array(bands);
  for (let b = 0; b < bands; b++) {
    const f0 = lo * Math.pow(hi / lo, b / bands);
    const f1 = lo * Math.pow(hi / lo, (b + 1) / bands);
    const i0 = Math.max(1, Math.floor(f0 / binHz));
    const i1 = Math.max(i0 + 1, Math.ceil(f1 / binHz));
    let peak = 0;
    for (let i = i0; i < i1 && i < mags.length; i++) peak = Math.max(peak, mags[i]!);
    const db = 20 * Math.log10(peak + 1e-9);
    out[b] = Math.min(1, Math.max(0, (db - floorDb) / -floorDb));
  }
  return out;
}
