#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy", "matplotlib", "pillow"]
# ///
"""Real-3D reference renders and redraw assets for Figure 4.

Two ring families of equal pitch on a floor patch; above it, the graph of a
character k1*phi1 + k2*phi2 as a lit 3D surface with its integer contours
baked into the shading. Panel A: the difference (a ramp with a steep wall
between the centres; its flat flanks carry the visible fringes). Panel B:
the sum (a bowl steep nearly everywhere; contours crowd into texture).

Outputs into paper/fig4-assets/:
  panelA-3d.png, panelB-3d.png   -- lit renders, no labels (add in Illustrator)
  overlayA.svg, overlayB.svg     -- curve layers pixel-registered to the PNGs
  curves-flat.svg                -- all curves in flat patch coordinates
  texture-floor-rings.png        -- the two-family superposition, 2048^2
  texture-family1.png/2.png      -- each family alone
  texture-surfaceA-bands.png/B   -- RGBA contour-band textures in patch space
  height-D.png, height-sum.png   -- 16-bit heightmaps (ranges in README)
  README.md                      -- parameters, camera, workflow

Run:  uv run paper/tools/fig4-3d.py
"""

import os
import numpy as np
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d import proj3d
from PIL import Image

# ------------------------------------------------------------- parameters
F = 0.20          # focus half-separation (patch units)
S = 2 * F / 5     # ring pitch: D spans -5..5 across the patch
C0 = 1.6          # sum reference level
Z0 = 0.55         # surface float height
ZA = 0.050        # z per unit of D
ZB = 0.016        # z per unit of the sum index
DUTY = 0.45       # stroke width as a fraction of pitch
ETA_CUT = 0.45    # bold below: fringe clearly wider than the carrier
ELEV, AZIM = 25, -62
INK = (0x15 / 255, 0x18 / 255, 0x1C / 255)
ACCENT = (0xC8 / 255, 0x1E / 255, 0x5A / 255)
WARM = (0xD4 / 255, 0x76 / 255, 0x1A / 255)
COOL = (0x1B / 255, 0x6C / 255, 0xA8 / 255)
PAPER = (0.955, 0.950, 0.940)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fig4-assets")
os.makedirs(OUT, exist_ok=True)

C1, C2 = (-F, 0.0), (F, 0.0)


def fields(X, Y):
    r1 = np.hypot(X - C1[0], Y)
    r2 = np.hypot(X - C2[0], Y)
    return r1, r2


def eta_pair(X, Y, sign):
    """sign=-1: difference character; sign=+1: sum."""
    r1, r2 = fields(X, Y)
    u1x, u1y = (X + F) / np.maximum(r1, 1e-9), Y / np.maximum(r1, 1e-9)
    u2x, u2y = (X - F) / np.maximum(r2, 1e-9), Y / np.maximum(r2, 1e-9)
    num = np.hypot(u1x + sign * u2x, u1y + sign * u2y)
    den = 0.5 * np.hypot(u1x - sign * u2x, u1y - sign * u2y)
    return num / np.maximum(den, 1e-9)


# ------------------------------------------------------------- textures
def ring_ink(r, aa):
    """Anti-aliased ink for one family: dark near each ring radius."""
    t = np.abs(r / S - np.round(r / S)) * S       # world distance to nearest ring
    hw = DUTY * S / 2
    return np.clip((hw - t) / aa + 0.5, 0, 1)


def floor_rgb(X, Y, aa):
    r1, r2 = fields(X, Y)
    i1, i2 = ring_ink(r1, aa), ring_ink(r2, aa)
    rgb = np.ones(X.shape + (3,))
    rgb *= np.array(PAPER)
    # family 1 slightly cool, family 2 neutral ink; overlap goes darkest
    for i, col, a in ((i1, np.array(COOL) * 0.45, 0.78), (i2, np.array(INK), 0.74)):
        m = (i * a)[..., None]
        rgb = rgb * (1 - m) + col * m
    return np.clip(rgb, 0, 1)


def surface_rgb(H, eta, zscale, band_col, xs):
    """Paper-grey lambert-shaded surface with integer-contour bands baked in."""
    t = np.abs(H - np.round(H))
    band = np.clip(1 - t / 0.09, 0, 1) ** 1.4
    alpha = np.where(eta < ETA_CUT, 0.92, 0.28) * band
    rgb = np.ones(H.shape + (3,)) * np.array(PAPER)
    rgb = rgb * (1 - alpha[..., None]) + np.array(band_col) * alpha[..., None]
    gy, gx = np.gradient(zscale * H, xs, xs)
    nz = 1.0 / np.sqrt(gx**2 + gy**2 + 1)
    L = np.array([-0.55, 0.35, 0.70])
    L = L / np.linalg.norm(L)
    lam = np.clip(-gx * nz * L[0] + -gy * nz * L[1] + nz * L[2], 0, 1)
    return np.clip(rgb * (0.28 + 0.72 * lam)[..., None], 0, 1)


# ------------------------------------------------------------- curves
def hyper_branch(n, sign, tmax=3.2, N=400):
    a = n * S / 2
    b = np.sqrt(max(F * F - a * a, 1e-12))
    t = np.linspace(-tmax, tmax, N)
    return np.column_stack([sign * a * np.cosh(t), b * np.sinh(t)])


def ellipse(j, N=520):
    a = (C0 + j * S) / 2
    b = np.sqrt(max(a * a - F * F, 1e-12))
    t = np.linspace(0, 2 * np.pi, N)
    return np.column_stack([a * np.cos(t), b * np.sin(t)])


def clip_patch(pts):
    keep = (np.abs(pts[:, 0]) <= 1) & (np.abs(pts[:, 1]) <= 1)
    runs, cur = [], []
    for p, k in zip(pts, keep):
        if k:
            cur.append(p)
        elif cur:
            runs.append(np.array(cur))
            cur = []
    if cur:
        runs.append(np.array(cur))
    return [r for r in runs if len(r) > 2]


def split_eta(run, eta_fn):
    e = eta_fn(run[:, 0], run[:, 1])
    out, cur, cls = [], [], None
    for p, b in zip(run, e < ETA_CUT):
        c = "bold" if b else "thin"
        if c != cls and cur:
            out.append((cls, np.array(cur)))
            cur = []
        cls = c
        cur.append(p)
    if cur:
        out.append((cls, np.array(cur)))
    return [(c, r) for c, r in out if len(r) > 2]


def levels_A():
    out = [(0, np.column_stack([np.zeros(200), np.linspace(-1, 1, 200)]))]
    for n in range(1, 5):
        out.append((n, hyper_branch(n, +1)))
        out.append((-n, hyper_branch(n, -1)))
    # degenerate |D| = 5: the axis rays beyond the foci
    out.append((5, np.column_stack([np.linspace(F, 1, 120), np.zeros(120)])))
    out.append((-5, np.column_stack([np.linspace(-1, -F, 120), np.zeros(120)])))
    return out


def levels_B():
    out = [(-15, np.column_stack([np.linspace(-F, F, 120), np.zeros(120)]))]
    for j in range(-14, 16):
        out.append((j, ellipse(j)))
    return out


# ------------------------------------------------------------- render
def render_panel(name, height_fn, zscale, eta_fn, band_col, levels, drops):
    NS, NF = 520, 1100
    xs = np.linspace(-1, 1, NS)
    Xs, Ys = np.meshgrid(xs, xs)
    xf = np.linspace(-1, 1, NF)
    Xf, Yf = np.meshgrid(xf, xf)

    Hs = height_fn(Xs, Ys)
    Zs = Z0 + zscale * Hs
    srgb = surface_rgb(Hs, eta_fn(Xs, Ys), zscale, band_col, xs)
    frgb = floor_rgb(Xf, Yf, aa=2.2 / NF)

    fig = plt.figure(figsize=(10, 8), dpi=300)
    ax = fig.add_subplot(projection="3d")
    ax.computed_zorder = False
    ax.plot_surface(Xf, Yf, np.zeros_like(Xf), facecolors=frgb, shade=False,
                    rcount=NF, ccount=NF, antialiased=False, zorder=1)
    ax.plot_surface(Xs, Ys, Zs, facecolors=srgb, shade=False,
                    rcount=NS, ccount=NS, antialiased=False, zorder=3)
    for x0, y0 in drops:
        z0 = Z0 + zscale * height_fn(np.array(x0), np.array(y0))
        ax.plot3D([x0, x0], [y0, y0], [0, float(z0)], color=(*INK, 0.7),
                  lw=1.8, ls=(0, (4, 3)), zorder=2)
    ax.view_init(elev=ELEV, azim=AZIM)
    ax.set_box_aspect((1, 1, 0.72))
    ax.set_xlim(-1, 1)
    ax.set_ylim(-1, 1)
    ax.set_zlim(0, 0.95)
    ax.set_axis_off()
    fig.subplots_adjust(left=0, right=1, bottom=0, top=1)
    fig.canvas.draw()

    png = os.path.join(OUT, f"{name}-3d.png")
    fig.savefig(png, dpi=300)
    W, Hpx = fig.canvas.get_width_height()
    W3, H3 = W * 3, Hpx * 3  # dpi 300 vs figure dpi... use actual saved size

    # --- pixel-registered overlay SVG ---
    M = ax.get_proj()

    def to_px(pts3):
        x2, y2, _ = proj3d.proj_transform(pts3[:, 0], pts3[:, 1], pts3[:, 2], M)
        xy = ax.transData.transform(np.column_stack([x2, y2]))
        img = Image.open(png)
        sw, sh = img.size
        sx, sy = sw / W, sh / Hpx
        return np.column_stack([xy[:, 0] * sx, (Hpx - xy[:, 1]) * sy])

    img = Image.open(png)
    sw, sh = img.size
    css = (
        f".bold{{stroke:#{'%02x%02x%02x' % tuple(int(c*255) for c in band_col)};"
        "stroke-width:3;fill:none}"
        f".thin{{stroke:#{'%02x%02x%02x' % tuple(int(c*255) for c in band_col)};"
        "stroke-width:1;fill:none;opacity:.45}"
        ".floorbold{stroke:#C81E5A;stroke-width:2.6;fill:none}"
        ".floorthin{stroke:#C81E5A;stroke-width:1;fill:none;opacity:.4}"
        ".frame{stroke:#15181C;stroke-width:1.4;fill:none;opacity:.7}"
        ".drop{stroke:#15181C;stroke-width:1.6;fill:none;opacity:.6;"
        "stroke-dasharray:10 7}"
    )
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{sw}" height="{sh}" '
        f'viewBox="0 0 {sw} {sh}">',
        f"<style>{css}</style>",
    ]

    def poly(pts_px, cls):
        p = " ".join(f"{a:.1f},{b:.1f}" for a, b in pts_px)
        return f'<polyline points="{p}" class="{cls}"/>'

    def lifted(run, lv):
        z = Z0 + zscale * lv
        return np.column_stack([run, np.full(len(run), z)])

    def flat(run):
        return np.column_stack([run, np.zeros(len(run))])

    for gid, zget, bold_c, thin_c in (
        ("surface-contours", lifted, "bold", "thin"),
        ("floor-fringes", lambda r, lv: flat(r), "floorbold", "floorthin"),
    ):
        parts.append(f'<g id="{gid}">')
        for lv, pts in levels:
            for run in clip_patch(pts):
                for cls, seg in split_eta(run, eta_fn):
                    parts.append(
                        poly(to_px(zget(seg, lv)), bold_c if cls == "bold" else thin_c)
                    )
        parts.append("</g>")

    corners = np.array([(-1, -1), (1, -1), (1, 1), (-1, 1), (-1, -1)], float)
    parts.append('<g id="frames">')
    parts.append(poly(to_px(flat(corners)), "frame"))
    edge = []
    for seg in (
        np.column_stack([np.linspace(-1, 1, 160), np.full(160, -1.0)]),
        np.column_stack([np.full(160, 1.0), np.linspace(-1, 1, 160)]),
        np.column_stack([np.linspace(1, -1, 160), np.full(160, 1.0)]),
        np.column_stack([np.full(160, -1.0), np.linspace(1, -1, 160)]),
    ):
        edge.append(seg)
    boundary = np.vstack(edge)
    zb = Z0 + zscale * height_fn(boundary[:, 0], boundary[:, 1])
    parts.append(poly(to_px(np.column_stack([boundary, zb])), "frame"))
    parts.append("</g>")

    parts.append('<g id="droplines">')
    for x0, y0 in drops:
        z0 = Z0 + zscale * float(height_fn(np.array(x0), np.array(y0)))
        parts.append(poly(to_px(np.array([[x0, y0, z0], [x0, y0, 0.0]])), "drop"))
    parts.append("</g>")
    parts.append("</svg>")
    with open(os.path.join(OUT, f"overlay{name[-1]}.svg"), "w") as f:
        f.write("\n".join(parts))
    plt.close(fig)
    print(f"wrote {name}-3d.png ({sw}x{sh}) and overlay{name[-1]}.svg")


# ------------------------------------------------------------- flat assets
def write_flat_assets():
    N = 2048
    xs = np.linspace(-1, 1, N)
    X, Y = np.meshgrid(xs, xs)
    aa = 2.2 / N
    r1, r2 = fields(X, Y)
    i1, i2 = ring_ink(r1, aa), ring_ink(r2, aa)

    def save_gray(img, name):
        Image.fromarray((255 * (1 - img)).astype(np.uint8)).save(
            os.path.join(OUT, name)
        )

    save_gray(np.clip(i1 * 0.999, 0, 1), "texture-family1.png")
    save_gray(np.clip(i2 * 0.999, 0, 1), "texture-family2.png")
    Image.fromarray((floor_rgb(X, Y, aa) * 255).astype(np.uint8)).save(
        os.path.join(OUT, "texture-floor-rings.png")
    )

    for name, H, eta, col in (
        ("texture-surfaceA-bands.png", (r1 - r2) / S, eta_pair(X, Y, -1), ACCENT),
        ("texture-surfaceB-bands.png", (r1 + r2 - C0) / S, eta_pair(X, Y, +1), WARM),
    ):
        t = np.abs(H - np.round(H))
        band = np.clip(1 - t / 0.09, 0, 1) ** 1.4
        alpha = np.where(eta < ETA_CUT, 0.92, 0.28) * band
        rgba = np.zeros(H.shape + (4,))
        rgba[..., :3] = col
        rgba[..., 3] = alpha
        Image.fromarray((rgba * 255).astype(np.uint8)).save(os.path.join(OUT, name))

    ranges = {}
    for name, H in (("height-D.png", (r1 - r2) / S), ("height-sum.png", (r1 + r2 - C0) / S)):
        lo, hi = float(H.min()), float(H.max())
        ranges[name] = (lo, hi)
        q = ((H - lo) / (hi - lo) * 65535).astype(np.uint16)
        Image.fromarray(q, mode="I;16").save(os.path.join(OUT, name))

    # flat curves SVG in patch coordinates (x right, y UP; 1000 units per patch unit)
    Sc = 1000
    css = (
        ".dbold{stroke:#C81E5A;stroke-width:4;fill:none}"
        ".dthin{stroke:#C81E5A;stroke-width:1.4;fill:none;opacity:.45}"
        ".sbold{stroke:#D4761A;stroke-width:4;fill:none}"
        ".sthin{stroke:#D4761A;stroke-width:1.2;fill:none;opacity:.45}"
        ".frame{stroke:#15181C;stroke-width:2;fill:none}"
    )
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-{Sc+50} -{Sc+50} {2*Sc+100} {2*Sc+100}">',
        f"<style>{css}</style>",
        f'<rect x="-{Sc}" y="-{Sc}" width="{2*Sc}" height="{2*Sc}" class="frame"/>',
    ]

    def poly(run, cls):
        p = " ".join(f"{a*Sc:.1f},{-b*Sc:.1f}" for a, b in run)
        return f'<polyline points="{p}" class="{cls}"/>'

    for gid, levels, eta_fn, bold_c, thin_c in (
        ("difference-fringes", levels_A(), lambda x, y: eta_pair(x, y, -1), "dbold", "dthin"),
        ("sum-fringes", levels_B(), lambda x, y: eta_pair(x, y, +1), "sbold", "sthin"),
    ):
        parts.append(f'<g id="{gid}">')
        for lv, pts in levels:
            for run in clip_patch(pts):
                for cls, seg in split_eta(run, eta_fn):
                    parts.append(poly(seg, bold_c if cls == "bold" else thin_c))
        parts.append("</g>")
    parts.append("</svg>")
    with open(os.path.join(OUT, "curves-flat.svg"), "w") as f:
        f.write("\n".join(parts))
    print("wrote flat textures, heightmaps, curves-flat.svg")
    return ranges


def pick_drops():
    """Three points on bold stretches of A's contours."""
    picks = []
    for n, sign, t in ((2, +1, 1.6), (3, -1, 1.3), (4, +1, -1.0)):
        a = n * S / 2
        b = np.sqrt(F * F - a * a)
        x, y = sign * a * np.cosh(t), b * np.sinh(t)
        picks.append((float(x), float(y)))
    return picks


ranges = write_flat_assets()
render_panel(
    "panelA", lambda X, Y: (fields(X, Y)[0] - fields(X, Y)[1]) / S, ZA,
    lambda x, y: eta_pair(x, y, -1), ACCENT, levels_A(), pick_drops(),
)
render_panel(
    "panelB", lambda X, Y: (fields(X, Y)[0] + fields(X, Y)[1] - C0) / S, ZB,
    lambda x, y: eta_pair(x, y, +1), WARM, levels_B(), [],
)

readme = f"""# Figure 4 redraw assets

Reference renders and layered material for redrawing the character-hills
figure in Illustrator. No labels anywhere — typography is yours.

## The scene

Two ring families of equal pitch on the floor patch [-1,1]^2:
centres (±{F}, 0), pitch s = {S:.3f} (so the difference D spans -5..5),
stroke duty {DUTY}. Above the floor, the graph of a character:

- Panel A: D = (r1 - r2)/s, drawn at z = {Z0} + {ZA}·D.
  Integer contours are the confocal hyperbolae; they are the moiré fringes.
  |D| = 5 degenerates to the two axis rays beyond the foci.
- Panel B: (r1 + r2 - {C0})/s at z = {Z0} + {ZB}·(sum index).
  Contours are confocal ellipses, crowded to carrier scale; the one bold
  stretch is the inter-focal segment, the only place the sum is slow.

Bold vs thin everywhere follows the heterodyne ratio η of the paper
(eq. ratio): bold where η < {ETA_CUT} (fringe clearly wider than carrier).

## Files

- `panelA-3d.png`, `panelB-3d.png` — lit 3D renders, 300 dpi.
  Camera: elev {ELEV}°, azim {AZIM}°, box aspect (1, 1, 0.72),
  x,y ∈ [-1,1], z ∈ [0, 0.95]. Light from upper-left (-0.45, 0.30, 0.84).
- `overlayA.svg`, `overlayB.svg` — every curve (surface contours, floor
  fringes, patch frames, drop lines), **pixel-registered to the PNGs**:
  place the SVG over the PNG at 1:1 and the curves land exactly. Groups:
  `surface-contours`, `floor-fringes`, `frames`, `droplines`;
  classes bold/thin carry the η split.
- `curves-flat.svg` — the same fringe/contour curves flat in patch
  coordinates (1000 units per patch unit, y up), groups
  `difference-fringes` and `sum-fringes`.
- `texture-floor-rings.png` — the two-family superposition, 2048², over
  the exact patch [-1,1]² (the real moiré is in it).
- `texture-family1.png`, `texture-family2.png` — each family alone
  (grayscale, ink=black), same extent — for layered recoloring.
- `texture-surfaceA-bands.png`, `texture-surfaceB-bands.png` — RGBA
  contour-band textures in flat patch space (what is baked onto the
  surfaces), same extent.
- `height-D.png`, `height-sum.png` — 16-bit heightmaps over the patch,
  normalized; ranges: height-D {ranges['height-D.png'][0]:.3f}..{ranges['height-D.png'][1]:.3f},
  height-sum {ranges['height-sum.png'][0]:.3f}..{ranges['height-sum.png'][1]:.3f}.
  Enough to re-render the surfaces in Blender/C4D if you prefer a
  different camera: displace a plane, drape the matching band texture.

## Suggested workflow

1. Place `panelA-3d.png`, put `overlayA.svg` above it (same pixel size).
2. Retrace/restyle the overlay paths; the render is your shading reference.
3. Use `texture-floor-rings.png` (or the two family layers) for the floor;
   `curves-flat.svg` if you'd rather build the floor in pure vector.
4. Everything regenerates from `paper/tools/fig4-3d.py`
   (`uv run paper/tools/fig4-3d.py`); tweak parameters at the top.
"""
with open(os.path.join(OUT, "README.md"), "w") as f:
    f.write(readme)
print("wrote README.md")
