#!/usr/bin/env python3
"""Generate the Penrose-style character-hills figure as TikZ.

Two ring families on a floor patch; above it, the graph of a character
k1*phi1 + k2*phi2 as a hand-drawn surface with integer contours, which drop
down onto the moire fringes.  Panel A: the difference (flat along the focal
axis, broad hyperbolic fringes there).  Panel B: the sum (flat only in the
valley between the centres, elliptical fringes only there).  Contours are
bold exactly where eta for that character is small.
"""
import math, random, os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'fig-charhills.tex')

S_A, S_B = 2.1, 1.55          # cm per world unit, per panel
KY, LY = 0.44, 0.30           # oblique projection: sx = x + KY*y ; sy = LY*y + z
Z0_A, ZS_A = 1.50, 0.120      # surface float height and z per unit index
Z0_B, ZS_B = 1.60, 0.011
F = 0.16                      # focus half-separation
S_PITCH = 2 * F / 7           # ring pitch: 13 fringe levels across the patch
C1, C2 = (-F, 0.0), (F, 0.0)
SUM_C0 = 1.6                  # sum surface reference level
ETA_CUT = 0.45                # bold below (fringe clearly wider than carrier)

def r1(x, y): return math.hypot(x - C1[0], y - C1[1])
def r2(x, y): return math.hypot(x - C2[0], y - C2[1])
def units(x, y):
    a, b = max(r1(x, y), 1e-9), max(r2(x, y), 1e-9)
    return ((x - C1[0]) / a, y / a), ((x - C2[0]) / b, y / b)
def Dif(x, y): return (r1(x, y) - r2(x, y)) / S_PITCH
def Sum(x, y): return (r1(x, y) + r2(x, y) - SUM_C0) / S_PITCH
def eta_dif(x, y):
    (a1, a2), (b1, b2) = units(x, y)
    num = math.hypot(a1 - b1, a2 - b2)
    den = 0.5 * math.hypot(a1 + b1, a2 + b2)
    return num / max(den, 1e-9)
def eta_sum(x, y):
    (a1, a2), (b1, b2) = units(x, y)
    num = math.hypot(a1 + b1, a2 + b2)
    den = 0.5 * math.hypot(a1 - b1, a2 - b2)
    return num / max(den, 1e-9)

def proj(x, y, z, S): return (S * (x + KY * y), S * (LY * y + z))

def runs_by(points, keep):
    out, cur = [], []
    for p in points:
        if keep(p):
            cur.append(p)
        elif cur:
            out.append(cur); cur = []
    if cur: out.append(cur)
    return out

IN = lambda p: abs(p[0]) <= 1.0 and abs(p[1]) <= 1.0

def emit(style, pts, S, z=lambda x, y: 0.0):
    if len(pts) < 3: return ''
    coords = ' '.join(f'({sx:.3f},{sy:.3f})' for sx, sy in
                      (proj(x, y, z(x, y), S) for x, y in pts))
    return f'\\draw[{style}] plot coordinates {{{coords}}};\n'

def emit_split(pts, S, z, eta, bold, thin):
    """One curve, bold where eta<cut, thin elsewhere; clipped to the patch."""
    o = ''
    for run in runs_by(pts, IN):
        for seg in runs_by(run, lambda p: eta(*p) < ETA_CUT):
            o += emit(bold, seg[::2], S, z)
        for seg in runs_by(run, lambda p: eta(*p) >= ETA_CUT):
            o += emit(thin, seg[::2], S, z)
    return o

def circle(cx, r, n=720):
    return [(cx + r * math.cos(t), r * math.sin(t))
            for t in (2 * math.pi * i / n for i in range(n + 1))]

def hyper_branch(n_level, sign, tmax=3.8, N=440):
    a = n_level * S_PITCH / 2.0
    b = math.sqrt(max(F * F - a * a, 1e-9))
    return [(sign * a * math.cosh(t), b * math.sinh(t))
            for t in (tmax * (2 * i / N - 1) for i in range(N + 1))]

def ellipse(m_level, N=420):
    a = m_level * S_PITCH / 2.0
    b = math.sqrt(max(a * a - F * F, 1e-9))
    return [(a * math.cos(t), b * math.sin(t))
            for t in (2 * math.pi * i / N for i in range(N + 1))]

def panel(S, Z0, ZS, height_fn, eta_fn, contour_levels, bold_floor, thin_floor,
          bold_surf, thin_surf, stipple_gain, floor_fringes=True):
    z = lambda x, y: Z0 + ZS * height_fn(x, y)
    o = []
    # --- floor: patch outline and the two ring families ---
    corners = [(-1, -1), (1, -1), (1, 1), (-1, 1), (-1, -1)]
    o.append(emit('ink!60, line width=0.5pt', corners, S))
    for cx, tone in ((C1[0], 'cool!45'), (C2[0], 'ink!32')):
        for k in range(1, 34):
            for run in runs_by(circle(cx, S_PITCH * k), IN):
                o.append(emit(f'{tone}, line width=0.22pt', run[::4], S))
    # --- floor: fringe curves, bold only where this character is visible ---
    if floor_fringes:
        for lv, pts in contour_levels:
            o.append(emit_split(pts, S, lambda x, y: 0.0, eta_fn,
                                bold_floor, thin_floor))
    # --- surface: stipple on the steep flanks (carrier country) ---
    rng = random.Random(7)
    slope_max = 2.0 / S_PITCH
    dots = []
    for _ in range(3600):
        x, y = rng.uniform(-1, 1), rng.uniform(-1, 1)
        e = 1e-3
        gx = (height_fn(x + e, y) - height_fn(x - e, y)) / (2 * e)
        gy = (height_fn(x, y + e) - height_fn(x, y - e)) / (2 * e)
        shade = min(1.0, math.hypot(gx, gy) / slope_max) ** 1.5
        if rng.random() < shade * stipple_gain:
            sx, sy = proj(x, y, z(x, y), S)
            dots.append(f'({sx:.3f},{sy:.3f})')
    o.append('\\foreach \\p in {' + ','.join(dots) + '}\n'
             '  \\fill[ink!70] \\p circle (0.16pt);\n')
    # --- surface: boundary and section curves ---
    N = 120
    xs = [2 * i / N - 1 for i in range(N + 1)]
    for pts in ([(x, -1.0) for x in xs], [(x, 1.0) for x in xs],
                [(-1.0, y) for y in xs], [(1.0, y) for y in xs]):
        o.append(emit('ink, line width=0.55pt', pts, S, z))
    for yc in (-0.5, 0.0, 0.5):
        o.append(emit('ink!40, line width=0.3pt', [(x, yc) for x in xs], S, z))
    # --- surface: integer contours at their constant heights ---
    for lv, pts in contour_levels:
        o.append(emit_split(pts, S, lambda x, y, lv=lv: Z0 + ZS * lv, eta_fn,
                            bold_surf, thin_surf))
    return ''.join(o), z

# ---------------- Panel A: the difference character ----------------
levA = [(0, [(0.0, 2 * i / 200 - 1) for i in range(201)])]
for n in (1, 2, 3, 4, 5, 6):
    levA.append((n, hyper_branch(n, +1)))
    levA.append((-n, hyper_branch(n, -1)))
bodyA, zA = panel(S_A, Z0_A, ZS_A, Dif, eta_dif, levA,
                  'accent, line width=0.7pt', 'accent!30, line width=0.28pt',
                  'accent, line width=0.65pt', 'accent!30, line width=0.28pt',
                  0.9)

# ---------------- Panel B: the sum character ----------------
levB = [(m - SUM_C0 / S_PITCH, ellipse(m)) for m in range(8, 63)]
bodyB, zB = panel(S_B, Z0_B, ZS_B, Sum, eta_sum, levB,
                  'warm!90, line width=0.5pt', 'warm!35, line width=0.15pt',
                  'warm!90, line width=0.5pt', 'warm!35, line width=0.15pt',
                  0.30, floor_fringes=False)

# ---------------- drop lines ----------------
def droplines(S, z, picks, style):
    out = []
    for x, y in picks:
        top, bot = proj(x, y, z(x, y), S), proj(x, y, 0, S)
        out.append(f'\\draw[{style}] ({top[0]:.3f},{top[1]:.3f}) -- '
                   f'({bot[0]:.3f},{bot[1]:.3f});\n')
    return ''.join(out)

def on_branch(n, sign, t):
    a = n * S_PITCH / 2.0
    b = math.sqrt(F * F - a * a)
    return (sign * a * math.cosh(t), b * math.sinh(t))

dropsA = droplines(S_A, zA,
                   [on_branch(3, +1, 2.3), on_branch(5, -1, 2.1),
                    on_branch(6, +1, -1.9)],
                   'accent!70, densely dashed, line width=0.4pt')

with open(OUT, 'w') as f:
    f.write(
'''% GENERATED by scratchpad/genfig.py -- the character-hills figure.
\\begin{tikzpicture}[baseline]
  \\begin{scope}
''' + bodyA + dropsA + r'''
    % vertical axis, Fig-10.8 style
    \draw[-{Stealth[length=5pt]}, ink] (-3.35,-0.50) -- (-3.35,5.30);
    \node[font=\scriptsize, text=ink, anchor=south, rotate=90] at (-3.52,2.0) {$D=\idx_1-\idx_2$};
    % labels with curved leaders
    \node[font=\scriptsize, text=ink, align=center, anchor=south] (gl) at (-2.35,4.35) {graph of the\\[-2pt]difference};
    \draw[-{Stealth[length=4pt]}, ink!70] (gl.south) to[out=-60,in=160] (-0.15,3.00);
    \node[font=\scriptsize, text=accent!85!ink, anchor=west] (cl) at (3.35,4.60) {contours at $D\in\Z$\dots};
    \draw[-{Stealth[length=4pt]}, accent!75] (cl.west) to[out=200,in=20] (1.60,4.70);
    \node[font=\scriptsize, text=accent!85!ink, anchor=west] (fl) at (2.75,0.10) {\dots are the fringes};
    \draw[-{Stealth[length=4pt]}, accent!75] (fl.west) to[out=185,in=15] (0.28,-0.27);
    \node[font=\scriptsize, text=ink!70, anchor=north] at (-1.30,-0.85) {two ring families};
    \node[font=\scriptsize, text=ink!75, align=center, anchor=west] (st) at (-3.15,0.95) {steep:\\[-2pt]no fringe};
    \draw[-{Stealth[length=4pt]}, ink!60] (st.east) to[out=10,in=215] (-1.20,2.25);
  \end{scope}
  \begin{scope}[xshift=9.4cm, yshift=0.35cm]
''' + bodyB + r'''
    \node[font=\scriptsize, text=ink, align=left, anchor=west] (sl) at (2.10,3.75) {the sum $\idx_1+\idx_2$:\\[-2pt]steep everywhere here};
    \draw[-{Stealth[length=4pt]}, ink!70] (sl.west) to[out=200,in=40] (1.50,3.22);
    \node[font=\scriptsize, text=warm!85!ink, align=left, anchor=west] (el) at (1.90,0.25) {no fringe survives};
    \draw[-{Stealth[length=4pt]}, warm!80] (el.west) to[out=190,in=10] (1.00,-0.05);
  \end{scope}
\end{tikzpicture}
''')
print('wrote', OUT)
