# Closure and response across filtering scale

Research note, not an implementation or performance result. Memory here concerns **filtering scale**, such as Gaussian variance, not frame history. Projection-induced memory is classical: see [Chorin, Hald and Kupferman, *Optimal prediction with memory* (2002)](https://math.berkeley.edu/~chorin/CHK02.pdf). [Zhu (2021)](https://arxiv.org/abs/2109.01990) studies decay of orthogonal semigroups and memory under stated hypocoercivity assumptions. The finite-matrix construction below is our elementary derivation, without a novelty claim or an extension to unbounded operators.

## Three different closures

**Geometric closure** means the retained state determines its induced filtering dynamics, including cross-diffusion and drift. **Finite observable closure** means a finite linear span of responses is invariant under filtering. **Composition closure** additionally requires stability under material operations such as pointwise multiplication. Neither of the first two implies the third.

Indeed, a finite-dimensional unital algebra of continuous scalar functions on a connected domain contains only constants. For any member \(f\), finite dimensionality makes its powers linearly dependent, so a nonzero polynomial satisfies \(p(f)=0\). Its range is finite; continuity and connectedness force it to be constant. Nontrivial exact finite composition closure therefore requires restrictions such as a discrete partition, rather than an unrestricted continuous material family.

## Projection creates memory

For a finite matrix \(L\) and an orthogonal projection \(P\), set \(Q=I-P\) and \(S(t)=Pe^{tL}P\) on the retained space. Its semigroup defect is exactly

\[
S(t+s)-S(t)S(s)=Pe^{tL}Qe^{sL}P.
\]

Write \(u'=Lu\), \(p=Pu\), \(q=Qu\), and the blocks

\[
A=PLP,\quad B=PLQ,\quad C=QLP,\quad D=QLQ.
\]

Eliminating \(q\) gives

\[
p'(t)=Ap(t)+Be^{tD}q_0+
\int_0^tK(t-s)p(s)\,ds,\qquad K(t)=Be^{tD}C.
\]

The initial omitted-state response is separate from the memory kernel. In Laplace coordinates the retained resolvent contains the Schur complement \(zI-A-B(zI-D)^{-1}C\). Replacing it by a constant generator discards scale dependence.

For example,

\[
L=\begin{pmatrix}-1&1\\1&-1\end{pmatrix},\quad
P=\operatorname{diag}(1,0),\quad u_0=(1,0)
\]

gives \(p(t)=(1+e^{-2t})/2\), which is not a scalar semigroup. The memory is \(e^{-t}\), yet its integrated replacement gives \(A-BD^{-1}C=0\) and wrongly predicts \(p(t)=1\). Rank-one coupling and a gap alone do not justify a memoryless closure. For self-adjoint \(L\), exact projected semigroup closure requires \(C=0\): the defect's leading term is \(ts\,C^*C\).

## A conditional finite approximation

Assume now \(L=L^*\preceq0\), \(D=-H\),

\[
0<\gamma I\preceq H\preceq\Gamma I,\qquad
B=C^*,\qquad \operatorname{rank}C=r,\qquad q_0=0.
\]

All norms below are Euclidean/operator norms. Let \(S=C^*H^{-1}C\). Choose \(0<\delta\le1\) and partition the spectrum of \(H\) into geometric bins \([\mu_j,(1+\delta)\mu_j]\), assigning shared endpoints once. There are at most

\[
N=\max\left(1,\left\lceil
\frac{\log(\Gamma/\gamma)}{\log(1+\delta)}
\right\rceil\right)
\]

bins. For each spectral projector \(E_j\), define

\[
S_j=C^*E_jH^{-1}C,\qquad
\widetilde K(t)=\sum_j\mu_j e^{-\mu_jt}S_j.
\]

Each \(S_j\) is positive semidefinite with rank at most \(r\). Factor \(R_j^*R_j=\mu_jS_j\), introducing at most \(r\) auxiliary coordinates per bin:

\[
\widetilde p'=A\widetilde p+\sum_jR_j^*z_j,
\qquad z_j'=R_j\widetilde p-\mu_jz_j,
\qquad(\widetilde p(0),z_j(0))=(p_0,0).
\]

This preserves integrated memory exactly:

\[
\int_0^\infty\widetilde K(t)\,dt=\sum_jS_j=S.
\]

It also preserves dissipativity. The augmented matrix is self-adjoint and its Schur complement is \(A+\sum_jR_j^*R_j/\mu_j=A+S\preceq0\), inherited from \(L\preceq0\). Thus its semigroup is a contraction. Merely changing rates while leaving their original amplitudes fixed would not provide this guarantee.

To bound error, decompose into individual spectral weights \(S_\lambda=C^*E_\lambda H^{-1}C\). For \(\mu\le\lambda\le(1+\delta)\mu\), the triangle inequality gives

\[
\int_0^\infty|\lambda e^{-\lambda t}-\mu e^{-\mu t}|\,dt
\le2(\lambda-\mu)/\lambda\le2\delta.
\]

Positivity of the weights then yields

\[
\int_0^\infty\|K(t)-\widetilde K(t)\|\,dt
\le2\delta\operatorname{tr}S.
\]

Reinsert \(\widetilde p\) into the original eliminated-state equation. Its retained residual is \((\widetilde K-K)*\widetilde p\), bounded by \(2\delta\operatorname{tr}S\,\|p_0\|\). The original semigroup is also contractive, so variation of constants proves

\[
\sup_{0\le t\le T}\|p(t)-\widetilde p(t)\|
\le2T\delta\operatorname{tr}S\,\|p_0\|.
\]

## What the result does not buy

For unit-norm initial states and \(\operatorname{tr}S>0\), choosing \(\delta\le\varepsilon/(2T\operatorname{tr}S)\) suffices for error \(\varepsilon\). Auxiliary dimension depends on coupling rank, spectral ratio, scale horizon, integrated coupling strength and tolerance. None of these is proved independent of material frequency or complexity. If \(S=0\), coupling already vanishes.

Preparing the spectral weights may still require the original large problem. A nonzero \(q_0\) needs its own approximation or error allowance. Even rank-one coupling can produce arbitrarily many distinct exponential rates, so exact memory complexity is unbounded by rank alone. The theorem concerns a fixed finite self-adjoint operator and projector, not changing camera-dependent operators or general nonnormal dynamics.

For nonnormal eliminated dynamics, an eigenvalue gap alone does not imply \(\|e^{tD}\|\le e^{-\gamma t}\). Any extension must control transient amplification and reestablish stability of the reduced realization; the positive spectral-weight proof above does not transfer automatically.

This could support reusable responses across a material family and many scale queries. For one material at one scale, constructing memory may cost more than direct integration. It supplies a conditional approximation and a place to measure complexity, not an industry cost claim.
