// Independent CPU composition contracts; no shader/compiler import or I/O.
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const mul = (A, x) => A.map(row => dot(row, x));
const transpose = A => A[0].map((_, j) => A.map(row => row[j]));
const add = (a, b, scale = 1) => a.map((x, i) => x + scale * b[i]);
const quadratic = (a, S, b = a) => dot(a, mul(S, b));
const field = (kind, rate, phase = 0) => ({ kind, rate, phase });
const standard = { mean: [0, 0], covariance: [[1, 0], [0, 1]] };

// E exp(i(k.X+p)) = exp(-k^T Sigma k/2) exp(i(k.mu+p)).
function characteristic(k, p, gaussian) {
  const angle = dot(k, gaussian.mean) + p;
  const amplitude = Math.exp(-quadratic(k, gaussian.covariance) / 2);
  return [amplitude * Math.cos(angle), amplitude * Math.sin(angle)];
}
function trigMean(f, gaussian) {
  return characteristic(f.rate, f.phase, gaussian)[f.kind === 'cos' ? 0 : 1];
}
function trigProduct(f, g, gaussian) {
  const plus = characteristic(add(f.rate, g.rate), f.phase + g.phase, gaussian);
  const minus = characteristic(add(f.rate, g.rate, -1), f.phase - g.phase, gaussian);
  if (f.kind === 'cos' && g.kind === 'cos') return (minus[0] + plus[0]) / 2;
  if (f.kind === 'sin' && g.kind === 'sin') return (minus[0] - plus[0]) / 2;
  return (plus[1] + (f.kind === 'sin' ? 1 : -1) * minus[1]) / 2;
}
function pullback(f, A, b) {
  return field(f.kind, mul(transpose(A), f.rate), f.phase + dot(f.rate, b));
}
function pushGaussian(gaussian, A, b) {
  const AS = A.map(row => mul(transpose(gaussian.covariance), row));
  return { mean: add(mul(A, gaussian.mean), b), covariance: AS.map(row => A.map(other => dot(row, other))) };
}

export function runCompositionGates() {
  const cases = [], checks = [];
  const check = (name, passed, evidence) => checks.push({ name, passed, ...(evidence ? { evidence } : {}) });
  const near = (a, b) => Math.abs(a - b) <= 3e-14;
  function moments(name, source, means, seconds, product, exactFormula) {
    const variance = seconds.map((v, i) => Math.max(0, v - means[i] ** 2));
    const residualL2 = variance.map(Math.sqrt), marginalSubstitution = means[0] * means[1];
    const error = product - marginalSubstitution, bound = residualL2[0] * residualL2[1];
    const item = { name, source, exactFormula, evaluation: { means, seconds, product, marginalSubstitution,
      signedSubstitutionError: error, residualL2, cauchySchwarzBound: bound,
      marginalMeanErrorsOfConstantModels: [0, 0] } };
    cases.push(item);
    check(`${name}: centered residual product bound`, Math.abs(error) <= bound + 3e-14,
      { absoluteError: Math.abs(error), bound });
    return item.evaluation;
  }
  function trig(name, f, g, gaussian = standard) {
    return moments(name, { gaussian, left: f, right: g }, [trigMean(f, gaussian), trigMean(g, gaussian)],
      [trigProduct(f, f, gaussian), trigProduct(g, g, gaussian)], trigProduct(f, g, gaussian),
      'Gaussian characteristic function plus exact product-to-sum identities; variances are E[f²]−E[f]².');
  }
  const sine = field('sin', [1, 0]), cos = field('cos', [1, 0]);
  const v = (1 - Math.exp(-2)) / 2;
  const aligned = trig('sine-aligned', sine, sine);
  const opposed = trig('sine-antialigned', sine, field('sin', [-1, 0]));
  const independent = trig('sine-orthogonal-latents', sine, field('sin', [0, 1]));
  check('same zero sine means permit positive, negative, or zero products',
    [aligned, opposed, independent].every(e => e.means.every(m => m === 0))
      && near(aligned.product, v) && near(opposed.product, -v) && near(independent.product, 0));
  check('aligned sine reaches the Cauchy-Schwarz bound', near(aligned.product, aligned.cauchySchwarzBound));
  check('exact marginal means alone do not control product error',
    aligned.marginalMeanErrorsOfConstantModels.every(e => e === 0) && aligned.signedSubstitutionError > 0.4);

  const cc = trig('cosine-aligned', cos, cos);
  const co = trig('cosine-independent', cos, field('cos', [0, 1]));
  check('equal nonzero cosine means also fail to determine the product',
    near(cc.means[0], Math.exp(-0.5)) && near(cc.means[0], co.means[1])
      && near(cc.product, (1 + Math.exp(-2)) / 2) && near(co.product, Math.exp(-1))
      && cc.product - co.product > 0.19);
  const sc = trig('mixed-sine-cosine', sine, field('cos', [1, 0], Math.PI / 2));
  check('mixed product phase and sign', near(sc.product, -v));

  // Centered sign fields are exact almost surely; the zero hyperplane has
  // Gaussian measure zero. The displayed means/products below are algebraic,
  // with no quadrature or sign smoothing. Ink conversion gives actual masks.
  for (const [relation, product] of [['aligned', 1], ['antialigned', -1], ['independent', 0]]) {
    const rate = relation === 'aligned' ? [1, 0] : relation === 'antialigned' ? [-1, 0] : [0, 1];
    const sign = moments(`sign-${relation}`, { gaussian: standard, left: 'sign(X0)', rightRate: rate },
      [0, 0], [1, 1], product, 'sign(X0)²=1 a.s.; sign(−X0)=−sign(X0); X0 and X1 independent.');
    const ink = moments(`binary-mask-${relation}`, { map: '(1+sign)/2', latentRelation: relation },
      [0.5, 0.5], [0.5, 0.5], (1 + product) / 4,
      'E[((1+F)/2)((1+G)/2)] = (1+E[F]+E[G]+E[FG])/4.');
    check(`${relation}: exact bounded mask/sign values`, sign.product === product && ink.product === (1 + product) / 4);
  }

  // Equal variances, but Euclidean and covariance-metric orthogonality differ.
  const anisotropic = { mean: [0, 0], covariance: [[4, 1], [1, 1]] };
  const a = field('cos', [0.5, 0]);
  const b = field('cos', [-1 / (2 * Math.sqrt(3)), 2 / Math.sqrt(3)]);
  const metricOrthogonal = trig('anisotropic-covariance-orthogonal', a, b, anisotropic);
  const euclideanOrthogonal = trig('anisotropic-euclidean-orthogonal', a, field('cos', [0, 1]), anisotropic);
  check('independence uses k^T Sigma l, not Euclidean direction',
    near(quadratic(a.rate, anisotropic.covariance, b.rate), 0)
      && near(metricOrthogonal.product, Math.exp(-1))
      && near(euclideanOrthogonal.means[0], metricOrthogonal.means[1])
      && euclideanOrthogonal.signedSubstitutionError > 0.04);

  const base = { mean: [0.25, -0.5], covariance: [[0.8, 0.25], [0.25, 1.4]] };
  const A = [[2, 1], [0.5, -1]], offset = [-0.2, 0.4];
  const f = field('sin', [0.8, -0.3], 0.2), g = field('cos', [-0.2, 0.7], -0.4);
  const pulled = trig('affine-warp-pulled-back', pullback(f, A, offset), pullback(g, A, offset), base);
  const pushed = trig('affine-warp-pushed-measure', f, g, pushGaussian(base, A, offset));
  check('affine coordinate change preserves joint means and product',
    pulled.means.every((m, i) => near(m, pushed.means[i])) && near(pulled.product, pushed.product));
  cases[cases.length - 1].coordinateContract = { A, offset,
    exact: 'Y=A X+b: k_pull=A^T k, phase_pull=phase+k·b; mu_Y=A mu+b, Sigma_Y=A Sigma A^T.' };

  // Nonconstant, biased models need the two mixed terms as well as r*s.
  // F=G=sin(X0), Fhat=.8F+.1, Ghat=.6G−.2.
  const residualF = Math.sqrt(0.2 ** 2 * v + 0.1 ** 2);
  const residualG = Math.sqrt(0.4 ** 2 * v + 0.2 ** 2);
  const modelF = Math.sqrt(0.8 ** 2 * v + 0.1 ** 2), modelG = Math.sqrt(0.6 ** 2 * v + 0.2 ** 2);
  const modelProduct = 0.48 * v - 0.02, error = v - modelProduct;
  const residualOnly = residualF * residualG;
  const bound = residualF * modelG + residualG * modelF + residualOnly;
  cases.push({ name: 'general-model-residual-bound', source: 'F=G=sin(X0); Fhat=.8F+.1; Ghat=.6G−.2',
    exactFormula: '|E[FG−Fhat Ghat]| ≤ ||r||2||Ghat||2 + ||s||2||Fhat||2 + ||r||2||s||2, r=F−Fhat, s=G−Ghat.',
    evaluation: { product: v, modelProduct, absoluteError: error, residualL2: [residualF, residualG],
      modelL2: [modelF, modelG], correctBound: bound, invalidResidualOnlyBound: residualOnly } });
  check('general product error obeys all three Cauchy-Schwarz terms', error <= bound + 3e-14);
  check('dropping mixed model/residual terms would be false', error > residualOnly + 0.1);

  return { version: 1, passed: checks.every(c => c.passed), contract: {
    objective: 'Preserve joint latent dependence when filtering material products; correct marginal means are insufficient.',
    measure: 'One shared Gaussian X~N(mu,Sigma), with finite second moments; all phase rates are radians per coordinate unit.',
    exactIdentities: [
      'E exp(i(k·X+p))=exp(i(k·mu+p)−k^T Sigma k/2).',
      'E[FG]=E[F]E[G]+E[(F−E[F])(G−E[G])].',
      '|E[FG]−E[F]E[G]|≤sqrt(Var(F)Var(G)); exact marginal means do not make these variances vanish.',
      'For Gaussian affine coordinates, zero cross-covariance gives independence; an arbitrary coordinate change does not.',
    ],
    arithmetic: 'Exact analytic identities evaluated with JavaScript binary64/Math transcendentals; checks allow3e-14 rounding slack. No interval-certified floating-point error bound is claimed.',
    industryConsequence: 'Masks, albedo and lighting sharing coordinates need joint integration or a residual/covariance bound. Multiplying independently filtered factors can fail even when both input means are exact.',
  }, cases, checks, limits: [
    'These gates cover finite affine Gaussian trigonometric factors and centered sign/mask examples, not general BSDFs, textures, visibility, non-Gaussian footprints or nonlinear warps.',
    'The general residual theorem requires proven or conservative L2 residual/model norms under the SAME measure. Marginal mean error and a few point probes do not supply those norms.',
    'No shader emitter, runtime budget, ray footprint transport, temporal reconstruction, discontinuity integrator or GPU performance is established here.',
    'Exact means of a source and a surrogate do not establish their pointwise correlation, so an accurate analytic mean alone does not justify a useful control variate.',
  ] };
}
