# Phase reduction and the cost of material composition

2026-09-06. Theory only. No implementation, benchmark, fixed-float result,
or novelty claim. This extends the questions in [SCALE-THEORY.md](SCALE-THEORY.md)
and [SHARED-PHASE-COST.md](SHARED-PHASE-COST.md) beyond one arrangement method.

The proposed organizing principle is to preserve the dependencies seen by
the final material response, then price both the variables retained between
parts of the calculation and the functions carried on those variables.
Count-map dimension, carrier-module rank, graph width, and function complexity
are different quantities. None alone is a general cost certificate.

## 1. A finite-footprint quotient for specified observables

Let Z be standard Gaussian in R^r, B a real d-by-r matrix, Omega>0, and

\[
 \theta(Z)=\theta_0+\Omega BZ\pmod{2\pi},\qquad
 \psi(z,\theta)=\sum_{k\in S}a_k(z)e^{ik\cdot\theta},
 \quad S\subset\mathbb Z^d\ \text{finite}.
\]

The same Z drives the amplitudes and phases. They are not independent.
Define the integer resonance lattice and its closed torus subgroup

\[
 \Lambda=\{k:B^Tk=0\},\qquad
 H=\overline{B\mathbb R^r\pmod{2\pi}}.
\]

Haar averaging psi(z,theta_0+h) over h in H retains precisely k in Lambda.
Indeed a character's Haar integral equals itself times its value at every
h in H; it must vanish unless the character is constant on H. Thus the
candidate reduced mean is

\[
 I_{\rm res}=\sum_{k\in S\cap\Lambda}e^{ik\cdot\theta_0}E a_k(Z).
 \tag{1}
\]

For k outside Lambda, put lambda_k=Omega|B^Tk| and e_k=B^Tk/|B^Tk|.
For bounded C^1 amplitudes with Gaussian-integrable directional derivatives,
Gaussian integration by parts gives, for J_k(s)=E[a_k(Z)e^{is e_k\cdot Z}],

\[
 J_k'(s)+sJ_k(s)
 =iE[(\partial_{e_k}a_k)(Z)e^{is e_k\cdot Z}].
\]

Solving this scalar equation proves

\[
 |E\psi(Z,\theta(Z))-I_{\rm res}|
 \le\sum_{k\notin\Lambda}
 \left\{|Ea_k|e^{-\lambda_k^2/2}
 +E|\partial_{e_k}a_k|\,D(\lambda_k)\right\},
\]
\[
 D(\lambda)=e^{-\lambda^2/2}\int_0^\lambda e^{s^2/2}\,ds
 \le\min(\lambda,2/\lambda).
 \tag{2}
\]

Both sums here and below run over S. For the second inequality, use
lambda^2-s^2 >= lambda(lambda-s); the first bound follows by bounding
the integrand after multiplication by exp(-lambda^2/2) by one.
Constant amplitudes recover the exact Gaussian harmonic multiplier.

There is also a version needing only a uniform Holder modulus. If
|a_k|<=M_k and |a_k(z+h)-a_k(z)|<=C_k|h|^alpha, 0<alpha<=1, shift the
Gaussian integral by h=pi e_k/lambda_k. The character changes sign, so
half the difference of the shifted and original integrands bounds it:

\[
 |J_k(\lambda_k)|\le
 \min\left\{M_k,\,
 \frac{C_k}{2}\left(\frac{\pi}{\lambda_k}\right)^\alpha+
 M_k\left[2\Phi\left(\frac{\pi}{2\lambda_k}\right)-1\right]\right\}.
 \tag{3}
\]

The second term is the TV distance between two shifted unit Gaussians,
times M_k; it is at most M_k sqrt(pi/2)/lambda_k.
Summing (3) is an alternative bound for (1). This accommodates the
Holder regularity produced by [exact conditioning](CONDITIONAL-FAST-PHASE.md),
provided the finite phase representation has its own certificate.

Residual slow phases CZ may stay explicitly in the coset
theta_0+CZ+H, or be included in a_k(z)exp(ik dot Cz); their variation then
enters (2) or (3). Exact integer relations specify H. Deciding those
relations from uncertain floating-point frequencies is a separate problem.

At finite scale, it is often preferable to retain additional near-resonant
characters and charge only the omitted terms in (2) or (3). This is a
spectral approximation, generally not a subgroup quotient: a cutoff set
need not be closed under addition.

The original observable must be preserved. If psi is only an approximation
to a material response, add its error under BOTH the original diagonal law
and the reduced law. A uniform error eta gives at most 2 eta for comparing
the two laws. Small L1 error against independent torus measure alone says
nothing about evaluation on the shared-Z diagonal. Hard thresholds require
appropriate brackets, boundary mass control, or exact conditioning; they
do not have a uniformly accurate continuous approximation across a jump.
The size of S, its coefficient bounds, and obtaining this certificate are
part of the cost.

### Why large individual frequencies do not suffice

Take theta_1=Omega Z and theta_2=(Omega+delta)Z, with
psi=(1+cos(theta_1-theta_2))/2. The exact mean is

\[
 \frac12(1+e^{-\delta^2/2}),
\]

whereas independent uniform phases give 1/2. The discrepancy stays large
for small delta at arbitrarily large Omega. An irrational frequency ratio
has no nonzero exact integer resonance, but that does not remove this
finite-footprint beat. Across unrestricted spectra, a lower bound for
nonzero |B^Tk| is unavailable without additional structure. The elementary
character calculation above is not a new discovery of torus averaging.

## 2. One phase can encode many independent material bits

There is a useful exact construction with no independence assumption
between different authored carriers. For U uniform on [0,1), define

\[
 b_i(U)=1_{[0,1/2)}(\{2^{i-1}U\}),\qquad i=1,\ldots,m.
\]

These are complements of the first m binary digits of U. The 2^m half-open
dyadic intervals realize every bit vector once, with equal mass. Thus, for
any supplied Boolean circuit F,

\[
 E_{\rm Haar}F(b_1,\ldots,b_m)
 =2^{-m}\#\{b\in\{0,1\}^m:F(b)=1\}.
 \tag{4}
\]

The carrier module has rank one throughout. Its largest authored carrier
is 2^(m-1) times the base carrier; the hard masks themselves have infinitely
many Fourier harmonics. This is a statement about compactly specified
material structure, not bounded frequency or fixed numerical precision.

The construction also has a source-preserving finite-Gaussian certificate.
Let theta=omega Z mod 2pi, Z standard normal and omega>0, and U=theta/(2pi).
The wrapped density has Fourier series

\[
 q_\omega(\theta)=\frac1{2\pi}
 \left[1+2\sum_{n\ge1}e^{-n^2\omega^2/2}\cos(n\theta)\right].
\]

It follows by the triangle inequality that

\[
 {\rm TV}(q_\omega,{\rm Haar})
 \le T(\omega):=\min\left\{1,\,
 \frac{e^{-\omega^2/2}}{1-e^{-3\omega^2/2}}\right\}.
 \tag{5}
\]

Successive terms of the positive series have ratio at most
exp(-3 omega^2/2). Integrating |cos| improves the displayed fraction by
2/pi, but is not needed. Every response in [0,1] that factors through this
phase has mean error at most T(omega), independent of its internal
complexity. In particular,

\[
 \left|E F(b_1(U),\ldots,b_m(U))-\#F/2^m\right|\le T(\omega).
 \tag{6}
\]

Tie conventions affect only finitely many phase points of zero mass.
This marginal TV statement is compatible with the joint-state obstruction:
the law of (Z,omega Z mod 2pi) remains at TV distance one from an independent
Gaussian-Haar pair. Equation (6) does not permit an arbitrary separately
Z-dependent amplitude.

## 3. Composition can be cheap or hard with the same phase rank

General exact circuit counting contains #SAT. Even restricted counting
families are #P-complete; see [Valiant 1979, section 4](https://www.math.cmu.edu/~af1p/Teaching/MCC17/Papers/enumerate.pdf).
Equation (4) therefore prevents an unconditional efficient exact averaging
claim based only on carrier rank. It is not an exponential lower bound.
For a high-precision finite-Gaussian reduction, choose omega so T(omega)
is below 2^(-m-3), and require integration error below 2^(-m-3); multiplying
by 2^m and rounding then recovers the integer count. Polynomially growing
integer omega suffices. Frequency encoding and precision are essential
parts of that statement.

The same construction gives a tractable family. Suppose F has L bounded-
fan-in gates. Add a binary variable for each gate and a factor imposing
its truth table. Each input assignment has exactly one consistent extension.
Include an output-acceptance factor and the input probabilities. Given an
elimination order whose largest bucket has at most w+1 binary variables,
sum-product elimination takes

\[
 O((m+L)2^{w+1})
 \tag{7}
\]

arithmetic operations. This is classical variable elimination, with the
factorization and order supplied; graph construction, finding an order,
and bit precision remain costs. The statement prices width of this
particular representation, not all representations of the same material.
[Dechter 1996, section 3.2](https://arxiv.org/pdf/1302.3572)

For example, F=product_{i=1}^{m-1}(1-b_i b_{i+1}) excludes neighboring
ones. Counts for strings ending in zero or one satisfy
(A_{i+1},B_{i+1})=(A_i+B_i,A_i), starting at (1,1). Its mean is
Fib_{m+2}/2^m in O(m) arithmetic. Equation (6) makes this a complete
conditional integration bound for the finite-Gaussian source: repeated
windings need not be enumerated. With the same pairwise factors on an
arbitrary graph, the mean instead counts independent sets, which has
general #P-hard instances by complementing the monotone 2-SAT variables.
Pairwise interactions alone do not ensure cheap elimination.

These hardness statements concern exact or sufficiently high-precision
answers. For any [0,1]-valued material, K independent samples give additive
error epsilon with failure probability at most 2 exp(-2K epsilon^2).
That classical bounded-variable concentration bound prevents interpreting
exact-counting hardness as a fixed-additive-pixel-error lower bound.
It also supplies neither a deterministic enclosure nor a gaming budget.
[Hoeffding 1963](https://doi.org/10.1080/01621459.1963.10500830)

### A compact law for a supplied finite-state pattern

Suppose a pattern reads the dyadic bits with a supplied s-state machine.
Let T_0,T_1 be its deterministic transition matrices, each with one unit
entry in every row, pi an initial probability row vector, and g in [0,1]^s
its final payoff. Its authored response is

\[
 F(b)=\pi T_{b_1}\cdots T_{b_m}g.
\]

The exact Haar mean is

\[
 E_{\rm Haar}F=\pi A^m g,\qquad A=(T_0+T_1)/2.
 \tag{8}
\]

Independence of the digits proves this by conditioning one digit at a
time; matrix commutativity is unnecessary. Sparse matrix-vector iteration
costs O(ms), or dense repeated squaring costs O(s^3 log(m+1)), in exact
arithmetic. Equation (5) supplies the finite-Gaussian error, independent
of m and s. Layer-dependent transitions give the ordered product of their
A_i, with no repeated-power shortcut.

Keeping a resolved prefix also gives the exact Haar conditional identity

\[
 E_{\rm Haar}[F\mid b_1,\ldots,b_k]
 =\pi T_{b_1}\cdots T_{b_k}A^{m-k}g.
\]

The Gaussian bound (5) is unconditional; conditioning on a small prefix
cell needs a new allowance. Exact rational denominators can require
Theta(m) bits, so repeated powering is not a logarithmic bit-time claim.

This is an exact law for averaging unresolved digits of a specified
generator, even with 2^m possible cells. It is not yet a semigroup for
arbitrary Gaussian footprint scales, and converting a general shader into
a small machine is not assumed. State count, construction and numerical
precision remain explicit. It illustrates the discrete-state closure
allowed by [CLOSURE-AND-SCALE.md](CLOSURE-AND-SCALE.md), rather than asserting
finite exact closure for arbitrary continuous material responses.

## 4. What must be bounded in a broader theory

For continuous material variables, small separator dimension does not
bound the complexity of a function on that separator. Even a single real
variable can carry arbitrarily many pieces or frequencies. Dechter's
section 2.3 already makes this distinction for continuous inequality
elimination. Bounded degree, finite domains, controlled spectral support,
Gaussian closure, or a proved compressible function family must supply the
missing representation and integration bound.
[Dechter 1999, section 2.3](https://ics.uci.edu/~csp/r76A.pdf)

The joint law belongs in the factorization. Material-graph treewidth is
not usable after simply dropping source correlations; conversely, genuine
sparse correlated laws can admit variable elimination without independent
phases. Treating all primitives as children of one continuous Z records
their shared origin but leaves the original integral in the Z factor.
Its low dimension is not a discrete table-size bound. Time and per-instance
offsets are parameters unless the target integral explicitly averages them.

The research target is therefore a class of materials with:

- a certified reduction of fast variation at the actual footprint;
- a supplied factorization retaining the required dependencies;
- a bounded separator representation and a priced elimination operation;
- an error rule stable under subsequent material composition.

The dyadic-mask family supplies one concrete example where many windings
collapse through algebraic structure. Equations (2)-(3) supply a different,
observable-dependent route to phase reduction. Combining them with general
continuous shading, visibility, or lighting is still an open task. A
graphics contribution would establish useful source-preserving classes and
their costs; the probability, harmonic analysis, and graph elimination used
here are established tools.
