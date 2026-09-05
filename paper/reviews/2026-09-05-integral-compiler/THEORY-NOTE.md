# Theory notes for the collaborator, from the compiler's side

Written while you work on the app. These are the things I think the theory still owes the demo, in the order I would want your help, with one concrete claim you can check in an afternoon against tables the compiler already has.

## 1. What the demo needs from the theory

The product is a side-by-side at real-time rates: no anti-aliasing, supersampling at equal cost, the published method, ours, under a moving camera, with meters. For that, the analytic path has to run per pixel on a GPU with no history buffer. Every theoretical question below is a question about what can be closed form or a small table per shader, and what must stay per-pixel arithmetic. The CPU compiler is the reference that certifies the GPU path and generates its tables; the theorems are what let a table exist.

Concretely the per-pixel work in the far field is: reduce the rate lattice (the tool's shader already does this), enumerate the retained recipes, and sum coefficient times multiplier times phase. The coefficients are the problem. For a picture of one count they are a per-shader table. For a picture of a count *with a field*, today they are the shift tables, tabulated per shader over a one-parameter family and interpolated; for a step of a sum they are transforms per pixel where the view enters. The theory that makes the rippled and bumped panels run in real time is whichever one turns those transforms into closed forms or view-independent tables.

## 2. A claim to check: field transforms are Bessel series

For a picture $p$ with coefficients $\hat p(k)$ of a count $u$ carrying a field with one harmonic on another count, $\phi(u') = a\sin 2\pi u'$,

$$p(u + a\sin 2\pi u') = \sum_k \hat p(k)\,e^{2\pi i k u}\sum_n J_n(2\pi k a)\,e^{2\pi i n u'},$$

by Jacobi–Anger. The joint coefficient of the recipe $(k, n)$ is $\hat p(k)\,J_n(2\pi k a)$, and its rate is $k\nabla u + n\nabla u'$. With several field harmonics the expansion is a product of Bessel series, a convolution in $n$ per harmonic (the generalised Bessel functions of FM synthesis). This is exact, needs no transform, and the amplitude $a$ is where the view enters: for a parallax field $a = c(p)\,a_0$ with $c$ the per-pixel scalar the compiler already computes. So the rippled and bumped variants of the plain shaders have per-pixel closed-form coefficients, Bessel functions of a per-pixel argument, evaluated by recurrence on the GPU.

The compiler's shift tables $Q(\theta;\ell)$ are the numerical form of exactly this. That makes the claim cheap to test: for the rippled quadratic sine, whose field is one harmonic, compare $Q(\theta;\ell)$ against $J_\ell(2\pi k\theta a_0)$ at the tabulated $\theta$. If it holds to the tables' accuracy, the shift machinery becomes an optimisation of a formula rather than the definition, which is the kind of simplification your composition-operator note asked for. Hard pictures are included, since the expansion applies to each of their Fourier coefficients; convergence in $n$ is by the Bessel functions' decay past $n \approx 2\pi k a$, and in the far field the multiplier kills large $k$ before the series gets long. I have not seen this used for prefiltering warped procedural textures; it is standard in FM signal theory, and novelty needs checking.

What does not fit the claim: a field that is a function of the *same* count (the self-referential case, fire with bumps), where the composition $p(u + cH(u))$ is a picture of one count whose coefficients are $\int p(u + cH(u))e^{-2\pi i \ell u}du$: a one-dimensional transform per $c$, which the same Bessel expansion handles when $H$ has few harmonics ($\hat p(k)$ times a Bessel product, then a resummation over $k$ at fixed $\ell$). That is the axis merge I owe, and I would rather build it on the formula than on a table.

## 3. The oracle is the spectral measure of the term

Both selection questions in this project, which recipes to keep and which terms to sample instead of integrate, are answered by the same object: for a term with coefficients $c_k$ and multipliers $m_k$ under the window, the mean is $\sum_k c_k m_k$ and the sampling variance is $\sum_{k,\ell} c_k\bar c_\ell (m_{k-\ell} - m_k\bar m_\ell)$, your covariance matrix. The compiler can evaluate both before doing any work, from the same coefficients. So the cost model for a hybrid is: analytic cost is the number of retained recipes; sampled cost is the residual variance after the best control in the chosen span, divided by the target variance, times the cost per sample; choose per term. The question I would like your view on: in the Stein framework, is the residual variance after the best $K$-term phase control expressible in the same spectral data (the $c_k$ and the multipliers), or does it genuinely need the pilot? If it is expressible, the whole hybrid has one cost model and no pilot for the terms the compiler has traced.

## 4. What the moiré theory is, in your language

Your note asked what the stations and deserts are doing in an anti-aliasing paper. In the measure language they are the theory of which coordinate to eliminate. The reduced basis of the rate lattice names the slow direction; a station is a pixel where that direction's rate is small enough that its recipes survive the window, a desert is a ratio at which no direction ever is; the duty null says the coefficient can veto the geometry. Exact conditioning, the quotient by the fast phases, the envelope table in the tool, are all "integrate along the reduced basis's fast vectors first". That is the sentence I would keep in the paper, with the duty null and one cancellation example as the demonstrations, and the rest cited.

## 5. Time is a third input, and the demo's temporal claim follows

A moving camera makes the state map a function of $(x, y, t)$ and the window a Gaussian in three coordinates; the theorem is unchanged, the Jacobian gains a column, and every recipe's multiplier gains the velocity's contribution. The analytic path therefore has no history buffer and no shimmer at rest by construction, and its motion blur is the same integral with a wider window in $t$. This is the claim against temporal anti-aliasing that the demo will make, and it is a corollary, not new work. The one open question is cost: the retained set changes frame to frame, and I do not yet know whether the lattice reduction per pixel per frame is cheap enough at $1080$p, or whether the recipe sets should be cached along the camera path.

## 6. What I would not spend time on

Remainder bounds for hard profiles: measured budgets and a validity probe instead. The semigroup as the paper's frame: one sentence and the scale-space citation. More counterexamples to freezing rules: the coverage integral replaced the rule.

## 7. Two things the compiler has learned that the theory should record

The centre-expanded model can be a good model of the mean and a poor model of the point values at the same pixel (the fract count at the quadratic sine's $(300,12)$, off by $0.85$ periods one pixel from the centre while the mean is within $1.2\times10^{-4}$). And the horizon residue was never a limit of the theory; it was a Taylor remainder of the geometry, removable by conditioning on the coordinate the geometry is affine in. I suspect every "third-order" residue we meet will turn out to be of that kind, and that the theory's real statement is: expand nothing that can be conditioned on.

## 8. Asks, in order

1. Check Section 2 against the shift tables (an afternoon; the tables are in `paper/tools/exp/fjet.mjs`, `shiftTables`, and the rippled quadratic sine's field has one harmonic). If it holds, the Bessel coefficients are the GPU path for the rippled and bumped panels.
2. Section 3's question: the residual variance after the best phase control, in spectral terms.
3. The correlated-coverage primitive from your answer 1, as before.
