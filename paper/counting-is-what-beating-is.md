# Counting is what beating is

### The third pattern, taught from the ground up, with the tutorial folded in and an honest look at where it might lead

This document combines two things from this repository: the paper *The third pattern: how beats emerge from counting* and its tutorial companion *Beating from the ground up*. The paper states the theory and measures it. The tutorial teaches the mathematics the paper leans on. Here they are interleaved, so that every idea is taught at the moment the theory needs it, and every theorem arrives with the picture that makes it obvious.

You need high-school algebra and the willingness to draw. Where a step needs calculus or a first course in probability, it says so, and the step is small. Four facts are taken on trust in the whole document, and each is named where it occurs. Everything else is proved on the page, usually in a few lines.

Every number quoted here comes from a script in `paper/tools/exp/` that refuses to produce it if its own check fails. The scripts are named where their numbers appear.

The last section is different in kind. It is my own reading of what the theory is saying underneath, which parts of it I think are deeper than the paper claims, and which directions look like they could turn into something large. I have tried to keep that section as honest as the ledger the paper keeps of its own evidence.

---

## Contents

1. Three things you can do this afternoon
2. The count, and why frequency is an average
3. Where you are in every family: the torus
4. Slow and fast: the heterodyne ratio
5. Waves, and the one integral everything runs on
6. What pooling sees: the sharp version
7. What pooling sees: the soft version
8. The observer theorem, and who can see a beat
9. Which pattern emerges: arithmetic decides
10. Emergence, iterated
11. When counting fails
12. A strobe is a family
13. The instrument, and the theory turned on its own pixels
14. The ledger
15. What this is really saying, and where it could go

---

## 1. Three things you can do this afternoon

**Two rulers.** Take a ruler with ten divisions to the inch and lay it edge to edge against one with nine. Somewhere along the pair a tick of the first sits exactly on a tick of the second. Move your eye along. The next pair of ticks is a hair apart, the next a hair more, and after ten ticks of the first ruler and nine of the second the ticks coincide again. Without trying, you see a slow pattern of near-coincidences that repeats every inch. It is on neither ruler. Bend the rulers a little, or space the ticks slightly unevenly, and the pattern of coincidences is still there, slightly uneven in its own way. A caliper's vernier scale is exactly this pair of rulers, read on purpose.

**Two click trains.** Two trains of clicks at nearly equal rates, say a hundred and a hundred and one per second, go into a detector that fires only when two clicks arrive together. Clicks arrive together once per second, so the detector fires once per second. That is the difference of the two rates, and it is all the detector knows. Raise both trains to a thousand and a thousand and one per second and the detector's output is exactly the same, one click per second. It never learned the original rates. Now replace the detector by something that only averages, a slow meter reporting the mean loudness over a tenth of a second. It reports a steady hum and nothing once per second, however long you listen. Section 8 proves that it must. The once-per-second pulse is not in the sum of the two trains. The detector makes it.

**Two gratings.** Print a grating of fine lines on a transparency, print another with a slightly different spacing, lay one over the other. From arm's length you see broad bands, much wider than the lines. Blur your eyes: the bands stay and the lines go. Photograph the pair out of focus, turn the photograph into pure black and white with a threshold, print it badly. The bands are always in the same place. Only their contrast changes.

**What the three share.** Each family comes in numbered members: ticks, clicks, lines. Two families laid over each other produce a pattern that belongs to neither. The paper calls it the *third pattern*; a musician would call it a *beat*. It is a pattern of coincidences between the numbering of one family and the numbering of the other. It lives on a scale set by how slowly the two numberings drift apart. And it is read out by anything that *pools*, an eye, a detector, a blur, with the pooling changing only how strongly the pattern shows, never where it is.

Notice what was never mentioned: a frequency. None of the three descriptions needed the families to be regular. What the three have is a count.

> **Try it.** Two rulers with different units work well, centimetres against sixteenths of an inch. So do two combs, or two pieces of window screen laid over each other and turned slowly. Count how many members of each family fit in one period of the bands. For the ten-and-nine rulers it is ten and nine. The rule you will find is that the two counts differ by exactly one per period, whatever the families are.

---

## 2. The count, and why frequency is an average

> **Definition (the count).** A *family* is anything that comes in numbered members along a line, a plane, a circle or a clock: ticks, clicks, lines, rings, teeth, steps, days. Its *count* $\xi(x)$ is the number of members up to the point $x$, interpolated between members, so that $\xi$ is a whole number exactly on a member and $\xi = n + \tfrac12$ halfway from member $n$ to member $n+1$.

For a ruler whose ticks are a distance $T$ apart, its *pitch*, the count is $\xi(x) = x/T$. Ten members to the inch means $\xi$ rises by ten per inch. But the count exists for any family, evenly spaced or not, and that is the whole reason the theory never needs a frequency.

Here is the distinction in one image. A car has a speedometer and an odometer. The speedometer says how fast you are going now; the odometer says how far you have come. A frequency is a speedometer reading: how many members a family produces per unit of distance or time, on average. A count is the odometer: which member is here. Two cars can have the same average speed over a trip and be at completely different places at noon. Beating is about where the two odometers stand relative to each other, and no amount of speedometer data tells you that.

Take ticks at positions $t_1 < t_2 < t_3 < \dots$. The count has $\xi(t_n) = n$ and rises smoothly in between. Its derivative $\xi'(x)$, the *rate*, is what a physicist calls the spatial frequency, and for uneven ticks the rate varies from place to place; "the frequency" is just the rate averaged over a stretch. Bend the ruler and the count bends with it. The pattern of coincidences follows the count, which is why it survived the bending in Section 1.

**The fractional part.** Write $\{\xi\} = \xi - \lfloor \xi \rfloor$, also written $\xi \bmod 1$, for where you are within the current member: $0$ on a member, $\tfrac12$ halfway to the next. Two things to notice. First, $\{\xi\}$ repeats with period one in the count, so any question about coincidences is a question about fractional parts. Second, a whole-number combination of counts is a count. If $\xi_A$ and $\xi_B$ are counts, then $D = \xi_A - \xi_B$ rises by one exactly when family A has gained one member on family B, and its fractional part depends only on the fractional parts of $\xi_A$ and $\xi_B$, because $\{a\xi_A + b\xi_B\} = \{a\{\xi_A\} + b\{\xi_B\}\}$ for whole numbers $a$ and $b$. A whole-number combination of whole numbers is a whole number, and drops out. A tick of A lies exactly on a tick of B where both fractional parts are zero. If the two families share a tick at $x = 0$, that happens exactly where $D$ is a whole number.

That last sentence is the ten-and-nine rulers. The bands sit where $D$ is a whole number, and the pattern repeats when $D$ has grown by one, which takes ten members of A and nine of B. Everything in this document is a generalisation of that drawing.

> **Check yourself.** Ten ticks to the inch against nine, sharing a tick at $x = 0$. Compute $D(x)$ and find the period of the coincidence pattern.
>
> *Answer.* $\xi_A = 10x$ and $\xi_B = 9x$ in inches, so $D = x$. Coincidences, where $D$ is a whole number, are one inch apart: ten members of A and nine of B per period.

---

## 3. Where you are in every family: the torus

Stand at a point $x$ on the pair of rulers. You are, say, three tenths of the way from tick 40 to tick 41 of family A, and seven tenths of the way from tick 36 to tick 37 of family B. Those two fractions, $0.3$ and $0.7$, are where you are *within the current member* of each family, and they are all a pattern of coincidences can depend on. Whether ticks coincide at $x$ is a question about the fractions, not about the numbers 40 and 36.

### The circle as an interval with its ends glued

Numbers modulo one live on the interval $[0, 1)$ with $1$ identified with $0$: walk past $1$ and you are back at $0$. That is a circle, written $\mathbb{R}/\mathbb{Z}$ or $\mathbb{T}^1$. A function on the circle is exactly a function $f(u)$ of a real variable with $f(u+1) = f(u)$, a periodic function of period one. Nothing about roundness is needed, only the gluing. As $x$ moves, the point $\xi(x) \bmod 1$ goes once round the circle per member.

### The torus as a square with opposite edges glued

> **Definition (the torus of counts).** For $K$ families with counts $\xi_1, \dots, \xi_K$, the *state* of the superposition at $x$ is the point
> $$\Phi(x) = \big(\xi_1(x), \dots, \xi_K(x)\big) \bmod 1,$$
> the fractional part of every count at once. For two families $\Phi(x)$ is a point $(u_1, u_2)$ of the unit square. Walking off the right edge (family A completes a member) brings you back in at the left edge at the same height; walking off the top brings you back in at the bottom. The square with its opposite edges glued is a *torus*, $\mathbb{T}^2$, and as $x$ moves, $\Phi(x)$ traces a path on it.

The only fact about the torus ever used is this: a function on the torus is the same thing as a function $I(u_1, u_2)$ of two ordinary variables that repeats with period one in each variable separately. You never need to picture a doughnut. $K$ counts give $\mathbb{T}^K$, the unit cube in $K$ dimensions with opposite faces glued, and you never need to picture that either.

A useful mental image: a dashboard with $K$ odometers, each showing only its fractional digit. The state is what the dashboard reads. The torus is the set of all possible dashboard readings.

### The picture on the torus

The state says where things are. What they look like is a separate thing, and separating the two is the first idea worth having.

> **Definition (the picture on the torus).** What the superposition *looks like* at $x$, how much ink, how loud, whether the detector fires, depends on $x$ only through the state $\Phi(x)$, by a fixed rule $I$ that knows nothing about $x$: the *picture on the torus*. The superposition is the composite
> $$S = I \circ \Phi, \qquad S(x) = I\big(\Phi(x)\big).$$

The formula says: look up where you are in every family, then look up what that state looks like. For two printed gratings, $I(u_1, u_2)$ is "ink if $u_1$ is within the stroke of a line of A, or $u_2$ within a line of B": a picture on the torus made of two bands, one across and one up, and their crossing. For two click trains into a coincidence detector, $I(u_1, u_2)$ is "fire if $u_1$ and $u_2$ are both within a click's width of zero": a small square at the corner of the torus.

Everything about *where*, pitches, spacings, the bend in a ruler, a drift in a clock, lives in $\Phi$. Everything about *what*, ink, click shape, brightness, whether inks multiply or sounds add, lives in $I$. Two superpositions with the same $\Phi$ differ only in their picture; two with the same picture differ only in their state map.

Think of a map and a legend. $\Phi$ is the map: it says which square of the grid you are standing in. $I$ is the legend: it says what that grid square is coloured. The whole rest of the theory is a list of things that are properties of the map, things that are properties of the legend, and things that are properties of how an observer reads one through the other. That sorting is more powerful than it looks. It is the reason one theorem will later cover printed gratings, sounds in the air, wagon wheels under a strobe, and a camera's shutter.

### Lines on the torus

A straight line $u(t) = u_0 + t w$ in the square, with $w = (w_1, w_2)$, wraps whenever it hits an edge. If $w$ has whole-number entries the line returns to $u_0$ at $t = 1$: it is a closed loop. If $w_1/w_2$ is rational, the line closes after both coordinates have moved by whole numbers. If $w_1/w_2$ is irrational, it never closes, and it comes arbitrarily close to every point of the torus. Section 10 proves the stronger statement that it spends equal time in equal areas.

### Combined counts and recipes

The difference $D = \xi_A - \xi_B$ is itself a count: it rises by one per period of the bands, and the bands are its members. So is the sum $\xi_A + \xi_B$, and so is any combination
$$k \cdot \xi = k_1 \xi_1 + k_2 \xi_2 + \dots + k_K \xi_K, \qquad k = (k_1, \dots, k_K) \text{ whole numbers}.$$
The vector $k$ is the *recipe*. We write $k = (1, -1)$ for the difference, $(1, 1)$ for the sum, $(2, -1)$ for twice the first count minus the second. A combined count's fractional part depends only on the state $\Phi(x)$, for the reason given in Section 2. Every recipe is a candidate pattern, all of them at once. Which ones show is a matter of how fast each changes.

On the torus, the combined count $k \cdot u$ is constant along the lines perpendicular to $k$. A line in direction $w$ leaves $k \cdot u$ unchanged exactly when $k \cdot w = 0$. That is nothing but the dot product, and it will be the whole content of the first theorem.

Why recipes with entries bigger than one matter, in one sentence that Section 5 unpacks: a family with sharp edges, seen as a function of its own count, is a sum of waves that repeat once, twice, three times per member, its *harmonics*, and the second harmonic of family A against the first of family B makes a pattern of coincidences with recipe $(2, -1)$, as surely as the first against the first makes $(1, -1)$. A pair of rulers with ten and nineteen divisions to the inch shows it: twice the first count minus the second rises by one per inch, and that is the pattern you see, faint but there. Nineteen to ten is nearly two to one, the ratio of a musical octave, so $(2, -1)$ is the *octave* recipe. A recipe with an entry beyond one that shows is called a *station*, because it locks the two families at a rational ratio of their pitches, and its *order* is the sum of its entries' sizes.

> **Check yourself.** Which recipes $k = (k_1, k_2)$ are unchanged along the slide $w = (1, 2)$? Which three-family recipes are unchanged along $w = (1, 1, 1)$?
>
> *Answer.* $k \cdot w = k_1 + 2k_2 = 0$: $k = (2, -1)$ and its multiples, the octave recipe. For $(1, 1, 1)$: every $k$ with $k_1 + k_2 + k_3 = 0$, the zero-sum recipes, including $(1, -1, 0)$, $(0, 1, -1)$ and $(1, -2, 1)$.

---

## 4. Slow and fast: the heterodyne ratio

This section needs the gradient from calculus. If you know that the gradient of a function on the plane points in the direction of fastest increase and has length equal to that rate of increase, you have everything.

### Gradients of counts

For a count $\xi(x)$ on the plane, $\nabla \xi$ points across the members and its length is members per unit distance. It is perpendicular to the level lines of $\xi$, which are the members themselves. For parallel lines of pitch $T$ turned to angle $\alpha$, $\nabla \xi = (\cos\alpha, \sin\alpha)/T$. For rings of pitch $s$ about a centre $c$, $\xi = |x - c|/s$ and $\nabla \xi = (x - c)/(s|x - c|)$, the unit vector away from the centre, over $s$. Rates add: the combined count $k \cdot \xi$ has gradient $\sum_i k_i \nabla \xi_i$. The $a$-th harmonic of family 1 repeats $a$ times per member, so its rate is $a \nabla \xi_1$.

> **Definition (slow and fast; the heterodyne ratio).** For a recipe $k = (a, b)$ on two families, its *heterodyne ratio* is
> $$\eta_{a,b}(x) = \frac{|a\,\nabla\xi_1 + b\,\nabla\xi_2|}{\tfrac12\big(|a\,\nabla\xi_1| + |b\,\nabla\xi_2|\big)},$$
> the rate of the combination divided by the average rate of the two harmonics that form it. Its reciprocal is the number of members per band. A recipe is *slow* when $\eta$ is small; the paper calls $\eta < \tfrac14$, more than four members per band, the *beat regime*, and it is where every pattern in this document lives.

The word is the radio engineer's. To *heterodyne* is to mix two rates and keep their difference, and $\eta$ says how clean the mix is. On the ten-and-nine rulers the difference has $\eta = 1/9.5$, nine and a half members per band, and the sum has $\eta = 19/9.5 = 2$: half a member per band, which is no band at all. Turn one ruler around so that its count runs the other way and the sum becomes the slow one. Nothing in the theory prefers a difference.

The threshold one quarter is a convention, not a theorem. It is where a pattern of coincidences stops reading as one: with more than four members per band the bands are wider than the members that make them, and with fewer there is no band, only members. The ratio is a number at every point of the plane, so it can be drawn as a map, and the tool of Section 13 draws it: bright where no pattern can form, dark where one must.

From here on, the members themselves, the ticks, the clicks, the lines, the fine texture a pooling observer loses, are the *carrier*, radio's word again, and a slow recipe is a *beat*.

**Example.** Two families of parallel lines of pitch 1, one turned by ten degrees. $\nabla\xi_1 = (1, 0)$ and $\nabla\xi_2 = (0.985, 0.174)$. The difference recipe $(1, -1)$ has rate $|(0.015, -0.174)| = 0.174$; the average member rate is $1$; $\eta = 0.174$, about $5.7$ members per band, inside the beat regime. Turn the second family to twenty degrees and $\eta = 0.347$: fewer than four members per band, and the bands stop reading as bands. This is the familiar experience of turning one sheet of window screen over another. The bands are huge near alignment and shrink as you turn, and at some angle they simply stop being bands.

> **Check yourself.** Two ring families of pitch $s$ centred at $c_1$ and $c_2$. Where is the difference recipe slow?
>
> *Answer.* Its rate is $|\nabla\xi_1 - \nabla\xi_2|$, which is $1/s$ times the distance between two unit vectors pointing away from the two centres. It is exactly zero on the line through the centres, outside the segment between them, where the two unit vectors agree; small far from both centres in any direction; and large between the centres, where the vectors oppose. So the bands of two off-centre ring families are hyperbolae, bold far out and along the axis, and the region between the centres shows no band at all. If you have ever seen the opening scene of the tool, that is what you were looking at.

### The state map near a point

One more piece of calculus, used in Section 7. Let $J$ be the $K \times 2$ matrix whose rows are the gradients $\nabla\xi_i(x)$, the Jacobian of $\Phi$. Taylor's theorem in two variables says
$$\Phi(y) = \Phi(x) + J\,(y - x) + E(y), \qquad |E(y)| \le \tfrac12 \kappa\,|y - x|^2,$$
where $\kappa$ bounds the second derivatives of the counts near $x$. So a small disc around $x$ maps, to first order, onto a small parallelogram around $\Phi(x)$. When all the families have nearly the same pitch and direction, the rows of $J$ are nearly equal and the parallelogram collapses to a short segment in the direction $(1, 1, \dots, 1)$: the *fast direction*. Across a small neighbourhood, every count advances together while their differences barely move. The error term $E$ is what curvature of the members costs, and it is second order in the size of the disc.

---

## 5. Waves, and the one integral everything runs on

Every proof in the theory expands pictures into waves and uses one integral. This section builds both from Taylor series. It needs complex numbers, which take five lines.

### Complex numbers in five lines

A complex number is $z = a + bi$ with $i^2 = -1$; add and multiply as for polynomials and replace $i^2$ by $-1$. Its conjugate is $\bar z = a - bi$, its modulus is $|z| = \sqrt{a^2 + b^2}$, and $z \bar z = |z|^2$, which is how one divides. The conjugate of a product is the product of the conjugates, and $|zw| = |z||w|$. Points $a + bi$ are points $(a, b)$ of the plane, and $|z|$ is the distance from the origin.

### Euler's formula, from Taylor series

Put $i\varphi$ into the series $e^x = \sum x^n/n!$ and sort the terms by the powers of $i$, using $i^2 = -1$, $i^3 = -i$, $i^4 = 1$:
$$e^{i\varphi} = \Big(1 - \frac{\varphi^2}{2!} + \frac{\varphi^4}{4!} - \dots\Big) + i\Big(\varphi - \frac{\varphi^3}{3!} + \frac{\varphi^5}{5!} - \dots\Big) = \cos\varphi + i\sin\varphi.$$
So $e^{i\varphi}$ is the point of the unit circle at angle $\varphi$. We measure angles in *turns*: with $\varphi = 2\pi\theta$, the point $e^{2\pi i\theta}$ goes once round the circle as $\theta$ runs from $0$ to $1$, and $e^{2\pi i(\theta + 1)} = e^{2\pi i\theta}$. A wave is a function on the circle of Section 3. Multiplying two waves adds their angles, because $e^{x+y} = e^x e^y$ holds for the series with complex arguments. Conjugating a wave reverses it. Adding and subtracting Euler's formula for $\pm\varphi$ gives the two identities everything below runs on:
$$\cos\varphi = \tfrac12\big(e^{i\varphi} + e^{-i\varphi}\big), \qquad \sin\varphi = \tfrac{1}{2i}\big(e^{i\varphi} - e^{-i\varphi}\big).$$

A complex-valued function of a real variable is differentiated and integrated part by part, so the fundamental theorem of calculus applies. Differentiating $e^{2\pi i m u}$ gives $2\pi i m\,e^{2\pi i m u}$: the wave is its own derivative up to a constant, exactly like $e^{au}$.

> **Fact (the one integral).** For a whole number $m$,
> $$\int_0^1 e^{2\pi i m u}\,du = \begin{cases} 1 & m = 0,\\ 0 & m \ne 0.\end{cases}$$
>
> *Proof.* For $m = 0$ the integrand is $1$. Otherwise the antiderivative is $e^{2\pi i m u}/(2\pi i m)$, so the integral is $(e^{2\pi i m} - 1)/(2\pi i m)$, and $e^{2\pi i m} = \cos 2\pi m + i \sin 2\pi m = 1$ for a whole number $m$.

The picture: the average position of a point that goes round the circle a whole number of times is the centre. If it does not go round at all, it stays where it is. This is the entire engine of the theory. Everything that follows is this integral wearing different hats.

Two consequences used constantly. On the torus, a wave with recipe $k$ is $e^{2\pi i\,k \cdot u}$, and along a slide $u + tw$ it becomes $e^{2\pi i\,k \cdot u}\,e^{2\pi i\,t\,(k \cdot w)}$: a wave in $t$ turning $k \cdot w$ times per unit of $t$, which is a whole number when $w$ is. Its average over one slide is itself if $k \cdot w = 0$ and zero otherwise. And a real wave $\cos 2\pi\theta$ carries recipe $k$ and recipe $-k$ at once, so the product of two real waves,
$$\cos 2\pi\alpha\,\cos 2\pi\beta = \tfrac12\big(\cos 2\pi(\alpha + \beta) + \cos 2\pi(\alpha - \beta)\big),$$
carries both the sum and the difference of their recipes. That product-to-sum identity is the whole classical theory of beats: two tones multiplied by a nonlinearity give the sum and the difference frequency, and the difference is the beat. Keep it in mind when the nonlinear ear arrives in Section 8.

### Fourier series on the circle

A periodic function $g(u)$ of period one is a sum of waves,
$$g(u) = \sum_{n=-\infty}^{\infty} \hat g(n)\,e^{2\pi i n u}, \qquad \hat g(n) = \int_0^1 g(u)\,e^{-2\pi i n u}\,du.$$
This is the first fact taken on trust: Fourier's theorem, that for a piecewise smooth $g$ the series converges to $g$ everywhere except at a jump, where it gives the midpoint. What is not on trust is the formula for the coefficients, which follows from the one integral: multiply the series by $e^{-2\pi i n u}$ and integrate over one period, and every term but the $n$-th averages to zero. In the language of linear algebra the waves are orthogonal, and $\hat g(n)$ is the component of $g$ along the $n$-th wave, as $v \cdot e_n$ is the component of a vector along a unit axis. Three facts you will use without thinking: $\hat g(0)$ is the mean of $g$; for real $g$, $\hat g(-n) = \overline{\hat g(n)}$, so the strengths come in equal pairs and one speaks of "the $n$-th harmonic" for both; and the *line* at frequency $n$ in a signal's spectrum is $|\hat g(n)|$.

Fourier analysis is often taught as a bag of tricks. For this theory it is one trick: a picture on a torus is a sum of waves, one per recipe, and the coefficient of each wave says how much of that recipe the picture contains.

> **Example (the pulse train).** Let $g(u) = 1$ for $|u| < d/2$ modulo $1$ and $0$ otherwise: a stroke or a click covering a fraction $d$ of each period, its *duty*. Then $\hat g(0) = d$ and for $n \ne 0$
> $$\hat g(n) = \int_{-d/2}^{d/2} e^{-2\pi i n u}\,du = \frac{e^{-\pi i n d} - e^{\pi i n d}}{-2\pi i n} = \frac{\sin(n\pi d)}{n\pi}.$$
> So $\hat g(n) = 0$ exactly when $nd$ is a whole number. A fifty-percent train has no even harmonics; a one-third train has no third, sixth, ninth. And $|\hat g(n)| \le 1/(|n|\pi)$: the strengths fall like $1/|n|$, slowly, which is what a sharp edge costs. A smooth bump's coefficients fall much faster. "Anything with edges has many harmonics" is this comparison.

Remember the fifty-percent train's missing even harmonics. It will extinguish a beat on paper, a beat in an ear, and a wagon wheel under a strobe, all for the same reason.

**Symmetry kills harmonics.** If $g(u + \tfrac12) = 1 - g(u)$, the second half of the period is the first turned upside down, which is true of every fifty-percent train however symmetrically its edges are softened, then the shift multiplies $\hat g(n)$ by $(-1)^n$ and the right side has coefficients $\delta_{n0} - \hat g(n)$; for even $n \ne 0$ that says $\hat g(n) = -\hat g(n) = 0$. Softening the edges by an even smoothing preserves the symmetry, so it preserves the null. This will matter when we ask which observers can reopen a null.

### Fourier series on the torus

A function $I(u_1, u_2)$ periodic in each variable is a double series
$$I(u) = \sum_{k \in \mathbb{Z}^2} \hat I(k)\,e^{2\pi i\,k \cdot u}, \qquad \hat I(k) = \int_{\mathbb{T}^2} I(u)\,e^{-2\pi i\,k \cdot u}\,du,$$
one wave per recipe $k$, and the same in $K$ variables. Four structural facts carry the whole of Section 8.

- *A product of profiles.* If $I(u_1, u_2) = g_1(u_1)\,g_2(u_2)$ then $\hat I(k_1, k_2) = \hat g_1(k_1)\,\hat g_2(k_2)$. Every recipe is present, with the product of the two harmonics' strengths. This is the printed pair of gratings, whose inks multiply.
- *A sum of profiles.* If $I = g_1(u_1) + g_2(u_2)$ then $\hat I(k)$ is nonzero only for $k = (n, 0)$ or $(0, n)$. No cross recipe at all. This is two sounds in the air, or two projected gratings.
- *A polynomial of a sum.* $(g_1 + g_2)^2 = g_1^2 + 2g_1g_2 + g_2^2$. The cross term is a product, so the square of a sum carries the cross recipes $(a, b)$ at strength $2\hat g_1(a)\hat g_2(b)$. In general the $n$-th power of a sum of $K$ profiles is a sum of monomials $g_1^{e_1}\cdots g_K^{e_K}$ with $e_1 + \dots + e_K = n$.
- *Powers of a pure wave.* If $g(u) = \cos 2\pi u$ then $g^e = 2^{-e}(e^{2\pi i u} + e^{-2\pi i u})^e$, and the binomial expansion has exponents $e, e-2, \dots, -e$ only: $g^e$ carries harmonics of size at most $e$. So a monomial of pure waves carries only recipes with $|k_i| \le e_i$, of order at most $n$. This bound fails for harmonic-rich profiles, which is why the theorem that uses it will say "pure tones".

**Two-valued profiles.** If $g$ takes only the values $0$ and $1$ then $g^2 = g$, $g^3 = g$, and so on. Any polynomial in such profiles collapses to a combination of $1$, $g_1$, $g_2$ and $g_1 g_2$, and each of those carries at recipe $(a, b)$ a product of the profiles' own coefficients. A harmonic that a profile lacks cannot be manufactured by any front end. A light switch has no gamma curve: on is on, off is off, and no amount of nonlinear processing invents a new state.

> **Check yourself.** (a) At what duties does a stroke have no third harmonic? (b) Two thirty-percent pulse trains added: what is the coefficient of the recipe $(1, -1)$ in the sum, and in the square of the sum divided by four?
>
> *Answer.* (a) $3d$ a whole number: $d = \tfrac13, \tfrac23$. (b) In the sum, zero. In $(g_1 + g_2)^2/4$, the cross term gives $\tfrac12 \hat g_1(1)\hat g_2(-1) = \tfrac12(\sin 0.3\pi/\pi)^2 = \tfrac12(0.2575)^2 \approx 0.033$.

---

## 6. What pooling sees: the sharp version

Blur your eyes at the two gratings and the lines go while the bands stay. Point a camera at two gratings sliding past each other and leave the shutter open: the lines smear away and the bands are what the film records. Listen to the click trains through a detector too slow to follow the clicks: what comes out is the once-per-second pulse. In every case an observer that *pools*, that averages over a stretch of space or time before it responds, keeps the pattern of coincidences and loses the members. This section says exactly what such an observer sees, and the answer is short: the picture on the torus, averaged along the fast directions.

### Why sliding and blurring are the same motion

Blurring averages the superposition over a small neighbourhood of $x$. Across that neighbourhood every count advances a little, all of them together, so the neighbourhood's states form a short segment on the torus in the fast direction, and averaging over the neighbourhood is averaging the picture along that segment. A blur is a short slide with soft ends. The cleanest pooling observer is therefore one that averages over exactly one member of every family. Slide both gratings by one line each, at the same rate, and average the ink you saw along the way. On the torus that slide is the straight path from $\Phi(x)$ in direction $(1, 1)$ back to $\Phi(x)$: one unit across, one unit up, and the gluing brings it home.

> **Theorem (one period of every family is a sharp average).** Let $w = (w_1, \dots, w_K)$ be a recipe of whole numbers, and slide family $i$ through $w_i$ of its members while averaging:
> $$\mathcal{E}_w I(\Phi) = \int_0^1 I\big(\Phi + u\,w\big)\,du.$$
> Then $\mathcal{E}_w I$ depends on the state only through the combined counts whose recipe is orthogonal to the slide, $k \cdot w = 0$. Sliding every family through a whole number of members keeps exactly the recipes that the slide does not change, and removes every other, completely.
>
> *Proof.* Expand $I(\Phi + uw) = \sum_k \hat I(k)\,e^{2\pi i\,k \cdot \Phi}\,e^{2\pi i\,u\,(k \cdot w)}$. Because $k$ and $w$ are whole-number vectors, $m = k \cdot w$ is a whole number, and by the one integral the average over $u$ is $1$ for $m = 0$ and $0$ otherwise. What survives is $\sum_{k \cdot w = 0} \hat I(k)\,e^{2\pi i\,k \cdot \Phi}$.

That is the whole proof, and you have just done it. The remarkable word in the statement is *exactly*. The slide is by a whole number of members, so every wave it does not keep is carried round a whole number of times and cancels to zero with nothing left over. A slide by a fraction of a member would leave a little of everything.

### Conditional expectation, as a probabilist says it

The theorem is a statement about an average, and the right name for the average is a *conditional expectation*. This paragraph needs a first course in probability; skip it if you do not have one, and read $\mathbb{E}[I \mid \text{slow}]$ simply as "the picture, given the slow recipes".

Let $U$ be a point chosen uniformly at random on the torus. The picture's value $I(U)$ is a random variable with mean $\hat I(0)$. Now condition on the slow combined counts: the values $k \cdot U \bmod 1$ for recipes in the kept set $L = \{k : k \cdot w = 0\}$. However your course defined conditional expectation for a continuous condition, it comes to this: $\mathbb{E}[I(U) \mid \text{slow}]$ is the average of $I$ over the set of points that share the given slow values, with the uniform density along that set. Which points share the same slow counts? For a primitive $w$ (no common factor in its entries; $(2,2)$ traces the loop of $(1,1)$ twice and says nothing new), the recipes orthogonal to $w$ are the multiples of one recipe $k_0$, the condition is $k_0 \cdot u \equiv k_0 \cdot u_0 \pmod 1$, and that set is a family of parallel lines in the square which the wrapping loop through $u_0$ visits every one of before it closes. Try $w = (2, 3)$ and $k_0 = (3, -2)$ with a pencil. So the points sharing the slow counts are exactly the closed slide, and the conditional expectation is the slide average. That is why the paper writes $\mathbb{E}[I \mid \text{slow}]$ and means $\mathcal{E}_w I$.

**The projection view.** In the space of functions on the torus with inner product $\langle f, g\rangle = \int f \bar g$, the waves are orthonormal, and $\mathbb{E}[\cdot \mid \text{slow}]$ is the orthogonal projection onto the span of the waves with recipes in $L$. Two consequences follow at once. Projections are idempotent: averaging twice changes nothing. And projecting onto a subspace and then onto a smaller subspace inside it is projecting onto the smaller one. In probability this is the *tower property*, $\mathbb{E}[\mathbb{E}[X \mid S_1] \mid S_2] = \mathbb{E}[X \mid S_2]$ when $S_2$ carries less information than $S_1$. For slides: keeping the recipes with $k \cdot w = 0$ and then those with $k \cdot w' = 0$ keeps the intersection. Section 10 builds its hierarchy on this.

**Why "linear" matters.** The conditional expectation respects sums and scalings. Any linear rule on pictures that cannot see the fast phases factors through it. A nonlinear rule need not: $\int I^2$, the picture's energy, is unchanged by every slide but is not a function of the average. Two pictures with the same average can have different energy.

### Four things the theorem already says

> **Corollary.**
> 1. *The tent.* Two families slid together, $w = (1, 1)$: the kept recipes are $(a, -a)$, so the average is a function of the difference $D$ alone, $\mathcal{E}_w I = T_I(D)$, with $T_I(\Delta) = \int_0^1 I(v, v - \Delta)\,dv$, the picture averaged along the diagonal line that sits $\Delta$ below the main one. For two strokes it is a saturating tent: flat where one stroke lies inside the other, rising at unit slope while they separate, flat again once they clear. Not a sine.
> 2. *The mean.* A slide whose rates have no common measure, averaged for a long time, keeps only $k = 0$: the plain mean of the picture, with every family's phase independent of every other's. (A remark rather than a case, since the theorem wants whole numbers; Section 10 proves it.)
> 3. *Every zero-sum at once.* The diagonal slide $w = (1, \dots, 1)$ keeps every recipe whose entries sum to zero: every difference of two counts and every three-family recipe like $(1, 1, -2)$, all at once. A recipe whose entries do not sum to zero, like the octave $(2, -1)$, needs a slide of its own, $w = (1, 2)$.
> 4. *A long exposure is a slide.* Animate the families at whole-number rates $r = (r_1, \dots, r_K)$ members per second and expose for one second: the film records $\mathcal{E}_r I$. The shutter keeps exactly the recipes with $k \cdot r = 0$, and which pattern the photograph shows is a matter of arithmetic.

**The tent, in words.** Two families of strokes, each covering a fraction $d$ of its pitch, slid through one member each and averaged, as a function of $D$. Where $D$ is a whole number the strokes lie on each other and the ink is $d$; as they separate the ink rises at unit slope; once they clear, at $|D| = d$, it saturates at $2d$ and stays there. The dashed curve a theory of sinusoids would predict is a cosine. The flat top is why a beat of strokes looks crisp. Note the sign: on paper a coincidence is where the strokes overlap and the ink is *least*, so the light bands of a printed pair are the coincidences. The depth of the tent is $d$ until the strokes cover half their pitch and shrinks after, which is why thickening a pen past half the pitch only darkens the page.

> **Check yourself.** Two families, $w = (1, 1)$, and the picture $I = g_1(u_1)g_2(u_2)$ of two fifty-percent strokes, each covering $|u| < \tfrac14$. What is $\mathcal{E}_w I$ as a function of $D$?
>
> *Answer.* Directly: sliding both strokes together, the fraction of the period during which both are on is the overlap of two windows of width one half whose centres are $D$ apart, which is $\tfrac12 - |D|$ for $|D| \le \tfrac12$, periodic: a tent, one half at $D = 0$, zero at $D = \pm\tfrac12$. By waves: the kept recipes are $(a, -a)$ with coefficients $(\sin(a\pi/2)/a\pi)^2$, and the series sums to the same tent. At $D = 0$ it needs $\sum_{a \text{ odd} > 0} 1/a^2 = \pi^2/8$, a classical sum you may take on trust or check numerically: the first hundred terms give $0.2495$ against the tent's $\tfrac14$.

### The long exposure, measured

Case 4 is a physical prediction, and it was not sought: it fell out of the theorem and was measured the same afternoon. Two families of lines at pitches $16.4$ and $8$ carry an octave beat, recipe $(2, -1)$, a few percent of the ink and invisible on a still under the lines themselves. Animate them at rates $(1, 2)$, the slide that keeps $(2, -1)$, and expose for one period: the octave beat is kept to $0.09\%$ of its strength on the still. Animate at $(1, 1)$ or $(2, 1)$ and the same exposure washes it away, $14{,}668$ times down. The photograph is not post-processing. It is what a slow observer of a moving pair already computes. Script `exposure.mjs`.

> **Try it.** Two combs, or two pieces of window screen, one held still and one moved steadily across it, photographed with a phone in night mode. The members smear to grey; the bands survive, and move at the rate the count difference changes. Move the second screen at twice the speed of the first, both moving, and a different set of bands survives: case 4 on a kitchen table.

---

## 7. What pooling sees: the soft version

An eye does not slide anything by exactly one member. It blurs: it averages the superposition over a small neighbourhood, with some weight $W$ that is large at the centre and falls off at a distance $\rho$. What does a blur see? The same thing, softly.

### Convolution and the response of a window

Blurring a signal $S(x)$ with a weight $W$, nonnegative, total weight one, symmetric about zero, means replacing each value by the weighted average of its neighbours:
$$(S * W)(x) = \int S(x - z)\,W(z)\,dz.$$
Look a displacement $z$ away, weight by $W(z)$, add up. Averaging in time with a slow meter is the same formula in $t$. A window of width $\rho$ is the unit window stretched, $W_\rho(z) = \rho^{-2}W(z/\rho)$ in the plane.

Feed a plain wave $S(x) = e^{2\pi i \nu \cdot x}$ into the blur:
$$(S * W)(x) = e^{2\pi i \nu \cdot x} \int e^{-2\pi i \nu \cdot z} W(z)\,dz = \widehat W(\nu)\,e^{2\pi i \nu \cdot x}.$$
The wave comes out as itself times a number $\widehat W(\nu)$, the window's *response* at rate $\nu$, real by the symmetry of $W$. This $\widehat W$ is the Fourier transform of $W$: the same hat as a Fourier coefficient, but for a function on the whole plane, it is a function of a continuous rate rather than a list indexed by whole numbers. Cousins, not the same object. Stretching gives $\widehat{W_\rho}(\nu) = \widehat W(\rho\nu)$. Two properties: $\widehat W(0) = 1$, a constant passes unchanged; and for $|\nu|$ large compared with $1/\rho$ the response is nearly zero. A blur is a *low-pass* filter, passing rates below about $1/\rho$ and blocking those above.

> **Example (the Gaussian).** On the line, $W(z) = e^{-z^2/2}/\sqrt{2\pi}$ has response $\widehat W(\nu) = e^{-2\pi^2\nu^2}$. Complete the square in the exponent, $-z^2/2 - 2\pi i\nu z = -(z + 2\pi i\nu)^2/2 - 2\pi^2\nu^2$, and the remaining integral is one: shifting a Gaussian by a purely imaginary amount does not change its integral. This is the second fact taken on trust, a short contour argument you can also check numerically. In the plane the stretched Gaussian has response $e^{-2\pi^2\rho^2|\nu|^2}$. A flat window, constant on an interval, has a sinc response, the pulse train's coefficients again.

The window's *second moment* $m_2 = \int |z|^2 W(z)\,dz$ measures its width squared, and the stretched window's is $m_2\rho^2$. It enters the remainder below because the curvature error of Section 4 is at most $\tfrac12\kappa|y - x|^2$, and the average of $|y - x|^2$ under $W_\rho$ is exactly $m_2\rho^2$.

> **Check yourself.** A Gaussian blur of width $\rho = 2$ pixels on a family of pitch $3$ pixels and its difference beat of pitch $30$ pixels. What fraction of each survives?
>
> *Answer.* Rates $\tfrac13$ and $\tfrac1{30}$ per pixel; $e^{-2\pi^2 \cdot 4 \cdot \nu^2}$ gives $e^{-8.77} \approx 1.5 \times 10^{-4}$ for the members and $e^{-0.088} \approx 0.92$ for the beat. The blur is nearly blind to the carrier and nearly transparent to the beat, which is the whole experience of squinting at a moiré.

### A window is a multiplier on the torus

> **Theorem (a window is a multiplier on the torus).** Let $W$ be a symmetric window of total weight one and second moment $m_2$, and $W_\rho$ the same window stretched to width $\rho$. Write $\nu_k(x)$ for the local rate of the combined count $k \cdot \xi$ at $x$, and $\kappa$ for the largest second derivative of the counts. If the picture's waves are summable, $\sum_k |k|\,|\hat I(k)| < \infty$, then
> $$(S * W_\rho)(x) = \sum_k \hat I(k)\;\widehat W\big(\rho\,\nu_k(x)\big)\;e^{2\pi i\,k \cdot \Phi(x)} + R(x), \qquad |R(x)| \le \pi\,\kappa\,m_2\,\rho^2 \sum_k |k|\,|\hat I(k)|.$$
> A blur sees the picture on the torus with each recipe's wave multiplied by the window's response *at that recipe's own local rate*, plus a remainder that is second order in the width of the blur and proportional to the curvature of the state map.
>
> *Proof.* Near $x$, $k \cdot \Phi(y) = k \cdot \Phi(x) + \nu_k \cdot (y - x) + k \cdot E(y)$. Ignoring $E$, each term is a plain wave at rate $\nu_k$ times a constant, and the blur multiplies it by $\widehat W(\rho\nu_k)$. Restoring $E$, the factor $e^{2\pi i\,k \cdot E}$ differs from $1$ by at most $2\pi|k||E|$, since a point on the unit circle at angle $\varphi$ is within $|\varphi|$ of $1$; its average under the window is at most $\pi|k|\kappa m_2\rho^2$; summing over recipes gives the bound.

When the local rates split cleanly, the fast ones well above $1/\rho$ and the slow ones well below, which is the beat regime, the multiplier is nearly $1$ on the slow recipes and nearly $0$ on the fast, and the blur reports $\mathbb{E}[I \mid \text{slow}](\Phi(x))$: the same conditional expectation as the sharp slide, with the window's small leakage in place of the slide's exact zero. The identity is measured to $9 \times 10^{-8}$ on a geometry without curvature, and with curvature the remainder is accounted for by the multiplier's own second derivative to within $3\%$ of itself. Script `observer.mjs`.

The textbook explanation of the bands of two printed gratings as "what survives a blur" is this theorem's soft case, said once per point rather than once per picture. The gain from saying it per point is that it now covers rings, spirals and bent rulers, where the rates differ from place to place and a single global Fourier transform has nothing to say.

---

## 8. The observer theorem, and who can see a beat

An eye is not a blur. A photoreceptor saturates, an ear rectifies, a detector thresholds, a film has a gamma. Real observers apply some *front end* $N$ to the signal at each instant, and pool afterwards. The coincidence detector of Section 1 is the extreme case, a front end that outputs nothing unless both clicks are present. Does a front end change where the pattern is?

> **Lemma (a front end changes the picture, never the geometry).** For any function $N$ of one number, $N \circ (I \circ \Phi) = (N \circ I) \circ \Phi$.

This is the associativity of composition, and it is the most useful line in the whole theory. Applying $N$ to the superposition is the same as applying $N$ to the picture on the torus and then looking the new picture up at the same state. The state map, and with it every combined count, every rate and every value of $\eta$, is untouched. Which recipes are slow, and where, is a property of the geometry that no observer can change. An observer chooses only its picture.

Return to the map and the legend. A colour-blind reader, a reader with sunglasses, a reader who photocopies the map in black and white: each sees a different legend. None of them sees a different map.

> **Theorem (universality of the third pattern).** Let an observer $O$ be any front end $N$ followed by any pooling window $W_\rho$, followed by anything at all. Then at every point it reports the picture $N \circ I$ filtered by the multiplier of Section 7, and in the beat regime
> $$O(S)(x) = \mathbb{E}\big[\,N \circ I \mid \text{slow}\,\big]\big(\Phi(x)\big).$$
> The set of slow recipes is the geometry's alone. An observer chooses only the picture it averages and the leakage of its window.
>
> *Proof.* The lemma turns the observer into a blur of the superposition with picture $N \circ I$, whose coefficients are summable whenever $N$ is smooth and $I$'s are; the multiplier theorem applies. Whatever is applied after the window acts on a function of the result and cannot reintroduce a recipe the window removed.

**Order matters, and the theorem says how.** An observer that pools first and responds after sees $g(\mathbb{E}[I \mid \text{slow}])$: the plain average with its contrast re-mapped, a function of the slow counts and so carrying no recipe outside the kept set. An observer that responds first sees the average of a *different picture* $N \circ I$: the same slow recipes, with different strengths, and possibly recipes the original picture never carried at all. Both are averages of a picture on the same torus along the same fast directions. That is the precise sense in which the third pattern is not the observer's: every observer that pools before it decides reports an average along the fast directions, and only the picture is its own.

### Who sees a beat

Return to the click trains. Two trains of clicks in the air *add*: the pressure at your eardrum is the sum. Two gratings printed on transparencies and held to the light *multiply*: light gets through where both are clear. Two gratings thrown on a wall by two projectors add again. The difference sounds like bookkeeping and is the whole reason a beat in the air needs an ear and a beat on paper does not.

On the torus the two cases are two pictures. Write $g_1$ for family 1's *profile*, one where a click or a stroke is and zero between, as a function of that family's count, and $g_2$ for family 2's. An additive superposition has the picture $g_1(u_1) + g_2(u_2)$ and a multiplicative one has $g_1(u_1)\,g_2(u_2)$. Section 5's four structural facts do the rest.

> **Theorem (who sees a beat).** Call a recipe $(a, b)$ *cross* when both entries are nonzero.
> 1. An additive picture has no cross recipes: its waves are $(n, 0)$ and $(0, n)$ only. A slide along $(1, 1)$ removes every one of those but the constant, so a linear pooling observer sees a uniform grey in an additive superposition, and no beat, ever.
> 2. A multiplicative picture carries every cross recipe with strength $\hat I(a, b) = \hat g_1(a)\,\hat g_2(b)$: a linear observer sees the beat, with the strength of the two harmonics that make it.
> 3. A front end that bends, $N'' \ne 0$, mints cross recipes out of an additive picture. Squaring the sum gives a middle term $2g_1g_2$, a product: the difference recipe appears with strength $\hat g_1(1)\hat g_2(1)/2$ when the sum is normalised to $(g_1 + g_2)/2$.

Measured: the additive beat under a linear observer is $8 \times 10^{-17}$, zero to the precision of the arithmetic; the printed beat is $0.081$; a squaring front end mints the additive beat at $0.040$, exactly half the printed value. A saturating front end $\min(g_1 + g_2, 1)$, a photoreceptor that cannot respond past full, mints it at $0.080$, and that is not a coincidence: for two profiles that are $0$ or $1$, $\min(g_1 + g_2, 1)$ equals $g_1 + g_2 - g_1 g_2$, which is exactly the picture of two inks painted one over the other. A saturating observer of two added lights sees the beat of the printed pair. Script `observer.mjs`.

This is the coincidence detector of Section 1, explained. A detector that fires only when both clicks are present is a front end that multiplies, because "both" is a product. Its picture on the torus is the small square where both counts are near a whole number, a picture with every cross recipe in it, and the slowest cross recipe is $D$. The detector's output is a wave in $D$, once per unit of $D$, once per second, and nothing else survives its pooling. It is also Helmholtz's combination tone: two tones in the air have no difference tone between them until an ear, which is not linear before it pools, makes one. The distinction is not between kinds of observer. It is between kinds of superposition, and the theorem puts it in the only place it can be: which recipes the observer's picture contains.

### Hard patterns are observer-proof, soft ones are not

> **Corollary (hard patterns).** (a) If the picture takes only the values $0$ and $1$, a printed pair, ink or no ink, then for any front end, $N \circ I = N(0) + (N(1) - N(0))\,I$: every observer sees the same recipes at the same relative strengths, and differs from every other only by a constant and a gain. (b) If each *profile* takes only the values $0$ and $1$, hard-edged clicks or strokes, added or multiplied, then $g_i^2 = g_i$, so any polynomial front end produces only products of the profiles themselves, and a harmonic a profile lacks can never be minted: a duty null survives every front end.

The proof of (a) is the display: a function of a variable that takes two values is determined by its two values, and any such function is affine. For (b), every term of $N(g_1 + g_2)$ is a monomial which for two-valued profiles is $g_1 g_2$, $g_1$, $g_2$ or $1$. Measured: the octave null under a linear and a squaring observer agree to $2 \times 10^{-17}$.

> **Corollary (soft patterns).** Blur the edges of a fifty-percent train symmetrically. Its even harmonics stay exactly zero, so every linear observer keeps the null at every blur. A front end that squares the *profile*, which for a multiplied pair is any squaring and for an added pair is a cubic (the term $g_1^2 g_2$), reopens the null with a strength that grows linearly in the width of the blur.
>
> *Proof.* A symmetric smoothing preserves the half-turn antisymmetry $g(u + \tfrac12) = 1 - g(u)$, and a function with it has no even harmonics. On a blurred edge $g$ takes values strictly between $0$ and $1$, so $g^2 \ne g$ there and nowhere else; squaring breaks the antisymmetry exactly on the edges, and the even harmonics it mints scale with their width. For an added pair the square $(g_1 + g_2)^2$ contains each profile only to the first power in its cross term, so the profile's own square first appears at the cube.

Measured on printed strokes whose edges are softened over $0.35$, $0.70$ and $1.40$ units of a $16.4$-unit pitch: the linear null holds at every softening, and squaring reopens it at $3 \times 10^{-3}$, $7 \times 10^{-3}$ and $10^{-2}$, linear in the softening.

### The same theorem in an ear

Everything so far was measured in a drawing tool. The theorem does not know that. Take two pulse trains at $200$ and $405$ clicks per second, a mistuned octave whose slow recipe is $(2, -1)$, beating five times a second. Add them as sounds add and listen through four model ears: a low-pass filter alone (a linear ear), a squaring front end followed by the low-pass (the textbook square-law detector), a cubing front end, and a two-stage ear that squares, pools, and squares again. Sweep the lower train's duty from thirty to seventy percent and read the line at five hertz in the output. Script `ear.mjs`.

Three things were predictions before they were curves.

- The linear ear hears no beat at any duty, $4 \times 10^{-6}$ of what the square-law ear hears, because a sum of trains has no cross recipe.
- Every nonlinear ear loses the beat at duty one half, because the beat rides the lower train's second harmonic and a fifty-percent train has none. The nulls are $10{,}201$, $181$ and $8{,}564$ times deep under the three ears: the same duty null that Section 9 measures on paper, in sound, through three different ears at once.
- Softening the pulses separates the ears. A square-law front end's cross term is a product of one harmonic from each train, so it inherits the lower train's missing second harmonic and keeps the null, $132{,}480$ times deep. A cubic front end's $g_1^2 g_2$ term carries the *square* of the lower train, whose second harmonic is not zero once the edges are soft, and the null reopens to within $3.3$ times of its neighbours.

That last one is a prediction about people. *Which nonlinearity an ear has is audible*, in a mistuned octave of blurred square waves, as the presence or absence of a five-hertz beat. The listening test has not been done. Section 14 says what it would take, and it is cheap.

> **Try it.** Any synthesizer with a pulse-width control. Two oscillators, pulse waves, at $200$ and $405$ hertz. Set the lower one's width to thirty percent and you hear a five-per-second throb; set it to fifty percent and the throb goes, though both tones are still there; seventy percent and it is back. Your ear is the nonlinearity. Then put a gentle low-pass filter on each oscillator so the edges soften, and listen at fifty percent again: if the throb comes back, your ear's front end is not a square-law.

---

## 9. Which pattern emerges: arithmetic decides

Every recipe is present in a multiplicative picture, and a bent front end puts most of them into an additive one. Which of them do you see? Two ingredients decide it. One is slowness: how small the recipe's heterodyne ratio is. The other is strength: how much of the picture the recipe carries, which for anything with edges falls off with the harmonics. The theory of two sinusoids, the textbook theory of beats, has only the first ingredient, because a sinusoid has one harmonic and nothing to choose between. Families with edges have both, and the visible pattern is the one that is slow *per unit of strength*.

> **Definition (the priced merit).** For a recipe $(a, b)$ with $ab \ne 0$, the *priced merit* is the heterodyne ratio charged the product of the harmonic orders that carry the recipe,
> $$\mu_{a,b} = \eta_{a,b} \cdot |ab|.$$
> The visible recipe is the one with the smallest priced merit, and it shows as a beat when $\mu < \tfrac14$. A first-order recipe has $\mu = \eta$; a recipe of order $ab$ is carried by harmonics $ab$ times weaker, and must be $ab$ times slower to show as strongly.

The price is the "who sees a beat" theorem read backwards. Without it the question has no answer. Every real ratio of pitches has rational approximations as good as you like, so at any point some recipe of enormous order is slower than every other, carried by harmonics no stroke has. A pair at the ratio $\sqrt2$ has a recipe $(41, -29)$ with more than three thousand members per band and nothing to draw them with. With the price, comparable slowness resolves toward the lower order, and the minimum is a definite recipe at every point.

### Continued fractions, taught

For a real $x > 0$, write $x = a_0 + 1/x_1$ with $a_0 = \lfloor x \rfloor$ and $x_1 > 1$; then $x_1 = a_1 + 1/x_2$, and so on. The whole numbers $a_0; a_1, a_2, \dots$ are the *partial quotients* and the $x_n$ are the *complete quotients*, $x_n = [a_n; a_{n+1}, \dots]$. Rational $x$ terminates; irrational $x$ does not. Examples: $\pi = [3; 7, 15, 1, 292, \dots]$; $\sqrt2 = [1; 2, 2, 2, \dots]$; the silver ratio $1 + \sqrt2 = [2; 2, 2, 2, \dots]$; the golden ratio $\varphi = [1; 1, 1, 1, \dots]$.

Truncating gives fractions $h_n/k_n = [a_0; a_1, \dots, a_n]$, the *convergents*, computed by the recurrences
$$h_n = a_n h_{n-1} + h_{n-2}, \qquad k_n = a_n k_{n-1} + k_{n-2},$$
starting from $(h_{-1}, k_{-1}) = (1, 0)$ and $(h_{-2}, k_{-2}) = (0, 1)$. For $\pi$: $3/1$, $22/7$, $333/106$, $355/113$. Two identities, both by induction: $h_{n-1}k_n - h_n k_{n-1} = (-1)^n$, and $x = (x_{n+1}h_n + h_{n-1})/(x_{n+1}k_n + k_{n-1})$, obtained by replacing the tail of the expansion by its exact value.

> **Fact (the error of a convergent).** $|k_n x - h_n| = \dfrac{1}{x_{n+1}k_n + k_{n-1}}$.
>
> *Proof.* From the second identity, $k_n x - h_n = \dfrac{h_{n-1}k_n - h_n k_{n-1}}{x_{n+1}k_n + k_{n-1}} = \dfrac{(-1)^n}{x_{n+1}k_n + k_{n-1}}$.

So a convergent is a good approximation exactly when the *next* complete quotient is large. $22/7$ is excellent for $\pi$ because $x_2 = 15.996$, and $355/113$ is famous because $x_4 = 292.6$. Two classical theorems are the third and fourth facts taken on trust: every convergent is a best approximation, no fraction with a smaller denominator is closer (Lagrange); and for every irrational $x$ infinitely many fractions satisfy $|x - h/k| < 1/(\sqrt5 k^2)$, while no constant larger than $\sqrt5$ works for every $x$ (Hurwitz). The number that makes $\sqrt5$ sharp is the golden ratio, whose partial quotients are all $1$, the smallest possible: it is the *worst approximable* number, and the error formula shows why, because $k_n|k_n x - h_n| = 1/(x_{n+1} + k_{n-1}/k_n) \to 1/(\varphi + 1/\varphi) = 1/\sqrt5$ for it.

There is a pleasant irony here. The golden ratio is the number that pop mathematics loves for being everywhere, and the number that this theory identifies as the ratio at which two families are least able to produce anything visible. Its fame in the arts and its invisibility in beats have the same cause: it is the number fractions approach most reluctantly.

### From approximation to slowness

Two parallel families of pitches $s_1$ and $s_2$, ratio $x = s_1/s_2 > 1$. The recipe $(h, -k)$ has rate $h/s_1 - k/s_2 = (h - kx)/s_1$, so it is slow exactly when $h/k$ approximates $x$ well, and the recipes that beat every lower-order recipe are the convergents.

> **Proposition (selection is best approximation).** For two parallel families, the recipes that beat every lower-order recipe as the order grows are exactly the convergents of the continued fraction of $s_1/s_2$: $207$ of $207$ ratios measured, without exception. In the plane, where the rates are vectors, the minimiser is found at every point by Lagrange–Gauss reduction of the lattice $\{a\nabla\xi_1 + b\nabla\xi_2\}$, and the reduction names the brute-force winner in $99.8\%$ of $4{,}000$ random pairs. Script `convergents.mjs`.

### Lattices and Lagrange–Gauss reduction, taught

Two vectors $v_1, v_2$ in the plane, not parallel, generate the lattice $\{av_1 + bv_2 : a, b \in \mathbb{Z}\}$, a regular grid of points. Many pairs generate the same grid: $(v_1, v_2)$ and $(v_1, v_2 + v_1)$ do, and in general any pair obtained by whole-number combinations with determinant $\pm1$. The grid has a well-defined shortest nonzero vector, and a basis in which $v_1$ is a shortest vector and $v_2$ is as short as it can then be is called *reduced*.

The reduction algorithm: given $(u, v)$ with $|u| \le |v|$, replace $v$ by $v - mu$ with $m = \operatorname{round}(u \cdot v/|u|^2)$, the whole number that makes the new $v$ as short as possible in the direction of $u$; if the new $v$ is shorter than $u$, swap them; repeat until nothing changes. It is the Euclidean algorithm with vectors: subtract the right multiple, swap, repeat. It stops when $|u| \le |v|$ and $|u \cdot v| \le \tfrac12|u|^2$.

> **Fact (a reduced basis begins with a shortest vector).** If $|u| \le |v|$ and $|u \cdot v| \le \tfrac12|u|^2$, then every nonzero lattice vector $au + bv$ has length at least $|u|$, and at least $|v|$ if $b \ne 0$.
>
> *Proof.* $|au + bv|^2 = a^2|u|^2 + 2ab\,u \cdot v + b^2|v|^2 \ge a^2|u|^2 - |ab||u|^2 + b^2|v|^2$. If $|a| \ge |b|$ the first two terms are at least zero and the whole is at least $b^2|v|^2$. If $|b| > |a|$, use $|u| \le |v|$ on the middle term: the whole is at least $|v|^2|b|(|b| - |a|) \ge |v|^2$.

In one dimension, with $u = 1/s_1$ and $v = 1/s_2$, the rounds *are* the continued fraction of $s_1/s_2$, and the intermediate vectors are the rates of the convergents' recipes. That is why the one-dimensional and two-dimensional statements are one statement.

**Example.** The families turned ten degrees apart: $u = (1, 0)$, $v = (0.985, 0.174)$. Then $m = 1$, $v \leftarrow (-0.015, 0.174)$, shorter than $u$, swap. Now $u \cdot v/|u|^2 = -0.49$, $m = 0$, done. The shortest vector is $\nabla\xi_2 - \nabla\xi_1$, the difference beat, at rate $0.174$: what the eye sees when a sheet is turned ten degrees, found now by arithmetic rather than by the heterodyne ratio.

The tool's shader does this at every pixel, then checks a small window of combinations around the reduced basis with the price attached, because the cheapest *priced* recipe need not be the shortest vector.

> **Check yourself.** Reduce the lattice generated by $u = (1, 0)$ and $v = (0.5, 0.02)$. What recipe wins?
>
> *Answer.* $m = \operatorname{round}(0.5)$ is a tie; take $1$: $v \leftarrow (-0.5, 0.02)$, shorter, swap; then $m = -2$, $v \leftarrow v + 2u = (0, 0.04)$, shorter, swap; a final tie leaves $|v| \approx 0.5$: done. The shortest vector is $2v_{\text{orig}} - u_{\text{orig}}$, the recipe $(-1, 2)$: the second family's pitch is about twice the first's, and the octave beat, at rate $0.04$, is what shows.

### Duty nulls

Because a multiplicative picture's strength at a recipe is a product of harmonics, a station is carried by exactly the harmonics its integers name, and a family that lacks a harmonic cannot take part in a station that needs it. That is a prediction the theory of sinusoids cannot make.

> **Theorem (duty nulls).** Let the coarse family's pitch be $a/b$ times the fine family's, in lowest terms. The visible station is the recipe $(a, -b)$, carried by the coarse family's $a$-th harmonic and the fine family's $b$-th. A family whose members cover a fraction $d$ of their pitch has no $a$-th harmonic exactly when $ad$ is a whole number, so the station is extinguished at those duties of the coarse family and at no others. A $2{:}1$ pair's station $(2, -1)$ dies at coarse duty one half; a $3{:}1$ pair's station $(3, -1)$ dies at one third and two thirds.
>
> *Proof.* With pitches $s_c \approx (a/b)s_f$ the combined count $a\xi_c - b\xi_f$ has rate $\approx 0$: it is the slow one, and no recipe of lower order is. Its strength is $\hat g_c(a)\,\hat g_f(-b)$, and $\hat g(n) = \sin(n\pi d)/n\pi$ vanishes exactly when $nd$ is a whole number. A symmetric softening of the edges multiplies each harmonic by a real factor and moves no zero.

Measured on drawn strokes: the $2{:}1$ null at coarse duty one half is $6{,}305$ times deep, the $3{:}1$ nulls at one third and two thirds are $3{,}458$ and $2{,}549$ times deep, and the station strengths track $|\sin(a\pi d)/a\pi|\,|\hat g_f(1)|$ within the drawn edge's softening. Script `dutynull.mjs`.

Two readings. Forwards, a band as an instrument: find the duty at which a station dies and you have measured the family's duty to the precision of the null. Backwards, a warning about what "the beat" is: a $16.4{:}8$ pair also carries the recipe $(1, -2)$, one coarse count minus two fine, a real coefficient with a period of five units and no band anyone can see, and the first version of this experiment measured a null of *that* and called it the station. The station is the slow recipe, not the small one. That mistake was made, caught by a gate, and corrected, and it is worth keeping in view: the arithmetic of which recipe is which is easy to get backwards, and a script that checks its own answer is how you find out.

### The wagon wheel

A strobe is a third place to measure the same theorem. A camera taking $f$ frames per second is a family whose picture is a comb, every harmonic equal, and a wheel whose spokes pass at $r$ per second beats against it. Near $r = f$ the wheel is seen turning at $r - f$, backwards below the frame rate, the wagon-wheel effect of every western. At $r = f/2$ consecutive frames sit half a spoke apart, a pooling eye averages them, and what stands still is a wheel with *twice* the spokes, carried by the spoke profile's second harmonic. So a wheel whose spokes are half the gap wide cannot show it. Simulated on sampled frames: the reversal is exact to $10^{-15}$, the doubled wheel at spoke duty $0.3$ has contrast $0.151$ and tracks $|\sin(2\pi d)/2\pi|$ exactly, and at duty one half it is $2 \times 10^{15}$ times down. Script `wagonwheel.mjs`. The frames are simulated and the eye is not; the prediction for a person is that a wheel with fat spokes never shows the doubled still wheel.

### Stations and deserts

> **Proposition (stations are the convergents with large complete quotients).** Let a pair have pitch ratio $x$ with convergents $h_n/k_n$ and complete quotients $x_{n+1}$. The priced merit of the recipe $(h_n, -k_n)$ is exactly
> $$\mu_n = \frac{2\,h_n k_n}{(h_n + k_n x)\,(x_{n+1}k_n + k_{n-1})},$$
> and the convergent is a station, $\mu_n < \tfrac14$, exactly when $x_{n+1} + k_{n-1}/k_n > 8/(1 + k_n x/h_n)$, a bound within a few percent of $4$. A next partial quotient of $5$ or more guarantees a station and one of $2$ or less forbids one. For the golden ratio $\mu_n \to 1/\sqrt5$; for $\sqrt2$ and the silver ratio it tends to $1/2\sqrt2$. None of those pairs has a station at any order.
>
> *Proof.* Put the convergent's error into the merit $2hk|h - kx|/(h + kx)$; that is the identity. The threshold rearranges $\mu_n < \tfrac14$. Since $a_{n+1} < x_{n+1} < a_{n+1} + 1$ and $0 \le k_{n-1}/k_n < 1$, a partial quotient of five or more puts the left side above $5$ while the right side is at most about $4$; a partial quotient of two or less keeps the left side below $4$. For the golden ratio every complete quotient is $\varphi$ and $k_{n-1}/k_n \to 1/\varphi$, so $\mu_n \to 1/\sqrt5$.

The identity is, up to a factor that tends to one, a classical quantity, Perron's $k_n|k_n x - h_n|$, and $1/\sqrt5$ is Hurwitz's constant. The theory of which beats are visible turns out to be the theory of how well a number can be approximated, priced slightly differently. What is new is the threshold, which reads a pair's stations off its partial quotients, and the *deserts*: a ratio whose partial quotients stay small never beats visibly at any order, however rich the families' harmonics. Measured on $8{,}329$ convergents of $500$ random ratios: the identity agrees with the tool's own scan exactly, the limit holds to $4 \times 10^{-4}$ past the sixth convergent, the partial-quotient rules hold without exception, the golden ratio's merit tends to $0.447$ and the silver ratio's to $0.354$, both above one quarter. Script `stations.mjs`.

| Pair | Ratio | First convergents, stations in bold |
|---|---|---|
| $16.4{:}8 = 41{:}20$ | $2.0500$ | **2/1**, **41/20** |
| $15{:}5$, one turned $2^\circ$ | $2.9982$ | 2/1, **3/1**, **1640/547**, 8203/2736, ... |
| $\sqrt2$ | $1.4142$ | 1/1, 3/2, 7/5, 17/12, 41/29, ... |
| $e$ | $2.7183$ | 2/1, 3/1, 8/3, 11/4, **19/7**, ... |
| $\pi$ | $3.1416$ | **3/1**, **22/7**, 333/106, **355/113**, 103993/33102, ... |

$\pi$ beats at $3$, $22/7$ and $355/113$, because its partial quotients $7$, $15$ and $292$ are large. $\sqrt2$, whose quotients are all $2$, beats at nothing. Two families whose pitches stand in the ratio $\pi$ show a ladder of ever-finer stations; two at the ratio $\sqrt2$ show only a fine hash at every scale.

The desert is in sound too. Two sawtooth tones, every harmonic present and falling like $1/n$, at $200$ and $410$ hertz carry a station line at ten hertz through a square-law ear that is $7.5$ times stronger than the strongest slow line of two sawtooths at $200$ hertz and $200$ times the golden ratio. The prediction for hearing: golden intervals of harmonic-rich tones sound rough, but they never *beat*.

**Stations as places.** Along the axis between two fans of rays from two centres, the local ratio of the two families' rates sweeps through the reals, every rational the price admits owns a stretch of the axis where its recipe is the slow one, and each station's bands sit on its stretch: the ladder of convergents laid out as geography. A pair whose ratio varies has its stations at places, not at settings.

> **Try it.** Two rulers, or two drawn combs, at pitches close to $2{:}1$, ten and nineteen to the inch, show octave bands. Now thicken the coarse comb's ticks with a marker until each covers half the gap: the bands vanish while both combs are plainly still there. Thicken them to two thirds and the bands come back. This is the only test in this document that needs no electricity.

---

## 10. Emergence, iterated

The bands of the ten-and-nine rulers are a family. They have members, the bands; they have a count, which is the difference $D$ itself, rising by one per band; and they have a profile, the tent. So they can beat. Lay a third ruler beside the first two, at a pitch such that its count runs close to $D$, and a pattern of coincidences forms between the third family and the *bands*: a beat of a beat.

> **Proposition (averages compose).** For two slides $w$ and $w'$, averaging along $w$ and then along $w'$ keeps exactly the recipes with $k \cdot w = 0$ and $k \cdot w' = 0$. Pooling observers stacked in a cascade keep smaller and smaller sets of recipes, and the set at each stage is the intersection of the sets before it.
>
> *Proof.* The first average multiplies the wave of recipe $k$ by $1$ if $k \cdot w = 0$ and $0$ otherwise, and the second does the same with $w'$; the product of the two indicators is the indicator of both conditions at once.

So a hierarchy of poolings is a hierarchy of recipe sets, and what a late stage sees is a pattern in the counts the earlier stages left alone. For three families the diagonal slide $(1, 1, 1)$ keeps every zero-sum recipe: the three pairwise differences and, among others, $(1, -2, 1)$, the difference of two differences. That last recipe is the beat of beats, and whether an observer can see it depends on what its front end can reach.

> **Theorem (beats of beats need a front end of order four).** Let three *pure* tones, sinusoids carrying only their first harmonic, add, with pairwise slow differences at rates $\delta_1$ and $\delta_2$ nearly equal. The recipe $(1, -2, 1)$, at rate $|\delta_1 - \delta_2|$, has order four. A front end that is a polynomial of degree $n$ mints from pure tones only recipes of order at most $n$, so a square-law front end and a cubic one leave the beat of beats silent. A cascade that squares, pools, and squares again reaches it, because its first stage mints the two pairwise beats and its second multiplies them. A multiplicative superposition of the three carries the recipe at linear order, and a plain blur sees it.
>
> *Proof.* A pure tone's wave has recipe $\pm1$ in its own count and $0$ in the others. The $n$-th power of a sum of three such waves expands into monomials whose recipes have $|k_i| \le e_i$ with $\sum e_i = n$, hence order at most $n$; the recipe $(1, -2, 1)$ needs four factors, which a square or a cube does not have. The cascade's first square mints $(1, -1, 0)$ and $(0, 1, -1)$; the pooling keeps them; the second square multiplies two real waves, and by the product-to-sum identity of Section 5 the product carries their difference, $(1, -2, 1)$.

Measured, on three sinusoids at $300$, $330$ and $363$ hertz, pairwise beats at $30$ and $33$, beat of beats at $3$, as a fraction of a first-order beat's strength: a square-law ear hears the three-hertz line at $8 \times 10^{-5}$, a cubic ear at $2 \times 10^{-7}$, the cascade at $13\%$, and a multiplicative trio through a plain low-pass at $50\%$. Script `ear.mjs`. The prediction for hearing is that second-order beats of pure tones are heard only by a system whose front end reaches order four, two stages of detection or one stage of high order. The psychoacoustics of "second-order beats" has data the theorem constrains.

### What "emergence" means here

The word is used loosely often enough that it is worth saying exactly what is claimed. The third pattern is a new family: it has members and a count, and the count is a combined count of the parts. It is absent from every linear description of the parts: an additive superposition has no cross recipe, so no linear functional of the parts, no spectrum, no filter, contains it. It appears only to observers that pool after a nonlinearity, or in superpositions that multiply. And yet its geometry, where its members are, how fast its count runs, whether it exists at all, is fixed by the parts alone, through $\Phi$, and is the same for every observer that can see it. That is emergence with a theorem attached.

### Symmetry, invariants, quotients

The theorem needs a few words from the theory of symmetry, which are easier than they sound. Sliding the picture, $I \mapsto I(\cdot + h)$, by every $h$ on a line through the origin of the torus, whole and fractional amounts alike, is a *group* of transformations: two slides compose to a slide and every slide has an inverse. Call the set of these slides $H$. The *orbit* of a picture is the set of all its slid copies. A picture is *invariant* if every slide leaves it unchanged; a rule on pictures is invariant if it is constant on each orbit. The *quotient* of the pictures by $H$ is the set of orbits: two pictures count as the same point of the quotient exactly when one is a slid copy of the other, and a function on the quotient is nothing but an invariant rule. That is all "quotient by a symmetry" means.

Averaging makes invariants. The average $\mathbb{E}_H I$ over all slid copies is invariant, since sliding it again only relabels the copies. And it is the most economical invariant.

> **Proposition (the third pattern is the universal invariant).** Fix a set of fast directions on the torus and let $H$ be the set of all slides along them. Call a rule $F$ that assigns a number to a picture *linear* if it respects sums and scalings. Then every linear rule that gives the same number for a picture and for every rephased copy of it is a function of the averaged picture alone: $F(I) = F(\mathbb{E}_H I)$. And every rule applied to $\mathbb{E}_H I$ is unchanged by rephasing. What can be measured of a superposition without knowing the fast phases is exactly what can be measured of its third pattern.
>
> *Proof.* Average the invariance over $H$: $F(I)$ equals the average over $h$ of $F(I(\cdot + h))$, and a linear rule passes through an average, so that equals $F$ of the average of $I(\cdot + h)$, which is $F(\mathbb{E}_H I)$.

The word *linear* cannot be dropped: the energy $\int I^2$ is unchanged by rephasing and is not a function of the average. But the observers that matter physically are not linear rules on the picture; they are front ends followed by pooling, and for those the universality theorem already said that the picture is theirs and the geometry is not. In the philosophers' terms this is *weak* emergence, the new pattern is in principle derivable from the parts, made exact: a new family, with a new count, that no member of the parts' description contains, produced by a quotient that is exact rather than approximate, and exactly computable at every stage of the hierarchy. It is a better claim than strong emergence made vague.

### Evenly spread lines: Weyl's theorem

One promise from Section 3 and case 2 of Section 6 remains. A line $u_0 + tw$ on the torus with $w_1/w_2$ irrational never closes, and it does more: in the long run it spends equal time in equal areas. Proof by waves: for a recipe $k \ne 0$, the average of $e^{2\pi i\,k \cdot (u_0 + tw)}$ over $0 \le t \le T$ has modulus at most $2/(2\pi T|k \cdot w|)$, which tends to zero as $T$ grows as long as $k \cdot w \ne 0$, and $k \cdot w$ is never zero for whole numbers $k \ne 0$ when $w_1/w_2$ is irrational. So the time average of every nonconstant wave tends to zero, and the time average of any picture tends to its mean. Rational slopes close up and keep the recipes orthogonal to them; irrational ones keep nothing but the mean. That dichotomy, between closed orbits at rational ratios and evenly spread ones at irrational ratios, is the same dichotomy as stations against deserts, seen from the torus. The general theorem behind it, that time averages along a motion converge to space averages over what the motion fills, is the ergodic theorem; the case the theory needs was just proved.

> **Try it.** Three oscillators on a synthesizer, sine waves, at $300$, $330$ and $363$ hertz. You will hear two fast throbs, at thirty and thirty-three per second, and the question is whether you also hear a slow one, three times a second. Run the mix through a distortion effect and then a low-pass, one stage: no three-hertz throb should appear. Run it through distortion, a low-pass at about fifty hertz, and a second distortion: it should. If your unaided ear hears the slow throb, that is data about the order of your ear's front end.

---

## 11. When counting fails

Everything so far took the count for granted. Here is what it is, exactly. A family is a set of members with a numbering, and the count at a point $x$ is the number $c$ such that $x$ lies on the interpolated member $c$: the solution of an equation
$$F(x, c) = 0, \qquad \text{"$x$ is on member $c$."}$$
For a ruler of pitch $T$, $F(x, c) = x/T - c$ and $\xi = x/T$. For concentric rings a distance $s$ apart, $F(x, c) = |x| - cs$ and $\xi = |x|/s$. For a family of rays from a point, member $c$ is the ray at angle $c$ times the step, and the solution is the polar angle divided by the step, which is where the trouble starts.

### The implicit function theorem

> **Fact (implicit function theorem).** Let $F(x, c)$ be smooth with $F(x_0, c_0) = 0$ and $\partial F/\partial c \ne 0$ there. Then near $x_0$ there is a unique smooth function $c(x)$ with $F(x, c(x)) = 0$, and its gradient is $\nabla c = -\nabla_x F/(\partial F/\partial c)$.

The partial derivative $\partial F/\partial c$ is the rate at which $F$ changes when the member index is nudged with $x$ held still. The idea of the proof: near the point, $F$ is nearly linear, and if the coefficient of $c$ is nonzero the linear equation can be solved for $c$; the theorem says the nonlinear one can too, nearby. Ruler: $\partial F/\partial c = -1$ everywhere. Rings: fine away from the centre. Rays: fine locally everywhere except the centre, but the polar angle is not a single function on the plane.

> **Theorem (trichotomy).** The count of a family in the plane exists in exactly one of three ways. *As a formula:* a single smooth function on the whole plane, the exact rung (lines, rings, polygons, spirals, waves). *Up to a whole number:* a function on the plane with a point removed, which gains a whole number each time a loop goes round the point, the winding rung (the rays are the prototype; a family built on the polar angle has a *defect* at the point, with a *charge* that is the whole number gained). *Only as a search:* where two members pass through the same point at the same interpolated index, $\partial F/\partial c = 0$, the count branches, no relabelling repairs it, and the nearest member must be found by looking, the fold rung (the walking families).
>
> *Proof.* Where $\partial F/\partial c \ne 0$ the local solutions exist. They glue into one function on the plane exactly when carrying a value round any loop brings it back to itself; if it comes back changed, the change is a whole number, it depends only on which points the loop encloses, and it is the winding of the family about those points. Where $\partial F/\partial c = 0$ two members meet $x$ at the same index to first order, like $c^2 = x$ at $x = 0$, and just past such a point the equation has two solutions on one side and none on the other; the local pieces join at a crease instead of overlapping.

A family in time, like the click trains, has no loops to wind around and members that never cross, so its count is always a formula. The failures are a property of the plane.

### Defects: winding, and why bands must end

Around the origin of the plane the angle can be chosen continuously along any path, but going once round the origin brings it back to its start plus one full turn. No continuous choice on the whole punctured plane exists; try, and somewhere a cut appears where the value jumps by a turn. The *winding number* of a loop about the origin is the number of turns the angle gains along it. It is a whole number, it does not change when the loop is deformed without crossing the origin, and it adds. The map $t \mapsto e^{2\pi i t}$ wraps the line round the circle infinitely often, like a helix over a circle, and a count built on the polar angle lives on such a helix over the punctured plane. The whole number a loop gains is its *monodromy*. Escher drew the staircase that returns one floor up; the polar angle is that staircase, and the count of a ray family walks it.

Add to a family's count the polar angle about a point divided by a full turn, times a whole number $q$. Nothing about the members changes away from the point, but the count now gains $q$ around any loop that encloses it, and so does the difference $D$ against an unmodified twin. The bands of that pair are the level lines of $D$, and a level line has to leave a loop as often as it enters, unless the value of $D$ is not the same after one circuit, in which case $q$ lines that enter never leave. So $q$ bands *end* inside any loop round the point, and since winding adds, the signed number of endings inside any loop is $q$ times the number of enclosed points. That is the fork grating of optics, the signature of a wave that winds, built from a count rather than a wavefront. And the count says one more thing: near the point the added count changes at rate $q/2\pi r$, so the heterodyne ratio of the beat is $\eta = qs/2\pi r$ for a family of pitch $s$, which reaches one quarter at $r^\star = 2qs/\pi$; inside that core the beat is not slow enough to be a band. Measured on $22$ loops with charges up to $10$: the count of endings is exact, and the core radius holds to within $10^{-4}$. Script `defects.mjs`.

> **Check yourself.** A field of $3\vartheta/2\pi$ is added to one of two identical line families of pitch $10$. How many bands end inside a loop round the centre, and how large is the core?
>
> *Answer.* Three, with the same sign. $r^\star = 2 \cdot 3 \cdot 10/\pi \approx 19$.

### Folds: fronts, gauges, and the Mach condition

A *walking family* is a nest of curves, circles, squares, hexagons, each grown by a step $s$, displaced by a step $\delta$ and turned by a step $\theta$ more than the last. It is what an artist draws when the rings are not concentric. Its members are the fronts of something that spreads at speed $s$ from a source that moves by $\delta$ and turns by $\theta$ per member, and the family folds exactly where a front's normal speed vanishes: the next member no longer advances past the last at that point.

A convex shape $K$ with the origin inside defines a *gauge* $\gamma(v)$, the scale of the copy of $K$ that just reaches $v$: the shape's own ruler. For the disc it is ordinary length; for a square of half-side one it is $\max(|v_1|, |v_2|)$. A front is the family $\{\gamma(x - c\delta) = cs\}$. Here $\partial F/\partial c = -\nabla\gamma(x - c\delta) \cdot \delta - s$, which vanishes somewhere on a member exactly when $\nabla\gamma \cdot \delta = -s$ can be reached there. For the disc, $\nabla\gamma$ is the outward unit normal, and $n \cdot \delta$ ranges over $[-|\delta|, |\delta|]$ as $n$ goes round. So a ring family folds if and only if $|\delta| > s$: the source outruns its own waves, the *supersonic* case, and the fold is the shock along the wake, the Mach cone of a jet. Subsonic sources nest forever. A front that only turns folds every shape but the circle, at the radius $s/(\theta\sin(\pi/k))$ for the regular $k$-gon, where a vertex of one member first crosses the next. Onsets measured by brute force on families that never saw the calculus are within $2.8\%$ of these radii. Script `foldlaw.mjs`.

Beyond the fold the count is multivalued and no formula exists. Searching for the nearest member is the price of a family whose count has folded, and the instrument pays it with a certificate, an interval of member indices that provably contains every member near the pixel, rather than a guess.

One thing a field cannot do closes the taxonomy. A *field* added to a count replaces $F(x, c)$ by $F(x, c - \phi(x))$: it shifts the solution and leaves $\partial F/\partial c$ alone. So a field can move a family within its rung or lift it from the exact rung to the winding rung by a whole number, and it can never fold one. Folding is a property of the members' geometry; winding is a property of the count; and the third pattern, being a function of counts, inherits the winding and ends where the count does.

> **Check yourself.** Rings of pitch $1$ whose centres step by $\delta = (1.2, 0)$ per member. Do they fold? What if $\delta = (0.8, 0)$?
>
> *Answer.* $|\delta| = 1.2 > 1$: supersonic, they fold along straight wake lines. At $0.8$: subsonic, they nest.

---

## 12. A strobe is a family

A camera taking $f$ frames a second is a family in time whose picture is a comb of instants. Viewed as a periodic function of the frame count, the sampler's profile is a very narrow pulse of duty $d$ at each whole number, and the pulse train's coefficients $\sin(n\pi d)/n\pi$ are, for $d \to 0$, equal to $d$ for every $n$ up to about $1/d$. Normalise by $d$ and a spike has every harmonic at strength one. No delta function is needed; a spike is the limit of narrow pulses, and that limit is the statement. So the price $|ab|$ for a recipe between a spoke profile and the sampler charges only the spoke profile's harmonic; the sampler's harmonics are free.

A spoke passing at rate $r$ against frames at rate $f$ has recipes $(a, -b)$ with rate $ar - bf$. The classical alias is $a = 1$: for $r$ near $bf$ the recipe $(1, -b)$ is slow and the wheel is seen turning at $r - bf$, backwards when $r < bf$. Nyquist's condition, that the alias rate never fall below the true rate for any $b \ge 1$, is $r < f/2$; the wagon-wheel reversal is what happens when it is violated. With harmonics, $a = 2$: for $r$ near $f/2$ the recipe $(2, -1)$ is slow, carried by the spoke profile's second harmonic, and a pooling eye sees a still wheel with twice the spokes, which a fifty-percent spoke duty extinguishes.

So the sampling theorem is a special case of the theory, and the theory refines it: an alias is the station of a signal against its sampler, and the question "when is an alias a *pattern*" has the answer "when it is slow against the signal", $\eta < \tfrac14$. Section 13 will use this to fix the tool's own aliasing.

> **Check yourself.** Spokes at $r = 36$ per second, frames at $f = 24$. What does the eye see?
>
> *Answer.* Recipes $(1, -1)$ at rate $12$ and $(1, -2)$ at rate $-12$ are equally slow; the price breaks the tie, $1$ against $2$, so the wheel is seen turning forwards at $12$ per second. Also $2r - 3f = 0$: the recipe $(2, -3)$ is exactly slow, so if the spokes are narrow a still, doubled wheel is superposed on the moving one; at fifty percent duty only the moving wheel.

---

## 13. The instrument, and the theory turned on its own pixels

Every result above was found in a drawing tool before it was proved, and measured in the tool after. Moiré is a web application that draws superpositions of families the way this document describes them. Each layer is a count $\xi_i$ and a stroke profile; at every pixel the count is evaluated, by a formula for the exact and winding rungs and by a certified search for the fold rung, and the picture on the torus is looked up there and then. No layer is ever drawn into an intermediate image and resampled, so a superposition has no resolution of its own: zooming asks the same counts at new points, and cannot invent a beat that the geometry does not have or destroy one it does. Fourteen families ship, sorted by rung, and a field language adds any function of position to a count.

### The three views

Three of its views are theorems running. The *pooled* view is the sharp slide theorem: the slide average along the schedule the station's recipe asks for, integrated in closed form. Along a slide every layer's coverage is its stroke profile evaluated at a distance that changes linearly with the slide, so the coverage is a cubic polynomial on each stretch between corners, the corners are known from the count, and the average is a sum of integrals of polynomials with known endpoints: exact at every zoom, with no sampling and no noise, certified against a $65{,}536$-point brute-force integral to $7 \times 10^{-5}$ over $480$ scenes by `exactsweep.mjs`. The *ratio* view is the priced merit of the winning recipe at every pixel, found by the lattice reduction of Section 9, drawn as a map that is dark where a beat must form. A *square-law* toggle is the observer theorem: the drawing squared before it is averaged, so that the reopening of a null on soft edges can be watched.

### The theory run backwards: a picture in the count's currency

The field language also runs the theory backwards. A picture with brightness $g$ is a field: give a copy of a layer the index shift $D = \tfrac12(1 - g)$, read from the picture in the copy's own coordinates, and the tent of Section 6 says what any pooling observer sees of the pair. The strokes align where the picture is white and interleave where it is black, so in register the overlay is the picture, at half contrast, and nothing else, grey levels included, since the tent is linear in the offset up to one half. Out of register the same two layers are the classical band moiré with the picture riding on it. The construction is one line because the count is the object: the picture is a slow combination chosen by hand, and the base family is free, concentric circles or anything else, which no straight-grating method reaches.

The picture can also be shared between the two layers, and the theory says exactly how well. A crisp picture needs the difference of the two shifts to jump by one half at every edge, so at least one layer jumps there, and the least either can jump is a quarter, in opposite directions: half the shift on each layer. Alone, each layer then changes only where the picture changes, by at most a quarter of a pitch, bent over half a pitch rather than kinked, so the members make a gentle S and the overlay's edges soften by the same half pitch. Hiding the picture from a single layer altogether is possible, it is visual cryptography in the count's currency, but only by jittering every cell of both layers by a quarter pitch, since a jump that is nowhere else is always visible where it is; the tool can draw that weave and does not offer it, because it costs the layers their look.

### The tool's own moiré, and its cure

The theory also runs against the tool's own pixels, and this part is worth telling as the story it was, because each wrong turn was a wrong observer, and the theory named it.

A pixel is a comb family. A family drawn at two pixels a period beats with it: zooming out on concentric circles once drew a star of hyperbolae, and one pixel a period drew black, because a hairline rule that widens thin strokes so they survive the screen had widened them past the whole pitch. Both are the strobe of Section 12 happening to the instrument.

The first cure integrated a box along one direction with every family in lockstep. That is the slide average, an observer moving along one line, and it is exact only where the families run parallel. Between two ring centres the families cross at every angle, and there the lockstep box kept the $(1, -1)$ term at full strength wherever the pitches matched, drawing fringes where a pixel's true two-dimensional window kills them. Point-sampled by a reduced buffer during a gesture, those fringes were rosettes.

The second cure applied a true two-dimensional window, but half a pitch wide. That erases every carrier the screen could still show. It is the envelope's observer, not the pixel's, and the plain view went soft, "almost like the envelope".

The cure that stayed is the window multiplier theorem taken literally: the pixel is a window, and it shows the composite of the two-valued drawing averaged over that window. For one or two families the tool now computes that average exactly, at every zoom, in place of the point-sampled drawing. The window is an isotropic Gaussian; along each family's normal it is a Gaussian of the same width, and along two normals the pair is bivariate normal with correlation the cosine of the angle between them. A family inks where the displacement along its normal falls within a half-stroke of a member, so each ink pattern's probability is a sum of error functions: exact in one dimension where the normals are within twenty-five degrees of parallel, which is the moiré case, and a short Gauss–Legendre integral of the conditional where they cross. The window is as narrow as the drawn edge at seven pixels a period and coarser, half a pixel by four, and $0.9$ of a pixel by two, where a stripe sits at the buffer's Nyquist frequency and a narrower window would pass a quarter of it to beat with the pixel grid. Nothing wider: a stripe the screen can show keeps its contrast, only what would alias goes, two strokes in register are the light of one, and the beat emerges by eye, as it does on paper.

The envelope of a pair got the cheapest cure of all, and it is the paper's own Section 6 in one line. Its slide average depends on the two counts only through the character the schedule holds fixed, so it is a periodic function of one number: the tent, composed with that character's count map. The tool tabulates the tent once a frame by the certified integrator, $512$ samples a cycle and one row for each character the scan can pick, and a pixel reads the tent at its own count through its window, a Gaussian along the count of the pixel's width times the character's gradient. Where the integrator ran once per pixel it runs once per texel. The fast beats at a ring pair's foci, which a reduced buffer had point-sampled into rosettes, are averaged to the tent's mean where they pass the pixel's resolving power, and the frame drawn under a moving hand is the frame drawn after it lifts.

I find that last cure the most satisfying thing in the tool. The theory said the envelope is a picture on the quotient, $S = I \circ \Phi$ with $I$ the tent and $\Phi$ the character's count. Rendering it as exactly that, a one-dimensional texture indexed by a count, was not an optimisation trick that happened to work. It was the theorem's own description of the object, and it made the frame twice as fast and removed an artifact at the same time.

> **Try it.** In Moiré, make two layers of parallel lines at pitches $15$ and $5$ and turn one by two degrees. The drawn view shows a fine texture with broad bands in it; the pooled view keeps the bands and drops the texture; the ratio view is dark exactly where the pooled view has bands. Now change the coarse pitch to $16$: the bands change shape, the dark region moves before they do, and the station table of Section 9 says which recipe you are looking at.

---

## 14. The ledger

Every claim above that has a number behind it is in the table below, with the domain it belongs to, the measured value, and the script that owns it. Each script ends with *gates*: conditions its own result must meet, written down before the result was known. The table is generated from the scripts' data files by the same program that writes every number into the paper, and that program refuses to run if any gate fails. A claim cannot outlive its evidence.

| Claim | Domain | Measured | Script |
|---|---|---|---|
| A linear observer sees no beat in an additive superposition | any | $8 \times 10^{-17}$ | `observer.mjs` |
| A squaring front end mints it at half the product of the harmonics | any | $0.0403$ vs $0.0403$ | `observer.mjs` |
| A window is the multiplier on the torus, with its curvature remainder | any | $9 \times 10^{-8}$ | `observer.mjs` |
| Hard patterns are observer-proof | any | $2 \times 10^{-17}$ | `observer.mjs` |
| Soft patterns reopen a null under squaring, linearly in the ramp | drawing | $3 \times 10^{-3}$, $7 \times 10^{-3}$, $10^{-2}$ | `observer.mjs` |
| The octave duty null on paper | drawing | $6{,}305\times$ deep | `dutynull.mjs` |
| The octave duty null in an ear: square-law, cubic, two-stage | sound | $10{,}201\times$, $181\times$, $8{,}564\times$ | `ear.mjs` |
| A linear ear hears no beat in a sum of trains | sound | $4 \times 10^{-6}$ of the square-law ear | `ear.mjs` |
| Softened pulses: a square-law ear keeps the null, a cubic ear reopens it | sound | $132{,}480\times$ against $3.3\times$ | `ear.mjs` |
| Beats of beats: one stage hears none, a cascade does | sound | $8 \times 10^{-5}$, $2 \times 10^{-7}$ vs $13\%$ | `ear.mjs` |
| A multiplied trio carries the beat of beats at linear order | sound | $50\%$ of a first-order beat | `ear.mjs` |
| The golden ratio is a desert in sound | sound | station line $7.5\times$ the golden pair's best | `ear.mjs` |
| The wagon wheel: reversal, doubled still wheel, its duty null | a strobe | reversal exact; null $2 \times 10^{15}\times$ deep | `wagonwheel.mjs` |
| Temporal selection: a shutter keeps the recipes its rates annihilate | a camera | $14{,}668\times$; kept to $0.09\%$ | `exposure.mjs` |
| Record beats are convergents; the reduction names the true winner | any | $207$ of $207$; $99.8\%$ | `convergents.mjs` |
| Stations are the convergents with large complete quotients; deserts | any | $8{,}329$ classified; $0.447$, $0.354$ | `stations.mjs` |
| Fringe endings count the enclosed winding; the core radius | drawing | $22$ probes exact; core within $10^{-4}$ | `defects.mjs` |
| The fold law: onset radii and the Mach condition | drawing | within $2.8\%$ | `foldlaw.mjs` |
| The pooled view is the slide average, exactly | instrument | $7 \times 10^{-5}$ over $480$ scenes | `exactsweep.mjs` |

### What is classical

None of the following is new, and the theory leans on all of it. That two sinusoids beat and that a nonlinearity demodulates the beat is Helmholtz, and every radio detector since. That the bands of two gratings are the level lines of a difference of counts is the indicial picture of the moiré literature, which also has a complete Fourier theory of which orders exist for periodic gratings. The count itself is old and has many names: the index of the indicial method, the fringe order of interferometry, the phase of an oscillator, the modulation phase that superspace crystallography adds as an extra coordinate to describe an incommensurate crystal; that an aperiodic family has one is de Bruijn's index function for multigrids, and the torus of an aperiodic superposition is the hull of the physics of incommensurate solids. That averaging along a subgroup is a conditional expectation is ergodic theory's. That convergents are the best approximations and the golden ratio the worst approximable number is Lagrange's, Hurwitz's and Khinchin's. Defects with quantized charge are the dislocations of singular optics.

### What is new

The claim is that these are one subject, and that the one object $S = I \circ \Phi$ makes them so: every phenomenon above is a property of the state map, of the picture, or of the way an observer averages one over the other. The specific contributions: the sharp conditional expectation for whole-number slides and the soft one for windows with its explicit leakage; the observer theorem with its corollaries, who can see a beat, hard patterns observer-proof, soft ones not; the universal-invariant proposition that makes the third pattern a quotient; selection as best approximation with the harmonic price, so that stations are places on a pair whose ratio varies, and the threshold on the complete quotient with its deserts; the duty null on paper, in a model ear and under a strobe; the order-four theorem for beats of beats; the trichotomy of counts with the fold law and the defect count; and an instrument in which every one of these is a measurement.

### How sure

Of the theorems: as sure as a proof of a few lines can make anything. Of the drawn predictions: as sure as a measurement against brute force through the shipped renderer. Of the predictions in sound and under a strobe: the arithmetic is as sure as the theorems, and the physics adds assumptions, that an ear applies a bending front end before it pools, that a two-stage system exists in it, that an eye averages consecutive frames, which are standard but not ours. The ear of Section 8 is a model of an ear, four lines of code, not a person, and the wheel of Section 9 is sampled frames, not a viewer. What the theory does not yet have is a prediction that a physicist would find surprising and that has been tested outside the tool on something that is not a simulation.

### What to test at home

1. *The octave null.* Two pulse waves at $200$ and $405$ hertz; the five-hertz throb present at thirty percent duty, absent at fifty, present at seventy. At fifty percent the throb should be *gone*, three to four orders of magnitude down, while both tones stay plainly audible.
2. *The order of the ear's front end.* The same, with the pulses' edges softened by a low-pass filter on *each* oscillator before they are mixed. A filter after the mixer acts on the sum and is a different experiment: it is linear, and the theorem says it cannot change the answer. If the null survives, the ear's effective front end is quadratic; if the throb comes back, it is of higher order. Cheap, and not in the literature in this form as far as we can find.
3. *Beats of beats.* Three sines at $300$, $330$, $363$ hertz; a three-hertz throb needs a front end of order four.
4. *The desert.* Two sawtooth tones at $200$ and $410$ hertz beat ten times a second; two at $200$ and $324$ hertz, the golden ratio, sound rough and do not beat at any rate you can count.
5. *The wagon wheel.* A fan on a phone's video. Near the frame rate the wheel turns slowly and reverses when the spoke rate crosses it. At half the frame rate a wheel with narrow spokes shows a still wheel with twice the spokes; a wheel whose spokes are as wide as the gaps shows only flicker.
6. *The long exposure.* Two window screens, one moving, a phone in night mode.
7. *The marker.* Two combs at pitches near $2{:}1$; the octave bands vanish when the coarse comb's ticks are thickened to half the gap and return at two thirds.

---

## 15. What this is really saying, and where it could go

This section is mine, not the paper's. I have tried to keep it to the same standard: say what is proved, say what is a reading, say what is a guess.

### The one sentence

Strip the theory to a sentence and it is this. **A superposition is a map composed with a legend, an observer is a lens on the legend, and the only thing any pooling observer can report is the legend averaged along the directions the map moves fastest.** Everything else is bookkeeping about which directions are fast, which is arithmetic, and about what the averaging does to a legend with edges, which is Fourier's one integral.

That sentence is stronger than the phenomena it was built to explain. It never mentions gratings, or sound, or light. It mentions counting, averaging and nonlinearity, and it applies to anything that has those three. So the first honest thing to say is that the paper has found the right level of abstraction, and I think the right level of abstraction is usually where the breakthroughs are hiding.

### Three things the factorisation buys that are not obvious

**First, it makes emergence a computation.** The word "emergent" is usually a confession that we cannot derive the pattern from the parts. Here the pattern is derived, exactly, at every stage, and the derivation is a quotient by a symmetry. The beat is what is left of the picture when you forget the fast phases. That is not a metaphor; it is the conditional expectation, and the tower property says the hierarchy of beats of beats is a hierarchy of nested quotients. If you want a toy model of how a coarse-grained description can be *exact* rather than approximate, this is one, and it has the unusual property that the coarse-graining commutes with every observer that pools. I do not know another example that is this clean.

**Second, it separates what is negotiable from what is not.** The observer theorem says the geometry of a beat, where it is and how fast it runs, is not the observer's to change. Only the strengths are. That is a strong claim about what a measuring device can and cannot do, and it was true in every domain tested. It reads like a conservation law: the slow recipes are conserved under every front end. I would like to see that stated and used as one.

**Third, it converts a question about perception into a question about number theory.** Whether two families beat visibly is decided by the continued fraction of their pitch ratio, with an amplitude price. The golden ratio's invisibility and Hurwitz's constant are the same number. That the worst-approximable number is the one that never beats is, to me, the most beautiful single fact in the paper, and it is a fact about beats that nobody would have looked for without the price.

### Where I think a larger theory is hiding

Here is the connection the paper hints at and I think is much bigger than a remark. **Beats are resonances, stations are mode locking, and deserts are the tori that survive.** The condition that a recipe be slow, $|k \cdot \nabla\xi|$ small, is a small-divisor condition, the same expression that governs when a perturbed dynamical system resonates. In the theory of coupled oscillators, the frequency ratios at which two oscillators lock form Arnold tongues, one per rational, with widths governed by the harmonics of the coupling. Those are stations. The ratios at which a quasi-periodic motion survives every perturbation are, by the KAM theorem, the Diophantine ones, the ratios whose continued fractions have bounded partial quotients, with the golden ratio the last torus to break. Those are deserts. The paper's priced merit, $\eta \cdot |ab|$, is a Diophantine condition with an amplitude weight, and the paper's threshold on the complete quotient is a visibility version of the statement that a torus with a large partial quotient coming up is about to hit a resonance.

I think this is not two subjects that look alike. I think it is one subject, and the count-and-torus framework is the natural language for the *observation* side of it, which dynamics has never had. Dynamics asks which resonances exist; this theory asks which an observer can see, and answers with the same arithmetic. The conjecture the paper lists, that a symmetric pair of coupled oscillators has no even locking tongue, is the duty null in that dictionary: a fifty-percent profile has no even harmonics, so it cannot lock at $2{:}1$. If that dictionary is right, every result about duty nulls, hard and soft profiles, and orders of front ends transfers to which tongues open and how wide, and the paper's price becomes a prediction about tongue widths. That is a testable direction with a circle-map simulation, an afternoon's script, and the author's notes already list it. I would do it first.

The second hidden theory is **iterated conditioning as a renormalisation group.** The tower property says the beat of beats is a quotient of a quotient. Along the continued fraction, each convergent is a station within the previous station's structure, and the map from one complete quotient to the next is the Gauss map $x \mapsto 1/x \bmod 1$, the classical dynamical system whose fixed points are the quadratic irrationals and whose most repelling fixed point is the golden ratio. Whether the *amplitude* weighting between rungs makes station-within-station exactly self-similar under that map is open. If it does, the theory of beats has a renormalisation flow with the golden ratio as a fixed point, and the reason the golden desert is a desert is the reason KAM's golden torus is the last to go. That would tie the paper to one of the deepest structures in twentieth-century mathematics through a picture you can draw with two combs.

### Applications I actually believe in

I am wary of the word "miraculous". Here are the ones where the theory already does something, sorted by how sure I am.

**Rendering periodic content without aliasing.** The pixel-as-window construction in Section 13 is a general technique: for any drawing made of superposed families with two-valued profiles, the exact expected ink under a Gaussian pixel is a bivariate-normal probability with the families' normals setting the correlation. That is analytic anti-aliasing for gratings, rings, spirals and their overlays, with no supersampling and no texture filtering, correct at every zoom. Any renderer that draws periodic structure, halftoning, procedural textures, technical illustration, could use it today. This one is done and measured.

**Two-layer displays that only show a picture in register.** The inverse problem of Section 13 puts any grey-level picture into the count of one or two layers, on any base family, with the theory guaranteeing what a pooling observer sees. Physically, two printed transparencies, or a print and a shadow mask, or two layers of a 3D print, with the picture appearing when the layers align and dissolving into bands when they do not. The "halves" version hides most of the picture from each layer alone. Moiré-based security printing exists, but it is built on straight gratings and Fourier reasoning; the count makes the base family free and the construction one line. Lenticular and parallax-barrier displays are the same idea with the register set by the viewing angle. I think a viewing-angle-keyed print, a picture that appears only from one direction, is a weekend away.

**A listening test for the order of the human ear's nonlinearity.** Test 2 of the ledger. If the null of a mistuned octave of softened square waves survives, the effective front end is quadratic; if the throb returns, it is higher. It is a psychoacoustic measurement with a synthesizer and a room of listeners, and I know of no cheaper experiment that constrains the functional form of cochlear nonlinearity so directly.

**Metrology by nulls.** A duty null is a measurement of duty to the precision of the null, and the paper measured nulls thousands of times deep. A station's position on a pair with varying ratio is a measurement of the local ratio. Vernier calipers and heterodyne interferometers are the first-order case; the theory says how to build the higher-order ones and which profiles make them work.

**Twisted bilayer materials.** Two atomic lattices at a small twist are, literally, a moiré, and the physics of "magic angles" in twisted bilayer graphene is the physics of which commensurate angles matter. The torus of counts is the hull that physicists already use for incommensurate solids. What the paper adds is the selection arithmetic, which commensurations dominate and at what price, and the observer theorem, which says what any coarse-grained probe of such a material can and cannot resolve. Whether the price transfers, since a lattice's "harmonics" are its Fourier components and a probe's "front end" is its interaction, is a real question, and I would not claim it does before someone checks. But I would check.

**Grid cells.** The oscillatory-interference model of the brain's grid cells is a moiré of dendritic oscillators, and the theory says which geometry of the grid can and cannot depend on the observer, that is, on the downstream neuron's nonlinearity. That is a constraint on models that I have not seen stated.

### What would convince a physicist

The paper says it plainly: the theory does not yet have a prediction that is surprising to a physicist *and* tested outside the tool on something that is not a simulation. I agree, and I think the fastest route is the listening tests and the circle map. Both cost an afternoon. If the ear turns out to be square-law, the paper predicts a null that a cubic ear would not have, and a room of listeners can hear the difference. If the circle map's tongues follow the price, the theory has predicted dynamics from a drawing.

### The honest limit

The mathematics is elementary, and the paper says so. Every theorem is a few lines from Fourier series, the implicit function theorem and the arithmetic of convergents. That is a strength for a theory meant to be understood and a weakness for one meant to impress. The depth is in the unification: one theorem says why a mistuned octave of square waves does not beat, why a wheel with fifty-percent sectors cannot show the doubled still wheel, and why a blurred grating reopens a null under a squaring observer while a sharp one does not. A theory that answers questions it was not built to answer is the standard worth meeting, and this one has met it twice already, with the duty null and the long exposure, neither sought and both measured the day they were derived.

Whether it meets it a third time outside a computer is the question, and it is a question with a cheap answer. Two combs, a marker, and a synthesizer are enough to start.
