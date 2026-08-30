# Figure 4 redraw assets

Reference renders and layered material for redrawing the character-hills
figure in Illustrator. No labels anywhere — typography is yours.

## The scene

Two ring families of equal pitch on the floor patch [-1,1]^2:
centres (±0.2, 0), pitch s = 0.080 (so the difference D spans -5..5),
stroke duty 0.45. Above the floor, the graph of a character:

- Panel A: D = (r1 - r2)/s, drawn at z = 0.55 + 0.05·D.
  Integer contours are the confocal hyperbolae; they are the moiré fringes.
  |D| = 5 degenerates to the two axis rays beyond the foci.
- Panel B: (r1 + r2 - 1.6)/s at z = 0.55 + 0.016·(sum index).
  Contours are confocal ellipses, crowded to carrier scale; the one bold
  stretch is the inter-focal segment, the only place the sum is slow.

Bold vs thin everywhere follows the heterodyne ratio η of the paper
(eq. ratio): bold where η < 0.45 (fringe clearly wider than carrier).

## Files

- `panelA-3d.png`, `panelB-3d.png` — lit 3D renders, 300 dpi.
  Camera: elev 25°, azim -62°, box aspect (1, 1, 0.72),
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
  normalized; ranges: height-D -5.000..5.000,
  height-sum -15.000..15.533.
  Enough to re-render the surfaces in Blender/C4D if you prefer a
  different camera: displace a plane, drape the matching band texture.

## Suggested workflow

1. Place `panelA-3d.png`, put `overlayA.svg` above it (same pixel size).
2. Retrace/restyle the overlay paths; the render is your shading reference.
3. Use `texture-floor-rings.png` (or the two family layers) for the floor;
   `curves-flat.svg` if you'd rather build the floor in pure vector.
4. Everything regenerates from `paper/tools/fig4-3d.py`
   (`uv run paper/tools/fig4-3d.py`); tweak parameters at the top.
