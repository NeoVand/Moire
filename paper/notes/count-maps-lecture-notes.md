# Count maps: how a pixel sees a pattern

Lecture notes on a theory of anti-aliasing for shaders, written for readers with linear algebra, calculus, basic probability and a little signal processing.

## 0. What these notes are

A shader is a small program that gives every point of a surface a colour. A pixel is not a point. It covers a small area, and the colour it should show is an average of the shader over that area. Getting that average wrong is called aliasing, and it is the reason a distant checkerboard in a game shimmers, a fine stripe pattern turns into slow wavy bands, and thin patterns flicker when the camera moves.

These notes explain a way of thinking about that average that we have been developing and testing: count maps. The idea is simple to state. A pattern does not read the screen position; it reads a few numbers computed from it, such as "how many tiles along" and "how many tiles up". Call those numbers the counts. The pixel's average is then an average over the distribution of the counts, and that distribution is something we can describe exactly for large classes of cameras and patterns. Everything else in these notes is about making that description precise, cheap, and certified.

"We" means three parties: the author of the project, who set the goals and asks the hard questions; me, a Claude model, who wrote most of the derivations, the demo and these notes; and our collaborator, a GPT model we call Astra, who reviews every claim adversarially and has proved several of the results below. Every theorem here has a status tag:

- [proved] means a written proof exists and was checked by the other party.
- [audited] means the statement was reviewed as a conditional result, with its hypotheses listed.
- [measured] means a number from a probe or the demo, with the file that produced it.
- [open] means we believe it or want it and do not have it.

Nothing is assumed beyond the prerequisites, and every symbol is defined when it first appears. Section 13 has exercises; doing a few of them is the fastest way to make the material yours. Section 12 says honestly where the program stands.

## 1. The problem: a pixel is not a point

### 1.1 Shaders and the pixel average

Take a flat surface with coordinates $(s, t)$ in some length unit, and a function $f(s, t)$ giving its colour. For these notes colour is a single number in $[0, 1]$, grey level; three channels change nothing. Examples we use throughout:

- The checkerboard with tile size $L$: $f = 1$ where $\lfloor s/L \rfloor + \lfloor t/L \rfloor$ is even, $0$ otherwise. Here $\lfloor x \rfloor$ is the largest integer not above $x$.
- Stripes: $f = 1$ where $\lfloor s/L \rfloor$ is even.
- A thresholded field, or mask: $f = 1$ where $h(s, t) \ge 0$ for some smooth $h$, such as a sum of three sines.
- Procedural noise: a smooth random-looking function built from a hash of the integer lattice.

A camera maps each screen position $x = (x_1, x_2)$, in pixels, to a surface point $(s, t) = \Phi(x)$. The shader evaluated on screen is $f(\Phi(x))$.

A display pixel at position $x_0$ shows one number. What should it be? The average of the shader over the pixel's footprint, weighted by a window $w$:

$$ I(x_0) = \int f(\Phi(x))\, w(x - x_0)\, dx, \qquad \int w = 1. $$

The window we use is the Gaussian with standard deviation $\sigma = 0.5$ pixels:

$$ w(x) = \frac{1}{2\pi\sigma^2} \exp\left(-\frac{|x|^2}{2\sigma^2}\right). $$

Why a Gaussian and why $0.5$: it is the window of the benchmark our demo follows (Yang and Barnes, 2018), it is smooth, rotationally symmetric, and, as Section 4 shows, it turns every calculation in these notes into closed forms. A box window would be more "obvious" and would break almost everything below.

### 1.2 What goes wrong with one sample

The cheapest thing a renderer can do is evaluate the shader at the pixel centre, $I \approx f(\Phi(x_0))$. This is point sampling, and it fails as soon as the pattern varies faster than the pixel spacing.

Here is the failure in one line. Sample the wave $\sin(2\pi(1+\delta)n)$ at the integers $n$, so the wave makes $1 + \delta$ cycles per pixel. Since $\sin(2\pi n + 2\pi\delta n) = \sin(2\pi\delta n)$, the samples are exactly those of a wave with $\delta$ cycles per pixel. A fast wave masquerades as a slow one. That is aliasing, and the slow wave you see in a distant checkerboard, the moire, is a fake low frequency produced this way. A moving camera changes $\delta$ from frame to frame, so the fake pattern crawls and flickers.

The rule from signal processing is that a sampling grid with spacing $1$ can only represent frequencies below $1/2$ cycle per pixel (the Nyquist rate). The pixel average $I$ is the right object because the window removes the fast content before sampling. Our whole subject is computing $I$ without paying for it.

### 1.3 What the industry does

- Supersampling evaluates the shader at $N$ points per pixel and averages. Exact in the limit; costs $N$ times a sample. Sixteen samples is already expensive and still shimmers at the horizon.
- Mipmapping stores prefiltered copies of a stored image at many resolutions and picks the right one. It only works for stored images, not for programs, and its averages are boxes, not footprints.
- Temporal anti-aliasing (TAA) takes one sample per frame at a jittered position and blends it into a running history, reprojected from the previous frame. It is cheap and universal, and it is the industry standard. Its costs are blur, ghosting when the history is wrong, and flicker when the history is short. Section 9 makes all of that quantitative.

The goal of this program is a compiler that takes a shader and produces a second shader that computes $I$ exactly, or with a certified error, at a cost close to one sample. Where it cannot, the plan is to compute exactly what it can and let TAA handle the rest, with a proof that the exact part never ghosts or flickers. That is Section 9 again.

## 2. The pixel is a probability distribution

### 2.1 Averages as expectations

The window $w$ is nonnegative and integrates to one, so it is a probability density. The pixel average is therefore an expectation:

$$ I(x_0) = \mathbb{E}\,[\,f(\Phi(X))\,], \qquad X \sim \mathcal{N}(x_0, \sigma^2 I_2). $$

Here $X$ is a random point of the screen, normally distributed around the pixel centre with covariance $\sigma^2 I_2$ ($I_2$ is the $2 \times 2$ identity). Recall that for a random vector $X$ with density $p$, $\mathbb{E}[g(X)] = \int g(x)p(x)\,dx$, and expectation is linear: $\mathbb{E}[ag + bh] = a\,\mathbb{E}g + b\,\mathbb{E}h$.

This is the same integral with a different attitude. Instead of "integrate the shader against a window", think "evaluate the shader at a random point of the pixel and take the mean". Probability hands us tools that integration alone does not suggest: pushforward distributions, characteristic functions, and distances between distributions. Each of them does real work later.

### 2.2 Whitened coordinates

Write $X = x_0 + \sigma Z$ with $Z \sim \mathcal{N}(0, I_2)$, the standard Gaussian in two dimensions, with density

$$ \varphi(z) = \frac{1}{2\pi} e^{-|z|^2/2}. $$

Measuring screen offsets in units of $\sigma$ is called whitening, and from now on the footprint is the standard Gaussian in $z$. Two facts about it we use constantly: its coordinates $Z_1, Z_2$ are independent standard normals, and $\mathbb{E}[Z_j] = 0$, $\mathbb{E}[Z_j^2] = 1$, $\mathbb{E}[Z_j^4] = 3$.

### 2.3 Two exercises worth doing now

Convince yourself that a Gaussian footprint with $\sigma = 0.5$ pixels places about $86$ percent of its mass within one pixel of the centre ($|Z| \le 2$ has probability $1 - e^{-2} \approx 0.865$; check the two-dimensional formula $P(|Z| \le R) = 1 - e^{-R^2/2}$ by integrating in polar coordinates). Also compute $\mathbb{E}[Z_1^2 Z_2^2] = 1$ from independence. These are the kind of small facts the constants in Section 8 are made of.

## 3. Count maps: the coordinates a material reads

### 3.1 The definition

A checkerboard does not care where on the screen it is. It cares about two numbers: $u = s/L$ and $v = t/L$, how many tiles along and up. Its colour is a fixed function of them, $g(u, v) = 1$ if $\lfloor u \rfloor + \lfloor v \rfloor$ is even. Stripes read one number. A mask made of three sines reads three phases. Noise reads a lattice cell index and a position inside the cell.

**Definition.** A count map is a function $\Phi$ from the screen to $\mathbb{R}^r$ whose outputs are the numbers a material reads, so that the shader factors as $f(x) = g(\Phi(x))$ with $g$ fixed. The integer part of a count says how many periods or cells have gone by, the fractional part is the phase within the current one. We call $g$ the material and $\Phi$ the count map; $r$ is the number of counts.

The factorization is the point. The material $g$ is known when the shader is compiled; it never changes. The count map $\Phi$ carries the camera and the surface, and it changes every frame and every pixel. Everything about anti-aliasing that depends on the pattern's structure can be prepared once from $g$; everything that depends on the view goes through $\Phi$.

### 3.2 The pushforward and the pairing

The pixel average is $\mathbb{E}[g(\Phi(X))]$. Let $U = \Phi(X)$ be the random count. It has its own distribution, called the pushforward of the pixel's Gaussian through $\Phi$, written $\mu = \Phi_\# \mathcal{N}(x_0, \sigma^2 I_2)$, and defined by $\mu(A) = P(\Phi(X) \in A)$ for every set $A$ of counts. Then

$$ I(x_0) = \int g \, d\mu = \langle g, \Phi_\# \mu_{\text{pixel}} \rangle. $$

Read the right-hand side as a pairing between two objects that know nothing about each other: the material $g$ on one side and the count distribution $\mu$ on the other. This form appears in the work of Heitz and colleagues (2014) on filtering procedural textures; we take it as the starting point rather than the conclusion.

Why it helps, concretely:

- For an affine $\Phi$ the count distribution is Gaussian and its pairing with any periodic $g$ is an exact series of closed-form terms (Section 4). Exact is not the same as cheap; how many terms, and what each costs, is the subject of Section 5, and for materials beyond the ones we have compiled it is open.
- For a projective $\Phi$, a plane seen in perspective, the count distribution is not Gaussian, but its distance from a Gaussian is bounded by a single number that does not depend on $g$ (Section 8).
- The pairing separates two kinds of error. Approximating $g$ by a truncated series is an error in $g$; approximating $\Phi$ by something simpler is an error in $\mu$. Certificates for the two are different theorems, and both exist.

### 3.3 A picture in three regimes

Fix the checkerboard and move the camera. Close to the camera, a pixel covers a small fraction of a tile: the count distribution is a narrow Gaussian sitting inside one cell, and the pixel's colour is just the colour of that cell, or a mix of two cells' colours where the footprint straddles an edge. Far away, near the horizon, a pixel covers many tiles: the count distribution spreads over many periods, and the average is close to the pattern's overall mean, one half. In between, the pixel covers about one tile: the average depends delicately on where the footprint sits, and this is the transition band, where everything is hard and expensive. The three regimes are exactly the three branches of the count theorem in Section 5.

## 4. Affine count maps and the Gaussian character formula

### 4.1 Linear images of Gaussians

Suppose the count map is affine over the footprint: $\Phi(x_0 + \sigma Z) = m + BZ$, where $m \in \mathbb{R}^r$ is the count at the pixel centre and $B$ is an $r \times 2$ matrix of count gradients per $\sigma$. Then $U = m + BZ$ is a Gaussian vector with mean $m$ and covariance $BB^\top$. That a linear image of a Gaussian is Gaussian is standard; here is the two-line proof that also gives us our main tool.

**The characteristic function.** For a random vector $Y$, the function $\theta \mapsto \mathbb{E}[e^{i\theta \cdot Y}]$ is its characteristic function, and it determines the distribution. For the standard Gaussian in one dimension,

$$ \mathbb{E}[e^{i\theta Z_1}] = \int \frac{e^{i\theta z}e^{-z^2/2}}{\sqrt{2\pi}}\,dz = e^{-\theta^2/2}, $$

by completing the square: $i\theta z - z^2/2 = -(z - i\theta)^2/2 - \theta^2/2$, and the shifted Gaussian still integrates to one. Independence gives, in two dimensions,

$$ \mathbb{E}[e^{i\theta \cdot Z}] = e^{-|\theta|^2/2}. \tag{4.1} $$

Then $\mathbb{E}[e^{i\omega \cdot (m + BZ)}] = e^{i\omega \cdot m}\,\mathbb{E}[e^{i(B^\top\omega)\cdot Z}] = e^{i\omega\cdot m} e^{-|B^\top\omega|^2/2}$, which is the characteristic function of $\mathcal{N}(m, BB^\top)$.

We call $e^{i\theta \cdot z}$ a character: a pure complex wave with frequency vector $\theta$. Formula (4.1) says the pixel turns a character into a number, $e^{-|\theta|^2/2}$, and this is the engine of everything that follows.

### 4.2 Anti-aliasing in one formula

Let the material be periodic with period one in every count, so it has a Fourier series

$$ g(u) = \sum_{n \in \mathbb{Z}^r} c_n e^{2\pi i\, n \cdot u}. $$

Then, by linearity of expectation and (4.1),

$$ I = \sum_{n} c_n\, e^{2\pi i\, n \cdot m}\, e^{-2\pi^2 |B^\top n|^2}. \tag{4.2} $$

Every Fourier mode of the material survives the pixel with its phase evaluated at the centre and its amplitude multiplied by $e^{-2\pi^2|B^\top n|^2}$. The quantity $|B^\top n|$ is the standard deviation of the count $n \cdot U$ across the footprint: it says how many cycles of that mode fit in one $\sigma$. A mode with a tenth of a cycle per $\sigma$ keeps $e^{-0.2} \approx 0.82$ of its amplitude; a mode with one cycle per $\sigma$ keeps $e^{-19.7} \approx 3 \cdot 10^{-9}$. The pixel keeps the slow waves and removes the fast ones, exactly, with weights fixed by the Gaussian. There is no Nyquist rule to apply by hand; (4.2) is the correct average, and the fast modes are simply gone.

**The checkerboard.** Measure counts in half tiles, so that tile edges sit at the integers. The square wave $\mathrm{sq}(u) = (-1)^{\lfloor u \rfloor}$ has period two and the Fourier series

$$ \mathrm{sq}(u) = \frac{4}{\pi} \sum_{p \text{ odd} \ge 1} \frac{\sin(\pi p u)}{p}, $$

and the checkerboard is $g(u, v) = \tfrac12 + \tfrac12\,\mathrm{sq}(u)\,\mathrm{sq}(v)$. Each product $\sin(\pi p u)\sin(\pi q v)$ is a combination of two characters with frequencies $\pi(p b_u \pm q b_v)$, where $b_u, b_v$ are the rows of $B$, so

$$ I = \tfrac12 + \frac{8}{\pi^2} \sum_{p, q \text{ odd}} \frac{1}{pq} \cdot \tfrac12 \left[ \cos\phi_-\, e^{-|\theta_-|^2/2} - \cos\phi_+\, e^{-|\theta_+|^2/2} \right], $$

with $\theta_\pm = \pi(p b_u \pm q b_v)$ and $\phi_\pm = \pi(p m_u \pm q m_v)$. This is what our probe `paper/tools/exp/theory-probes/projective-correction.mjs` evaluates, and at a pixel in the transition band it agrees with a million-sample Monte Carlo to the Monte Carlo's own noise. It is worth pausing on: a checkerboard seen at an angle, averaged exactly over a Gaussian pixel, is a short sum of cosines times Gaussian weights.

### 4.3 The spectral branch and the cell branch

Formula (4.2) is one way to evaluate the pairing; call it the spectral branch. It is cheap when few modes survive, that is, far from the camera. Near the camera almost every mode survives, the series is long, and a different evaluation is cheap: the footprint covers a few cells, and

$$ I = \sum_{\text{cells } c} g_c \cdot P(U \in c), $$

where $g_c$ is the constant colour of cell $c$ and $P(U \in c)$ is the probability that a Gaussian vector lands in a rectangle, a bivariate normal probability, available in closed form through the error function for a half-plane and through standard routines for a rectangle. Call this the cell branch. Both branches compute the same number; the count theorem of the next section says how much each costs, so a compiler can choose per pixel.

## 5. How many terms: the count theorem

### 5.1 The retained set is an ellipse

In the spectral branch we keep the modes whose damping is not negligible. Write the damping as $e^{-n^\top Q n / 2}$ with $Q = 4\pi^2 BB^\top$, a symmetric positive matrix. The retained set at level $c$ is

$$ K_c = \{ n \in \mathbb{Z}^r : n^\top Q n \le c \}, $$

the integer points inside an ellipse. In two counts, the ellipse $\{x : x^\top Q x \le c\}$ has area $\pi c / \sqrt{\det Q}$ (stretch the unit disc by $Q^{-1/2}$ and scale by $\sqrt{c}$). Counting integer points in an ellipse is a classical problem: the answer is the area plus a boundary correction of the order of the perimeter.

**Theorem (spectral count) [audited].** Let $s = \sqrt{\det Q}$ and $\lambda_1$ the smaller eigenvalue of $Q$. Then

$$ |K_c| \le \frac{\pi c}{s} + \sqrt{2}\,\pi\sqrt{\frac{c}{\lambda_1}} + \frac{\pi}{2}. $$

The first term is the area; the second is a perimeter term (the ellipse's perimeter is at most that of the disc of radius $\sqrt{c/\lambda_1}$, its longest half-axis, and each lattice point sits in a unit square that fits inside a $1/\sqrt{2}$ neighbourhood of the ellipse, which is where the $\sqrt{2}$ comes from); the third handles corners. This is the checkerboard's cost at the horizon: the count spread $s$ is large there, so the ellipse is small and holds a handful of modes.

### 5.2 The cell count

Near the camera, integrate over the footprint disc $|Z| \le R$ (the reach) and budget the Gaussian mass outside it, $e^{-R^2/2}$, as an error. The disc maps under $u = m + BZ$ to an ellipse in count space of area $\pi R^2 \sqrt{\det BB^\top} = R^2 s / (4\pi)$, and the number of unit cells it touches is at most that area plus a perimeter term:

$$ |\text{cells}| \le \frac{R^2 s}{4\pi} + \sqrt{2}\,R\sqrt{\lambda_2} + 2\pi, $$

with $\lambda_2$ the larger eigenvalue of $Q$. [audited]

### 5.3 The three-way minimum and the level

A compiler evaluates whichever branch is cheaper, and a third, mixed branch handles the case where $Q$ is very elongated (a pattern seen almost edge-on, where the retained modes line up along lattice lines). The three-way minimum is the cost of an exact pixel of a periodic material [audited, conditional on a certified cell integrator for the cell branch].

Two things about the level $c$ deserve emphasis. First, it is set by the error tolerance $\varepsilon$ through a certificate (Section 6), and it grows only like $2\ln(1/\varepsilon)$: eight-bit display precision, $\varepsilon = 1/512$, needs a level near $11$ plus a term logarithmic in the ellipse's aspect ratio, and asking for ten times more precision adds about $4.6$ to that. Precision is not what makes anti-aliasing expensive. Second, the theorem bounds the number of terms, not the cost of each, and it says nothing about materials whose coefficients or interactions are not a fixed short list. The transition band, where the pixel covers about one tile, is expensive because both branches need many terms there and because each term of the cell branch is a bivariate normal probability. [measured] On our kernel a checkerboard costs about $0.14$ expensive calls per pixel near the camera, $10$ in the transition band, up to $90$ at tile corners, and $6.6$ at the horizon. Those are the bottlenecks of one kernel on one material; the cost of broader materials, coefficient formation and interactions included, is research and not settled engineering.

## 6. Certifying the truncation: the wrapped density lemma

### 6.1 The wrapped count

For a periodic material only $u \bmod 1$ matters. The wrapped count $\tilde U = U \bmod 1$ lives on the torus $\mathbb{T}^r = [0, 1)^r$, and since $U$ is Gaussian its density on the torus is the sum of the Gaussian's copies shifted by every integer vector. Poisson summation turns that sum into a Fourier series on the torus whose coefficients are the Gaussian's characteristic function at integer frequencies:

$$ \rho(\theta) = \sum_{n \in \mathbb{Z}^r} e^{2\pi i\, n \cdot (\theta - m)}\, e^{-n^\top Q n / 2}, \qquad \theta \in \mathbb{T}^r. $$

Truncating the material's series to the retained set $K$ is the same as replacing $\rho$ by $\rho_K$, the sum over $n \in K$, because $\int g\,\rho_K = \sum_{n \in K} (\ldots)$ term by term. So the truncation error is $\int g\,(\rho - \rho_K)$, and we can bound it for every bounded material at once by bounding the density's error.

### 6.2 The lemma and its proof

**Lemma (wrapped density) [proved].** For any measurable $g$ with $0 \le g \le 1$ on the torus and any retained set $K$ containing $n = 0$,

$$ \left| \int g\,\rho - \int g\,\rho_K \right| \le \frac12 \sqrt{\sum_{n \notin K} e^{-n^\top Q n}}. $$

Proof. Since $0 \in K$, both $\rho$ and $\rho_K$ integrate to one over the torus, so $\int (\rho - \rho_K) = 0$ and we may replace $g$ by $g - \tfrac12$ without changing the left side. Now $|g - \tfrac12| \le \tfrac12$, so $\|g - \tfrac12\|_2 \le \tfrac12$ (the $L^2$ norm on the unit torus). By the Cauchy-Schwarz inequality and Parseval's identity,

$$ \left| \int (g - \tfrac12)(\rho - \rho_K) \right| \le \|g - \tfrac12\|_2\, \|\rho - \rho_K\|_2 = \|g - \tfrac12\|_2 \sqrt{\sum_{n \notin K} \left| e^{-n^\top Q n/2} \right|^2}, $$

and the claim follows. $\square$

That is the whole proof, and it is worth admiring what it does not need: it never looks at the material's Fourier coefficients, so the same retained set certifies a checkerboard, a stripe, a thresholded sine, or any measurable pattern with values in $[0, 1]$. It bounds the pixel's error by the tail of a Gaussian sum over the lattice, which is a geometric quantity.

### 6.3 From the lemma to the level

The omitted sum is at most an integral: $\sum_{n \notin K_c} e^{-n^\top Q n} \approx \int_{x^\top Q x > c} e^{-x^\top Q x}\,dx = (\pi/s)\,e^{-c}$ in two counts, up to boundary terms. Requiring the lemma's bound to be at most $\varepsilon$ gives $(\pi/s)e^{-c} \le 4\varepsilon^2$, that is

$$ c \ge 2 \ln\frac{1}{2\varepsilon} + \ln\frac{\pi}{s}. $$

The audited form of the level carries the boundary terms and a free parameter that trades a larger level for a cleaner tail, but this is the shape: twice the log of the precision, plus a log of the geometry. That is the sentence "precision is not the cost lever" in a formula.

## 7. The algebra: why composed materials stay tractable

### 7.1 Characters multiply

The product of two characters at the same point is a character: $e^{i\theta \cdot z} e^{i\theta' \cdot z} = e^{i(\theta + \theta') \cdot z}$. So if a material is a product of two periodic patterns, a checkerboard times stripes, its Fourier series is the convolution of theirs and is still a sum of characters, now over a lattice with more counts. Sums are trivially closed. Composing with an affine map sends characters to characters. And the pixel itself, by (4.1), sends a character to a character times a number.

There is a second-order version. A quadratic phase, or chirp, $e^{i(\theta \cdot z + z^\top H z/2)}$ with $H$ symmetric, also has a closed Gaussian expectation, $\det(I - iH)^{-1/2} \exp(-\theta^\top (I - iH)^{-1}\theta/2)$; products of chirps are chirps; and Gaussian filtering of a chirp times a Gaussian is again of that form. We call the set of Gaussian-times-chirp functions the algebra of complex Gaussians. It is closed under products and under the pixel's filtering, which is why materials whose counts are quadratic in the screen position, the second-order jets of a curved surface or a perspective view, are handled exactly at the level of characters. [proved, elementary] One cost result exists on this side, for one family: for a finite sum of Gabor atoms of a common envelope, whose intensity is the material, our collaborator proved that a single feature vector supports every polynomial footprint correction of Section 8 with a tail certificate, at an arithmetic cost linear in the number of atoms times a feature count that depends on the correction order and the tolerance, with the atoms' spread entering the certificate; it is a conditional cost theorem for that intensity family, not for thresholded intensities, unequal widths or lighting models. [proved, our collaborator]

### 7.2 What does not close

Thresholds do not multiply like characters. The mask $1\{h \ge 0\}$ of a smooth field $h$ is a character sum only in special cases (when all the phases of $h$ are affine in one common carrier, the "shared-carrier family", for which we have closed forms on both sides and a certificate). For a general mask the pixel average is a coverage integral with no finite closed form, and the honest tool is a certificate that bounds the error of a simpler model: Section 10.

Nor does composition with a nonlinear function close: $g(u)^2$ is fine (a product), but $\sqrt{g(u)}$ or a lighting model applied after the pattern needs either its own series or a certificate. The count-map view does not make these free; it makes clear where the boundary is.

### 7.3 A remark on Fourier analysis

Readers who know signal processing will recognize (4.2) as "multiply the spectrum by the window's transfer function". True, and the count-map view is not a replacement for that fact but a way of organizing it. The Fourier series lives on the material $g$, which is fixed; the geometry lives in the count distribution $\mu$, which is a Gaussian, or almost one; and the pairing is where they meet. Three things fall out that the usual picture obscures. The retained set is an ellipse in the lattice of the material's own counts, so its size is a geometric count, not a bandwidth. The truncation certificate is a statement about a density on a torus, valid for every material. And when the geometry is not affine, the right question is how far $\mu$ is from Gaussian, which is a question about distributions, not spectra, and it has a clean answer (Section 8).

## 8. Perspective: the projective count map and the density flow

### 8.1 The projective count

Look at a plane through a pinhole camera. Screen positions map to plane coordinates by a homography, and each count is a ratio of two affine functions of the screen position. In whitened coordinates around a pixel,

$$ u = \frac{N_0 + n \cdot Z}{D_0 + d \cdot Z} = m + \frac{b \cdot Z}{1 + k \cdot Z}, \qquad m = \frac{N_0}{D_0},\quad k = \frac{d}{D_0},\quad b = \frac{n}{D_0} - m\,k. $$

Here $D_0$ is the depth at the pixel centre and $d$ its gradient per $\sigma$, so $k$ is the relative change of depth across one $\sigma$: the perspective rate. On our benchmark plane it is $|k| = 0.5/(y + 1)$ with $y$ the row counted from the horizon; it is $0.05$ at row $9$ and $0.012$ at row $40$. The two planar coordinates $s, t$ and every affine combination of them share this denominator, so a material whose counts are affine in $(s, t)$ has one $k$ for all of them. Counts that are nonlinear functions of $(s, t)$ are not separate counts in this sense; they belong inside the material $F$, which is evaluated unchanged on the shared planar state. That shared state is what makes the next results hold for every material at once. It is a sufficient structure for those uniform results, not a prohibition: a count model approximated on its own can still be certified by the source-specific band certificates of Section 10, when its boundary mass is controlled.

The affine model drops the denominator's variation: $u \approx m + b \cdot Z$. This is what the classic elliptical weighted average (EWA, Greene and Heckbert, 1986, and Zwicker and colleagues in the 2000s) does, and it is what every texture filter in a graphics card does: approximate the footprint by the Jacobian at the centre. The question we needed answered was: how wrong is that, in a form that does not depend on the material, and can it be corrected cheaply with a certificate?

### 8.2 Total variation distance

**Definition.** For two probability distributions $P, Q$ with densities $p, q$, the total variation distance is

$$ \mathrm{TV}(P, Q) = \sup_A |P(A) - Q(A)| = \frac12 \int |p - q|. $$

Its use for us is one line. If $F$ is any function with values in an interval of width $W$, then

$$ |\mathbb{E}_P F - \mathbb{E}_Q F| \le W \cdot \mathrm{TV}(P, Q). $$

Proof: subtract the midpoint of the interval from $F$, which changes neither side; then $|F - \text{mid}| \le W/2$ and $|\int (F - \text{mid})(p - q)| \le (W/2)\int|p - q| = W\cdot\mathrm{TV}$. $\square$

So if we can bound the total variation between the true distribution of the planar state and the affine one, we have bounded the mean error of every bounded material evaluated on that state at once, thresholds, products, noise, anything, with a constant that does not care how fine the pattern is. Note what is being compared: two distributions of the whitened screen point, the Gaussian and the Gaussian pushed through the map $z \mapsto z/(1 + k\cdot z)$ that turns the affine count into the projective one.

### 8.3 The flow and its generator

The map $P(z) = z/(1 + k \cdot z)$ is one member of a family, $P_s(z) = z/(1 + s\,k \cdot z)$, and the family is a group: $P_s \circ P_t = P_{s + t}$ (check it; two lines). So the Gaussian pushed through $P_1$ is the state at time one of a flow that starts at the Gaussian. A density $p_s$ carried by a flow with velocity field $V$ obeys the continuity equation $\partial_s p_s = -\mathrm{div}(p_s V)$. Here $V(z) = \frac{d}{ds}P_s(z)|_{s=0} = -z\,(k \cdot z)$, so

$$ \partial_s p = \mathcal{L} p := \mathrm{div}\big[z\,(k \cdot z)\,p\big]. $$

Apply $\mathcal{L}$ to the standard Gaussian, using $\nabla\varphi = -z\varphi$ and $\mathrm{div}\, z = 2$ in two dimensions:

$$ \mathcal{L}\varphi = (k \cdot z)\,(3 - |z|^2)\,\varphi. $$

This is the first-order change of the footprint's density under perspective: a signed reweighting by the polynomial $(k \cdot z)(3 - |z|^2)$. It is positive on the side where $k \cdot z > 0$ within $\sqrt{3}$ of the centre, negative beyond, and the reverse on the opposite side: the map $z \mapsto z/(1 + k \cdot z)$ pulls that side of the footprint toward the centre and pushes the other side out, so mass gathers near the centre on one side and thins on the other, which is what a perspective view does to a disc.

### 8.4 The three theorems

**Theorem (projective density bound) [proved, our collaborator].** For the flow above and the standard Gaussian in two dimensions,

$$ \mathrm{TV}(P_{1\#}\varphi, \varphi) \le \frac12\,\mathbb{E}\big|(k \cdot Z)(3 - |Z|^2)\big| = C\,|k|, \qquad C = \frac{6\sqrt{3}}{\pi}e^{-3/2} \approx 0.7381. $$

The idea: the flow preserves $L^1$ norms (it is a change of variables), so the semigroup identity $P_{1\#}\varphi - \varphi = \int_0^1 P_{s\#}\mathcal{L}\varphi\,ds$ gives $\|P_{1\#}\varphi - \varphi\|_1 \le \|\mathcal{L}\varphi\|_1$, and the total variation is half of that. The constant is half the expectation of $|Z_1(3 - |Z|^2)|$ over the Gaussian, which you can compute by hand in polar coordinates or numerically (Exercise 4). The technical content of the proof is that the map has a pole where $1 + k \cdot z = 0$, far out in the Gaussian's tail, and the generator argument has to be justified across it; that is done with cutoffs and is the part that took a day and two reviews. [measured] Our probe `paper/tools/exp/theory-probes/projective-tv.mjs` integrates the exact pushforward density and finds the bound tight to three digits at small $|k|$.

**Theorem (signed first correction) [proved, our collaborator].** For any material $F$ with values in an interval of width $W$ on the shared state,

$$ \left| \mathbb{E}[F(\text{projective})] - \mathbb{E}\big[F(m + BZ)\,(1 + (k \cdot Z)(3 - |Z|^2))\big] \right| \le K_2\, W\, |k|^2, \qquad K_2 \approx 1.892. $$

In words: weight the affine-Gaussian average by one plus the polynomial, and the error drops from first to second order in the perspective rate. The weight is signed, so it is not a footprint, but it is an integral against a Gaussian times a polynomial, and for characters and steps those are closed forms: a character's Gaussian response $e^{-|\theta|^2/2}$ becomes $e^{-|\theta|^2/2}[1 + i(k \cdot \theta)(|\theta|^2 - 1)]$ (Exercise 6), and a half-plane's probability $\Phi(c)$ becomes $\Phi(c) + (k \cdot a)c^2\varphi_1(c)$, where $a$ is the unit normal, $c$ the signed distance in $\sigma$ units and $\varphi_1$ the one-dimensional Gaussian density. There is a finite hierarchy of higher corrections with computable constants ($K_3 \approx 7.04$), each a polynomial reweighting.

**Theorem (positive quadratic model) [proved, two independent reviews].** For the quadratic map $Q(z) = z(1 - k \cdot z)$, which is the second-order jet that our kernel's spectral branch already uses,

$$ \mathrm{TV}(P_{1\#}\varphi, Q_{\#}\varphi) \le \min(1, 5|k|^2). $$

The constant $5$ is conservative; [measured] the exact total variation is about $1.09|k|^2$ at small rates.

### 8.5 What the theorems buy

Put numbers on the benchmark camera, with the checkerboard's radiance range $W = 0.76$ and an eight-bit budget of $1/256$. The affine model is certified within budget only far from the horizon (row $71$ and below, since $0.76 \cdot 0.7382 \cdot 0.5/(y + 1) \le 1/256$ needs $y \ge 71$; in a bound the constant is rounded up, and $6\sqrt{3}e^{-3/2}/\pi$ is $0.73812\ldots$). The quadratic model is certified from row $15$ down. The corrected affine model is certified from row $9$ down. Rows $9$ to $15$ from the horizon are the heart of the transition band. These rows certify the geometry-model bias alone, spending the whole eight-bit budget on it; a display-certified oracle must also allocate the series truncation, numerical error, visibility and any temporal term, so its admitted rows lie lower. Before these theorems, our kernel used the quadratic model there because it worked in tests; now that model has a material-independent certificate for its bias. The corrected affine model has one too, but it is a candidate for a cheaper oracle, not a proved one: nobody has yet shown its whole evaluation, tail selection included, to cost less. [measured] On the checkerboard the corrected model's actual error is $0.00015$ against its bound $0.00082$ at row $20$, and the correction removes $97$ percent of the affine model's error there (`projective-correction.mjs`). The price in retained modes looks small: in a finite enumeration of the checkerboard's series, the term-by-term tail leaves the retained set unchanged to within two percent, and the conservative summed envelope grows it by a factor between $1.07$ and $1.5$ (`corrected-tail-count.mjs`). Those percentages are diagnostics from an enumeration; the certified statement is a relation between count upper bounds (the note's section 16), not a ratio of actual counts.

Two cautions that our collaborator insisted on, and rightly. These bounds cover the geometry-model bias alone; the full image error also carries the truncation of the series, numerical error, visibility (a footprint that reaches the horizon has mass off the plane), and any temporal term, and a display-certified oracle must allocate all of them. And the shared state is essential: a lighting term that depends on the screen position through a different map is not covered by appending it.

## 9. Time: TAA, its transfer function, and the residual architecture

### 9.1 TAA as a filter

Temporal anti-aliasing renders one sample per frame at the pixel centre plus a jitter $j_t$, and keeps a history $H_t = (1 - \alpha)\,\mathcal{B}_t H_{t-1} + \alpha\, f(x_0 + j_t)$, where $\mathcal{B}_t$ reprojects the previous history to the current camera and $\alpha \in (0, 1]$ is the blend weight; engines use $\alpha$ near $0.1$. For a still camera $\mathcal{B}_t$ is the identity and the history is an exponential average of jittered samples.

Apply it to a character $e^{i\omega \cdot x}$. The sample at frame $t$ is $e^{i\omega\cdot x_0}e^{i\omega \cdot j_t}$, and the history is the character times

$$ T_t(\omega) = \alpha \sum_{r \ge 0} (1 - \alpha)^r e^{i\omega \cdot j_{t - r}}. $$

Its mean over the jitter distribution is the jitter's characteristic function: for a Gaussian jitter of standard deviation $\sigma_j$, $\mathbb{E}\,T = e^{-\sigma_j^2|\omega|^2/2}$. So in expectation TAA is a Gaussian prefilter, and choosing $\sigma_j = \sigma$ makes its expected image the correct one. Its variance is the flicker. For independent jitters,

$$ \mathrm{Var}\,T_t(\omega) = \alpha^2 \sum_r (1 - \alpha)^{2r}\,\big(1 - |\mathbb{E}e^{i\omega\cdot j}|^2\big) = \frac{\alpha}{2 - \alpha}\big(1 - e^{-\sigma_j^2|\omega|^2}\big), $$

using $\sum_r (1 - \alpha)^{2r} = 1/(1 - (1 - \alpha)^2) = 1/(\alpha(2 - \alpha))$. Fast modes, the ones a pixel should remove, flicker with variance $\alpha/(2 - \alpha)$ times their power: $0.053$ at $\alpha = 0.1$, $0.33$ at $\alpha = 0.5$. The only way TAA reduces flicker is a small $\alpha$, and a small $\alpha$ means a long memory: the mean age of a sample in the history is $(1 - \alpha)/\alpha$ frames, nine at $\alpha = 0.1$, and a long memory ghosts when the reprojection is wrong and blurs through repeated resampling. That is TAA's whole trade, in three formulas.

**The yardstick [proved, elementary].** Noise of variance $V$ fed through the exponential history comes out with variance $V\alpha/(2 - \alpha)$. To run at $\alpha = 0.5$ with the flicker of $\alpha = 0.1$, the input variance must fall by the factor $\frac{0.5/1.5}{0.1/1.9} = 19/3 \approx 6.33$.

### 9.2 The residual architecture

Here is how the exact pixel and TAA combine, and it is an old idea in statistics called a control variate. Split the shader as $f = a + b$, where $a$ is the part the compiler can integrate exactly under the current footprint (the predictor) and $b = f - a$ is the residual. Then

$$ \mathbb{E}f = \mathbb{E}a + \mathbb{E}(f - a), $$

and the renderer outputs $R_t a$, the predictor's exact pixel average from Section 4, plus a TAA history of samples of $b$ taken at the jitter. Nothing of $a$ ever enters the history. Whatever the history does, reprojection errors, clamping, a short or long memory, it can only do it to $b$.

**Theorem (pathwise envelope) [proved, our collaborator].** Suppose every residual sample in the history satisfies $|b| \le \varepsilon$, the current residual satisfies $|b| \le \varepsilon$ over the footprint, and the predictor's average is computed within $\varepsilon_A$. Then for any history weights $w_s$ summing to one, even weights chosen from the data, the output error is at most $\varepsilon_A + (1 + \sum_s |w_s|)\,\varepsilon$, which is $\varepsilon_A + 2\varepsilon$ for nonnegative weights.

Proof: the output is $A_t + \sum_s w_s y_s$ with $|A_t - R_t a| \le \varepsilon_A$ and $|y_s| \le \varepsilon$, the truth is $R_t a + R_t b$ with $|R_t b| \le \varepsilon$, and the triangle inequality does the rest. $\square$

This needs no independence, no stationarity and no correct reprojection. Its strength is also its limit: a structured pattern whose predictor is evaluated with exact source semantics and whose mean oracle is exact never ghosts or flickers, an approximate oracle adds its bias $\varepsilon_A$ every frame, and the guarantee is only as good as the residual's envelope, and a residual that carries the aliasing (a threshold whose model is slightly off, a geometric edge) has envelope one. Section 10 is the certificate for that case.

The variance side is the yardstick: if the predictor explains most of the per-sample variance, the residual's variance $\rho V$ is a small fraction $\rho$ of the shader's, and the history can run at a short memory. [measured] In our demo, a checkerboard multiplied by a noise detail layer of amplitude $0.3$ that the compiler does not handle has $\rho = 0.035$; TAA at $\alpha = 0.1$ flickers with standard deviation $0.061$ and reads $0.065$ to $0.082$ RMS error against a converged reference, at rest and in motion; the residual arm at $\alpha = 0.5$ flickers at $0.025$ and reads $0.019$ to $0.025$, with a mean sample age of one frame instead of nine. At detail amplitude $0.6$, $\rho = 0.126$, close to the yardstick's $3/19$, and the flicker margin at $\alpha = 0.5$ shrinks to $0.82$ of TAA's, as the yardstick predicts. These are diagnostic numbers at $240 \times 160$ against a plain TAA, with the measurement contract reviewed line by line by our collaborator, not an engine result.

### 9.3 Two predictors, not one

A subtle point that changed how we think about the compiler. The predictor $a$ subtracted at the samples is a selected component of the original source, evaluated with the source's own semantics: cheap pointwise, and correlated with $f$ as well as that component allows, which need not be perfectly. General control variates need not be a piece of the source at all; ours are, because that is what makes the exact mean available. The model used to integrate its mean can be a different, cheaper object, an affine or corrected-affine oracle, whose error is a bias $\varepsilon_A$ certified by Section 8. Writing $M = R\tilde a + e_{\text{num}}$ for the oracle, the total error is exactly $e_{\text{num}} - R(a - \tilde a) + H[b] - Rb$: the oracle's defect controls the bias, the source predictor's correlation controls the variance, and they need not be the same function. The research question in its sharpest form is then: which source components admit a cheap approximate mean with a useful certificate while staying cheap and exact at sample points?

## 10. Certificates for hard edges: the band mass

### 10.1 Disagreement lives in a band

Let $f = 1\{g \ge 0\}$ be a threshold of a count, and let $\tilde g$ be a model with $|g - \tilde g| \le \delta$ on the footprint. Where $|\tilde g| > \delta$ the two have the same sign, so

$$ |1\{g \ge 0\} - 1\{\tilde g \ge 0\}| \le 1\{|\tilde g| \le \delta\}. $$

The mean error of the model is therefore at most $p = P(|\tilde g| \le \delta)$, the pixel's mass in a band around the model's threshold, and the residual's mean square is at most $p$ as well. This is a count map again: the band mass of the model count. For an affine model count $\tilde g = m + s\,Z_1$ it is exact,

$$ p = \Phi\!\left(\frac{\delta - m}{s}\right) - \Phi\!\left(\frac{-\delta - m}{s}\right), $$

with $\Phi$ the standard normal distribution function. For a quadratic model count the mass depends on the type of the critical point, and there is no universal law: [proved] in two whitened dimensions a band around $Z_1^2$ has mass of order $\sqrt{\delta}$, around $Z_1 Z_2$ of order $\delta\log(1/\delta)$, around $Z_1^2 + Z_2^2$ of order $\delta$, and around the zero count of order one. Explicit constant-size bounds exist for each case. A periodic threshold has a band around every crossing, and the wrapped version has the form $2\delta/L$ plus a concentration term computed from the count's characteristic function, again the Gaussian at the lattice frequencies.

### 10.2 Graphs of thresholds

A material is usually a Boolean or arithmetic combination of several thresholds. [proved, our collaborator] If the combined material takes values in an interval of width $W$ and each threshold $i$ has band mass $p_i$, then the mean error of the combined model is at most $W \min(1, \sum_i p_i)$: one band per primitive threshold, no enumeration of the $2^m$ branch combinations, no factor for the depth of the graph. One tempting shortcut is unsafe: testing whether a bit is pivotal only at the model. An AND gate whose model bits are $(0, 0)$ while the true bits are $(1, 1)$ has no individual pivot at the model and full error.

The organizing principle these certificates suggest is worth stating on its own. Represent an unresolved material error by two things, its amplitude and the footprint mass on which it can occur. Smooth phase errors, threshold disagreements and visibility edges then get different certificates, and a compiler can emit each from the same whitened jets it already computes for the mean.

## 11. Materials from hashes: procedural noise

Value noise assigns a pseudo-random value to every point of an integer lattice by a hash of its coordinates and interpolates smoothly between lattice points. It is everywhere in production materials (grunge, roughness, detail layers), it is not periodic in any useful sense, and it aliases at the horizon like anything else.

The count-map view still applies: the counts are the lattice cell index and the position within the cell. For the specific structured pairing we studied, a separable interpolant on a hash with period $P$ under the Gaussian footprint, the noise's transform is the interpolant's transform times a lattice sum of the hash values, that sum is a discrete Fourier transform of size $P$, and [proved] the pixel's filtered value is a contraction of the hash's spectrum against the Gaussian weights, computable in $O(P\log P)$ time per pixel with $O(P)$ storage. That is a statement about this hash-and-footprint contract, not about periodic noise in general. For products of noises the story is subtler: [proved] for hashes that are affine over the binary field, the carry pairs a compiler must track fall into at most $b^2$ classes for a $b$-bit hash, with the tables still holding the material and its polynomial-response indices, and with explicit per-pixel error bounds; that is a bound on classes, not on total state. And there is a counterexample against reading class counts as quality: a Gray-code hash has few classes and zero immediate-neighbour ensemble covariance, which shows that a small class count does not force the covariance structure one wants, and says nothing about whether a fixed noise realization looks good or bad.

Our kernel does not implement any of this yet; in the demo, noise is the part the residual architecture hands to TAA. The theory says what a compiler could do.

## 11b. Materials built by subdivision, and the first complete cost theorem

Added after the notes were first written, because it changes what the theory can say about cost. Many procedural materials are built by subdividing the plane at a fixed ratio $b$ and deciding, level by level, what kind of cell a point is in: hierarchical checkerboards, tiled patterns, octave stacks with a rule per level. Read in count coordinates, such a material looks at the digits of the count in base $b$, one digit per level, and updates a state drawn from a finite set of cell types by a fixed rule that depends only on the current type and the digit, until the source's depth $m$ is reached and a bounded payoff is read off. This is admitted by its encoding and its rules, not by the word recursive: an arbitrary quadtree texture or a rule that changes with depth is not in the class unless its state stays bounded uniformly in depth.

For such a source the average of the payoff over all digits beyond the ones the footprint resolves is exact and cheap [proved, our collaborator]: if $T_d$ is the transition matrix for digit $d$ and $A$ their average, the uniform mean over $m$ digits is $\pi A^m g$, at a cost linear in the depth times the number of states, despite the $b^m$ cells those digits address, and keeping the first $k$ digits gives $\pi T_{b_1} \cdots T_{b_k} A^{m-k} g$. Moments against powers of position close under an equally cheap recurrence, so a polynomial can be integrated against the source exactly.

The footprint is a Gaussian, not a uniform average, and the gap between the two is where the cost theorem lives [proved, our collaborator, in one dimension]. For a budget $\varepsilon$, take the reach $R = \sqrt{2\log(4/\varepsilon)}$, expand the Gaussian on each prefix cell no wider than $\sigma$ that meets the reach as a truncated exponential of a quadratic, and integrate the polynomial against the exact source. The truncation order needed is $N \ge \max(1, 2eM^*, \log_2(8/\varepsilon))$ with $M^* = R/2 + 3/8$, so the degree grows only with the logarithm of the inverse budget; the number of cells is at most $\max(2bR, R^2/\pi) + 2$; and the sum over cells of the expansion's coefficient sizes is bounded by an absolute constant below four, so no factor grows with the reach or the degree. Every cost is by component, the source's preparation, the subdivision table, the cells, and a separate precision contract has no exponential amplification in depth. Its scope is one dimension and a supplied finite-state source; the two-dimensional cell count under a footprint that is not aligned with the material's own axes, and shading factors that are not polynomials, are the open extensions. The prior foundations are classical, refinement equations and the moments of refinable functions (Cavaretta, Dahmen and Micchelli; Daubechies and Lagarias), automatic sequences and their digit frequencies (Cobham; Allouche and Shallit), finite-automaton images and their integration transducers (Kari 2006, sections 7.2, 7.4 and 7.8), and the Hankel-rank characterization of the minimal linear state of a weighted automaton (Balle and Mohri, section 3.2); what is ours, as a candidate contribution whose novelty we have not established, is the Gaussian error and cost accounting under the actual pixel. For a footprint rotated against the material's axes our collaborator has an amplitude bound (the coefficient sum stays below an absolute constant, 24 at unit cell scale, on adaptive rectangles without rotating the source); the anisotropic cell count itself is still open.

## 11c. Composing materials: why products are hard, and the certificate that tames two factors

Real materials are graphs: a tile pattern times a dirt mask, plus a stripe, lit by a smooth factor. Everything so far handled one periodic material at a time. Products are where the count-map picture meets its first real obstacle, and it is worth seeing the obstacle exactly before seeing the theorem.

**The obstacle.** Filtering is linear, so for a single material the pixel only needs the frequencies inside its ellipse (Section 5). One might hope that to filter a product $AB$ it suffices to keep each factor's frequencies inside a slightly larger set. It does not. Take, on one phase variable, $A(\theta) = B(\theta) = (1 + \cos N\theta)/2$ with $N$ enormous. Each factor, restricted to any fixed band around zero, is the constant $1/2$, and the product of the restrictions has mean $1/4$. But $\cos^2 N\theta$ has mean $1/2$, so the true product has mean $3/8$. The two high frequencies $+N$ and $-N$ combine into zero: a *beat*. Multiplication moves energy from arbitrarily high frequencies down into the pixel's ellipse, and no truncation of the factors can be exact. (Our collaborator's example; it settled a claim of mine that was wrong.)

**Two mechanisms.** Write $A(x) = \sum_m a_m e^{2\pi i m\cdot x}$ with $m$ in the dual lattice $\Lambda_1^*$ and $B$ likewise on $\Lambda_2^*$. The product's coefficient at a frequency $k$ is $\sum_{m+n=k} a_m b_n$, a sum over *pairs*. If both factors live on the same lattice, every pair $(m, k-m)$ is coherent, and the mean of a mask times itself is the whole energy of the mask, which is why the example above fails. The summary that keeps every pairing is the phase domain itself: for piecewise-constant materials the product is pointwise on the torus, and its coefficients are the polygon integrals of Section 4 over the cells of the *common refinement* of the two partitions. That is exact. Its size is the number of refined cells, which is the two cell counts plus the number of boundary crossings, and the crossings can be the product of the edge counts (p vertical and q horizontal stripes have pq cells). If instead the two dual lattices meet only at zero, every retained frequency $k$ has at most one decomposition $k = m + n$ (subtract two decompositions), so there are no coherent sums; the product's coefficient at $k$ is a single product $a_m b_n$, and the response is a list of beats. For a lattice and its rotation by $R$ the beats of a fixed "order difference" form the moiré lattice $(I - R)\Lambda^*$ shifted: the classical theory of moiré, in count-map form. But warning: for two rotated copies, beats of every order difference can land arbitrarily close to zero (Pell approximants do it for the 45-degree rotation), so no geometric rule discards them. Only the decay of the coefficients can.

**The decay law.** How fast do the coefficients of a mask decay? Not fast pointwise: the indicator of a polygon has coefficients of size $1/|m|$ along its edge normals. But their *energy* decays cleanly. Here is the whole argument, and it is one of the nicest in these notes.

*Lemma (heat content).* Let $f$ be a function on the unit torus with $0 \le f \le 1$ and total variation $V = \int |\nabla f|$ (for an indicator, the perimeter of its set per cell). Let $K_s$ be the Gaussian of standard deviation $s$. Then
$$\sum_m |a_m|^2 \bigl(1 - e^{-2\pi^2 s^2 |m|^2}\bigr) \;=\; \langle f, f - K_s * f\rangle \;\le\; \frac{s V}{\sqrt{2\pi}}.$$
*Proof.* The left equality is Parseval. For the inequality, write $K_s * f(x) = \mathbb{E} f(x + Y)$ with $Y$ Gaussian of standard deviation $s$; then $\langle f, f - K_s f\rangle = \tfrac12 \mathbb{E}\|f(\cdot + Y) - f\|_2^2$ (expand the square and use the symmetry of $Y$). Since $0 \le f \le 1$, the square of a difference is at most its absolute value, so this is at most $\tfrac12 \mathbb{E}\|f(\cdot + Y) - f\|_1$. A function of bounded variation moves by at most its variation times the displacement: $\|f(\cdot + y) - f\|_1 \le |y| V$, and more precisely the variation in the direction of $y$. Averaging, $\mathbb{E}|Y\cdot\nu| = s\sqrt{2/\pi}$ for any unit $\nu$, which gives $\tfrac12 \cdot s\sqrt{2/\pi}\, V = sV/\sqrt{2\pi}$. $\square$ (This is Ledoux's semigroup inequality from 1994; the short proof is our collaborator's.)

*Theorem (tail energy).* For such $f$ and any $M > 0$,
$$T(M) := \sum_{|m| > M} |a_m|^2 \;\le\; c^* \frac{V}{M}, \qquad c^* = \min_{\beta > 0} \frac{\sqrt{\beta}}{2\pi^{3/2}(1 - e^{-\beta})} < 0.1408.$$
*Proof.* The indicator of $\{|m| > M\}$ is at most $(1 - e^{-\beta |m|^2/M^2})/(1 - e^{-\beta})$; apply the lemma with $2\pi^2 s^2 = \beta/M^2$. $\square$ The minimum sits where $e^\beta = 1 + 2\beta$. Numerically the tail of a polygon behaves like $V/(2\pi^2 M)$, about $0.0507\,V/M$, which is $2.777$ times smaller than the certified constant; the gap is the price of using only the lemma, and a point mass at radius $M$ shows no argument from the lemma alone can close it.

**The certificate.** Now the product. Filtering by a Gaussian footprint with covariance $C$ multiplies the coefficient at frequency $k$ by $e^{-k^\top \Sigma k/2}$ with $\Sigma = 4\pi^2 C$. Consider the matrix $G(m,n) = e^{-(m+n)^\top \Sigma (m+n)/2}$ indexed by the two dual lattices. Its row sums are at most $\Theta_2(\Sigma) = \sum_{l \in \Lambda_2^*} e^{-l^\top \Sigma l/2}$, the theta function of the second lattice at the footprint (by Poisson summation the sum is largest with no shift), and its column sums at most $\Theta_1(\Sigma)$. Schur's test then says the matrix has operator norm at most $K_\Sigma = \sqrt{\Theta_1 \Theta_2}$, so the *absolute* pairing $\sum |a_m||b_n| G(m,n)$ is at most $K_\Sigma \|a\|_2 \|b\|_2 \le K_\Sigma$: the filtered product converges absolutely even when the sum of the two lattices is dense in the plane. Note what $\Theta$ is: in the far field it is $1$; in the near field it is about the cell area over the footprint's area $2\pi\sqrt{\det C}$, the number of frequencies the pixel retains. It is a count map.

*Theorem (two-factor truncation; our collaborator's assembly, independently audited).* Cut both spectra at radius $M$. The filtered product changes by at most
$$K_\Sigma\Bigl[\sqrt{T_A(M)\,T_B(M/2)} + \sqrt{T_B(M)\,T_A(M/2)}\Bigr] + 2\,e^{-\lambda_{\min}(\Sigma) M^2/16}\, K_{\Sigma/2}\,\|a\|_2\|b\|_2 .$$
With the tail law the first term is at most $2\sqrt2\, K_\Sigma \sqrt{c_A c_B}/M$ where $c_A = c^* V_A$ and likewise for $B$. *Proof sketch.* A dropped pair has $|m| > M$ (or symmetrically $|n| > M$). If its partner also has $|n| > M/2$, Schur's test on the two tails gives the first term. If $|n| \le M/2$ then the beat $|m + n| > M/2$ is far out, so half of the Gaussian damping is at most $e^{-\lambda_{\min} M^2/16}$ and the other half is a pair matrix for $\Sigma/2$, which Schur bounds again. $\square$

Everything in this theorem is explicit: variations, theta functions, the constant $c^*$. And it covers the same-lattice case too, where the coherent pairs beyond $M$ contribute exactly $T(M)$ to the mean and are charged by the same law; the example $(1 + \cos N\theta)/2$ is charged its variation $2N$. What it does *not* do is make the product cheap. It says how many harmonics you may cut; it does not say how many pairs you must keep, or how to form the coefficients, or what happens with three factors (there the counting tools above give infinite counts on a dense module, and a stronger decay statement is needed; that is open). For two half-square masks rotated five degrees, sorting the pairs by weight, the pairs that matter at eight bits number one, nine and fifty-four for footprints whose ellipse has radius a twentieth, a fifth and a half of the dual spacing: a prediction, and an encouraging one.

**The orientation refinement (proved, both sides of the collaboration independently, with the same constants).** The certificate above is a worst case over all bounded materials. Polygonal materials do better, and the reason is visible in Section 4: the coefficient of a polygon at frequency $m$ is a sum over its edges, and the edge $e$ contributes at most $|\mathrm{jump}_e|\,\min(\ell_e, 2/|m\cdot t_e|)/(D_A|m|)$ (radian frequencies, $D_A$ the cell area, $t_e$ the edge's tangent). So the spectrum is a *star*: of size $1/|m|$ only in a strip along each edge's normal, and of size $1/(|m|\,|m\cdot t_e|)$, an inverse square with an angular factor, elsewhere. Pairing two such stars, edge by edge, gives two theorems. Uniformly in orientation, the dropped pair mass beyond radius $M$ of an edge pair is at most $32\,|\mathrm{jump}_e||\mathrm{jump}_f|\,N_E\,(1 + \rho/3M)\sqrt{U_e U_f}/(D_A D_B D M)$, with $U_e = 4\ell_e + \rho\ell_e^2$, $N_E$ the number of partners a frequency can have in the ellipse, and $D$, $\rho$ the cell area and covering radius of the frequency lattice; the rate $1/M$ is the coherent one-dimensional moiré of two gratings with parallel edges, and it is the whole story when two edges share a direction. For edges whose normals are separated by an angle with $|\sin\psi| = \delta > 0$, the rate improves to $\log M/M^2$: at most $\tfrac{256}{3}|\mathrm{jump}_e||\mathrm{jump}_f|N_E(2 + \rho/M)[Q_M + \tfrac43\log 2]/(\delta D_A D_B D M^2)$ with $Q_M = \rho(\ell_e + \ell_f) + r_E\ell_f + 4 + 2\log_+(\ell_e M) + 2\log_+(\ell_f M)$, for $M \ge \max(4 r_E/\delta, 2 r_E)$. The proofs use one exact counting fact, that the lattice points of a strip inside a disc number at most the area of the strip enlarged by one cell over the cell area, and a layer-cake integral; they are in the orientation note. What this buys: if every edge pair of two materials is separated, the harmonic radius needed for a budget $\varepsilon$ is of order $\sqrt{\log(1/\varepsilon)/\varepsilon}$ instead of $1/\varepsilon$, and the retained candidates number of order $(1/\varepsilon)\log(1/\varepsilon)$ instead of $1/\varepsilon^2$. And then the shape of the retained set does the rest. Instead of a disc of radius $M$, retain for each edge the *hyperbolic cross* $\{m : |m|\max(h, |m\cdot t_e|) \le T\}$, the region that reaches radius $T/h$ along the edge's normal and thins to radius $T/u$ at tangential distance $u$. Its lattice count is at most $(4cT/D)[1 + \tfrac12\log(cT/h^2)]$ and the sum of $X^{-2}$ outside it at most $(4c/DT)[3 + \log(cT/h^2)]$, with $c = (1 + \rho/h)^2$; and since each clipped edge factor is at most $\ell h/\max(h, |m\cdot t|)$ once the floor $h$ exceeds $2/\ell$ (plus the reach, for the partner's factor), the inequality $2gh \le g^2 + h^2$ bounds the omitted mass of any edge pair by the two tails, with no angle anywhere (our collaborator's Theorem C in the orientation note). So for every polygonal pair, aligned edges included, a budget $\varepsilon$ costs $T$ of order $(1/\varepsilon)\log(1/\varepsilon)$ and a retained set of order $(1/\varepsilon)\log^2(1/\varepsilon)$ points, the classical hyperbolic-cross law of Dung, Temlyakov and Ullrich now paired with the pixel's partner count. This is the count-map object the whole program was looking for: a lattice count in a region shaped by the material's own edges, with the footprint entering only through its reach and its partner count. What is still open is the price: the constants are envelopes that cannot see a material's cancellations (for two half squares they ask for tens of thousands of points where the actual coefficients need dozens), so the product is a compile-time list sorted by actual weight with this certificate on its tail; and the growth of the constants with the footprint's reach against the error budget has now been assembled and independently audited (orientation note, sections 7c and 7d): one common retained set over all edges of both materials, a selector that meets any source budget, and an enumeration of the hyperbolic regions by rotated rectangles, giving candidate arithmetic of order $\varepsilon^{-1}\log^5(1/\varepsilon)$ at a fixed footprint and fixed polygons. Its scope is exactly that: finite periodic polygonal pairs, fixed lattices, a fixed footprint. It is an order-of-growth theorem with envelope constants, not a shader.

**The query state, and where the program now stands.** Once a composed material is fixed, what a pixel needs from it is one number for each footprint, and there is a clean way to store enough for a whole band of footprints at once. Whiten a reference Gaussian $\gamma$ to the standard normal and expand the material in the orthonormal Hermite functions $h_\alpha = \mathrm{He}_\alpha/\sqrt{\alpha!}$: the state is $H_\alpha = \mathbb{E}_\gamma[F h_\alpha]$ for total degree at most $N$, and Bessel's inequality bounds its $\ell^2$ norm by one because $0 \le F \le 1$. A pixel whose Gaussian is $N(m, I + D)$ in whitened coordinates has response $\sum_\alpha H_\alpha c_\alpha$, where $c_\alpha$ are the Hermite coefficients of that Gaussian's density ratio, computable by a two-term recurrence; the truncation error is $\sqrt{S(w)}\, w^{-(N+1)/2}$ with $S(w) = \det(I - w^2 D^2)^{-1/2}\exp[w\, m^\top (I - wD)^{-1} m]$, valid while $\|D\| \le r_0 < 1$ and $w r_0 < 1$ (this identity is Shim's, 2026; our collaborator found it, applied it to bounded materials, and I checked the pieces). Two things make this the right state. Errors are collective: a state with $\ell^2$ error $\eta$ perturbs the response by at most $\eta\sqrt{S(1)}$, with no exponential amplification, and cutting the source to a spatial radius $R$ costs at most $e^{-R^2/4}$ for every degree at once. And the admission is honest: the covariance band around the reference is two-sided because the filtered response is not analytic at zero footprint (a stripe's response tends to one with an exponentially small correction), so no expansion converges past the reference. The state is acquired either from the retained characters of Section 5 (the Hermite coefficients of a character are $e^{-|\tilde k|^2/2}(i\tilde k)^\alpha/\sqrt{\alpha!}$ times the phase) or, for a product of two polygonal materials, exactly from the cells of their arrangement by the same polygon integrals the kernel already computes, at a compile-time cost that is large but finite (a few times $10^{12}$ operations per pyramid level for a texture of a thousand periods on a side, by a script's operation count) and no envelope at all.

So the program's shape, as of this writing: the count-map view gives the retained set (the ellipse for one material, the edge-adapted hyperbolic regions or the arrangement for two), the Hermite state gives a compact certified query for a fixed composed material and a band of footprints, and the honest gaps are the preparation cost, materials that are not polygonal, general nonlinear warps, and interactive controls that move one layer against another, since a relative shift of two layers survives every footprint and needs its own state. (Motion of the whole material needs no new state: an affine motion turns the pixel's Gaussian into another Gaussian queried against the same state, a perspective warp adds a cubic correction to the query coefficients priced by the projective theorems of Section 8, and a small smooth warp is covered for every bounded material at once by a relative-entropy bound, since the pushforward of the Gaussian under a displacement field $u$ with $\|Du\| \le \kappa < 1$ has relative entropy at most $\mathbb{E}|u|^2/2 + \mathbb{E}\|Du\|_F^2/(2(1-\kappa))$ against the Gaussian, and Pinsker turns that into a response bound. What no bound of that kind can do is pick the degree from the warp's size alone: an oscillatory shear of bounded displacement has a bounded density-ratio norm and still defeats every fixed degree for a material that co-varies with it.)

And the one kind of independent motion that a bounded source can carry has now a clean form. Let $A$ be any bounded material and let the second layer be $B(x) = b(Mx)$ with $b$ a supplied finite Fourier polynomial in a few phases with values in $[0,1]$. Sliding the two layers against each other changes only the phases, $A(x+s_A)B(x+s_B) = A(y)\,b(My + \varphi)$, so the state needs one Hermite column per Fourier mode of $b$ (three for a single cosine-controlled layer, whatever its carrier; several independently controlled layers need their full joint mode set, which is small only when they share a character), each column being $A$ multiplied by a plane wave, which the edge recurrence of the boundary oracle acquires directly when $A$ is polygonal, with a complex shift in place of a real one. The control's Fourier modes are, in the language of Section 11c, exactly the beat frequencies of the pair list restricted to the controlled layer; a supplied finite phase basis is the case where that set is small by construction, and several unrelated sliding layers still multiply their modes. (Three or more layers are open only for the spectral route: the spatial acquisition takes any graph of polygonal layers, since its cells are the arrangement of all their edges, at the price of building that arrangement.)

**Implicit materials, one class priced [proved, our collaborator; counts checked here].** Not every material is given by its edges. A shader often defines a region by a sign test, $p(x, y) > 0$, and combines such tests with Boolean logic. For rational polynomial tests of total degree $D$ there is now a certified acquisition of the query state with no curve arrangement supplied. Subdivide the window $[-R, R]^2$ into dyadic cells and decide exactly on each cell whether any test polynomial vanishes there (a real-algebraic decision, polynomial in the degree and the bit lengths at fixed dimension); a cell where none vanishes has constant signs, so one evaluation at its centre fixes its value; the rest are split or paid for as uncertain. Counting roots along the grid lines and connected components of the zero set (Milnor's bound) shows that at most $10 D k + 2 D^2 + 7 D$ cells of a $k \times k$ grid meet the zero set, so the uncertain area at cell size $h$ is at most $20 D R h + (2D^2 + 7D) h^2$. The right measure for that area is the pixels themselves, not the reference Gaussian. If every footprint of the band has covariance between $q_- I$ and $q_+ I$ and centre within $L$ of the origin, every footprint density is at most $1/(2\pi q_-)$ and puts at most $e^{-(R - L)^2/(2 q_+)}$ outside the window, so a single mesh gives every pixel of the band a response error from the source approximation of at most $\varepsilon_A$, at a cell size of order $q_- \varepsilon_A/(D R)$ and a node count of order $D^2 R^2/(q_- \varepsilon_A)$; the resolved cells are rectangles, whose Hermite moments separate into one-dimensional endpoint integrals with a closed antiderivative. This is a compile-time contract, not a real-time one. Lattice noise with a polynomial fade is piecewise polynomial once its cell and its hash values are fixed (a quintic gradient-noise cell has total degree eleven), so its thresholds fall under the class cell by cell, at the price of enumerating the cells of every octave, which a compact loop can make exponentially many; level sets of trigonometric fields stay open. Acquiring a shader adaptively under conservative range bounds goes back to Heidrich, Slusallek and Seidel (1998); the new part is the complete decision on each cell and the Gaussian-query cost contract (our collaborator's `IMPLICIT-POLYNOMIAL-SOURCE.md`).

## 12. Where we are, honestly

**Proved or audited.** The Gaussian character formula and the algebra of complex Gaussians (Section 7). The count theorem with its three branches and the level (Section 5; conditional on a certified cell integrator). The wrapped density lemma (Section 6). The projective density bound, its signed first correction with the finite hierarchy, and the positive quadratic model's bound (Section 8). The pathwise envelope, the fixed-weight bias and variance accounting, and the yardstick (Section 9). The band-mass certificates, single, wrapped, and graph-level (Section 10). The hash contraction and the carry-state theorem (Section 11). The one-dimensional Gaussian subdivision cost theorem (Section 11b, our collaborator's). The heat-content lemma, the tail-energy law with its constant, and the two-factor truncation certificate for filtered products (Section 11c). The orientation refinement of that certificate for polygonal materials, uniform, transverse, and by hyperbolic regions without any angle (Section 11c, orientation-note.md). The certified acquisition of implicit polynomial-threshold materials with its direct query-family budget (Section 11c, end; our collaborator's, counts checked here).

**Measured.** The kernel computes the checkerboard, the circles, a rippled checkerboard and a three-sine mask to about $0.001$ RMS against references of millions of samples. The residual arm beats the demo's TAA on flicker, error at rest and error in motion for materials with an unsupported detail layer. The corrected affine oracle is accurate to eight bits on the checkerboard from row $9$ down, with retained sets unchanged to within a few percent. All numbers carry the probe file and commit that produced them.

**Open, and it is the important one.** Cost. The kernel takes $7$ to $8$ milliseconds at $960 \times 640$ on an Apple GPU for the checkerboard, which extrapolates to about $25$ milliseconds at $1080$p against a product target of one millisecond; the mask is far worse. The theory says two things about that cost and leaves the rest open. Precision is not the lever, since the level grows only logarithmically. And the cheap geometric models are certified in the transition band, so the licence to use them there exists. What is open is everything else: the constant factors of the measured kernel, whether a broader class of materials admits a short list of coefficients and interactions at all, and what those cost to form; an exact series is not automatically a cheap one. Composition is certified for two factors (Section 11c) and, for polygonal pairs, priced as an order of growth with envelope constants; the orthonormal Hermite query state gives a compact certified query for a fixed composed material over a band of footprints (Section 11c, end), acquirable exactly from the arrangement at a large compile-time cost. Open: the preparation cost against the envelope, non-polygonal materials beyond rational polynomial sign programs, general nonlinear warps, three or more factors in the spectral route, and controls that move one layer against another; common affine motion and perspective are covered. This is research, not settled engineering, and it is the author's theory-first direction that the next results have to serve. Generality is the other open front: textures, normal-mapped lighting and geometric edges stay with TAA, which the residual architecture makes acceptable but not free.

If you want the one-sentence summary of the program: a pixel is a Gaussian random point, a material reads counts, the pixel's colour is a pairing between the material and the count distribution, and every theorem here is a statement about one side of that pairing that holds for the other side entirely.

## 13. Exercises

1. Derive (4.1) in one dimension by completing the square, then in two dimensions by independence.
2. Compute the damped square-wave series at a pixel with count spread $|b| = 0.5$ per $\sigma$ and centre count $m = 0.3$: how many odd $p$ contribute more than $10^{-3}$? Plot the damped sum against the original square wave for $m$ from $0$ to $2$.
3. Prove the wrapped density lemma from scratch, then show why the zero mode must be retained.
4. Compute $C = \tfrac12\mathbb{E}|Z_1(3 - |Z|^2)|$ numerically and check it against $6\sqrt{3}e^{-3/2}/\pi$. For the brave: do it in polar coordinates by hand.
5. Show that $P_s(z) = z/(1 + s\,k \cdot z)$ satisfies $P_s \circ P_t = P_{s + t}$, and compute the velocity field at $s = 0$.
6. Using $\mathbb{E}[Z_j e^{i\theta\cdot Z}] = i\theta_j e^{-|\theta|^2/2}$ and $\mathbb{E}[|Z|^2 e^{i\theta \cdot Z}] = (2 - |\theta|^2)e^{-|\theta|^2/2}$ (derive both by differentiating (4.1)), show that the first correction multiplies a character's response by $1 + i(k \cdot \theta)(|\theta|^2 - 1)$.
7. Derive the TAA variance formula and the yardstick $19/3$. Then explain, in words, why doubling the number of jittered samples per frame is not the same as halving $\alpha$.
8. Take the band-mass inequality of Section 10 and apply it to a checkerboard whose model counts are off by $\delta = 0.02$ half-tiles at a pixel with count spread $s = 0.3$: what is the certified mean error, and how does it compare with $\delta$ itself?

## Appendix A. Notation

| Symbol | Meaning |
|---|---|
| $x_0$, $\sigma$ | pixel centre and the Gaussian window's standard deviation, $0.5$ pixels |
| $Z$, $\varphi$ | the whitened footprint, a standard Gaussian in two dimensions, and its density |
| $f$, $g$, $\Phi$ | the shader on screen, the material, and the count map, $f = g \circ \Phi$ |
| $\mu$ | the count distribution, the pixel's Gaussian pushed through $\Phi$ |
| $m$, $B$, $b$ | the count at the centre, the matrix of count gradients per $\sigma$, one of its rows |
| $Q$, $c$, $K_c$ | $4\pi^2 BB^\top$, the level, and the retained set of lattice modes |
| $s$, $\lambda_1$, $\lambda_2$ | $\sqrt{\det Q}$ and the eigenvalues of $Q$ |
| $R$ | the reach, the radius in $\sigma$ units beyond which the Gaussian tail is budgeted |
| $k$ | the perspective rate, the relative change of depth across one $\sigma$ |
| $\alpha$ | TAA's blend weight; the current sample's weight in the history |
| $\rho$ | the residual's share of the per-sample variance |
| $\Phi(\cdot)$, $\varphi_1$ | the standard normal distribution function and density in one dimension |
| $W$ | the width of a material's value range |

## Appendix B. Where the details live

- `paper/notes/t2-count-theorem.md`: the count theorem with its three branches, the level, and the material work per branch.
- `paper/notes/beyond-count-maps.md`: the research log, with a "read this first" block, every withdrawn claim marked in place, and section 16 for the temporal and projective results of this week.
- `paper/notes/shared-phase-family.md` and `paper/notes/gabor-family.md`: the shared-carrier masks and the Gabor fields.
- `paper/reviews/2026-09-05-integral-compiler/theory-program-review/`: our collaborator's proofs, including `RESIDUAL-HISTORY.md` (the envelope and band certificates) and `PROJECTIVE-DENSITY.md` (Section 8).
- `paper/tools/exp/theory-probes/`: the probes named in these notes; each prints the numbers quoted.
- `demo/index.html`: the side-by-side demo, with `?kernel=next&scene=4` for the residual arm.
