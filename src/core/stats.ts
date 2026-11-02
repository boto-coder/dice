/** Pearson's chi-square statistic: Σ (observed − expected)² / expected. */
export function chiSquare(observed: readonly number[], expected: readonly number[]): number {
  if (observed.length !== expected.length) {
    throw new RangeError('observed and expected must have the same length');
  }
  return observed.reduce((sum, o, i) => {
    const e = expected[i]!;
    if (!(e > 0)) throw new RangeError(`expected count must be positive (index ${i})`);
    return sum + (o - e) ** 2 / e;
  }, 0);
}

/** ln Γ(x) for x > 0 (Lanczos approximation, ~15 significant digits). */
export function lnGamma(x: number): number {
  const g = 7;
  const c = [
    0.9999999999998099, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  const z = x - 1;
  let a = c[0]!;
  const t = z + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i]! / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Regularized upper incomplete gamma Q(a, x) = Γ(a, x) / Γ(a), by series for
 * x < a + 1 and a continued fraction otherwise (Numerical Recipes, §6.2).
 */
export function gammaQ(a: number, x: number): number {
  if (x < 0 || a <= 0) throw new RangeError('gammaQ needs a > 0 and x ≥ 0');
  if (x === 0) return 1;
  const lnPrefix = -x + a * Math.log(x) - lnGamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 1000; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    return 1 - sum * Math.exp(lnPrefix);
  }
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return Math.exp(lnPrefix) * h;
}

/** Probability of a chi-square value at least this large if the die were fair. */
export function chiSquarePValue(statistic: number, degreesOfFreedom: number): number {
  return gammaQ(degreesOfFreedom / 2, statistic / 2);
}

export interface GoodnessOfFit {
  readonly statistic: number;
  readonly degreesOfFreedom: number;
  readonly pValue: number;
}

/**
 * Chi-square goodness-of-fit test of observed counts against outcome
 * probabilities (which need not be equal, e.g. a custom die with a repeated face).
 */
export function goodnessOfFit(
  observed: readonly number[],
  probabilities: readonly number[],
): GoodnessOfFit {
  const total = observed.reduce((a, b) => a + b, 0);
  const statistic = chiSquare(
    observed,
    probabilities.map((p) => p * total),
  );
  const degreesOfFreedom = observed.length - 1;
  return { statistic, degreesOfFreedom, pValue: chiSquarePValue(statistic, degreesOfFreedom) };
}
