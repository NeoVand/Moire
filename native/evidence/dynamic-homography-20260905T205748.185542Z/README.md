# Camera-following planar homography: CPU validation

The proposed construction is exact in real arithmetic for a perspective camera and one planar surface. The finite difference must be taken **after** multiplying the source counts by reciprocal linear view depth. Ordinary float inputs introduce the measured errors below; this is not yet a native shader/readback validation.

For a raster position `p = (x,y)`, write the unnormalized perspective ray as `R(p)`, with `dot(R, forward) = 1`. On a plane, the ray intersection is `P = E + t R`, and reciprocal `t` is affine in `p`. Unreal's perspective `PixelDepth` is `100 t` for the Three-to-Unreal conversion used here. Therefore `w = 1 / PixelDepth` is affine. For source counts `q = (P.x,P.z) / periodWorld`,

```
n = q * w = (E.x,E.z) * w / periodWorld
              + (R.x,R.z) / (100 * periodWorld).
```

Both terms are affine. Differences of adjacent samples recover their exact affine slopes in real arithmetic. Anchoring each row at the current lane gives the local quotient everywhere on this plane:

```hlsl
// q and PixelDepth must describe the same actually shaded planar surface.
float2 q = float2(WorldPosition.y, -WorldPosition.x) / periodCm;
float w = rcp(PixelDepth);
float2 n = q * w;
float3 hu = float3(ddx(n.x), ddy(n.x), n.x);
float3 hv = float3(ddx(n.y), ddy(n.y), n.y);
float3 hd = float3(ddx(w),   ddy(w),   w);
// q is already period-normalized; S is variance in rendered pixels.
float2 result = MoireKernel::checkerMeanH(hu, hv, hd, 0, 0, 1, 0.25);
```

The local center is `(0,0)`. Add no half-pixel offset or separate camera-jitter correction: the current interpolated values already belong to the shaded sample. Constant camera jitter changes the ray intercept, preserving the affine construction. Camera translation, rotation, roll, and aspect changes are similarly represented by the current values and derivatives. A common nonzero sign or scale of all three rows cancels; positive `w` does not conflict with the old host's negative plane-intersection denominator.

## What Unreal actually supplies

Read-only inspection used the installed Unreal 5.8 source. File hashes and line ranges are in [report.json](report.json).

- `MaterialTemplate.ush:1120–1127`: both `GetPixelDepth` overloads call `GetScreenPositionDepth`.
- `Common.ush:1396–1403`: perspective returns `ScreenPosition.w`; orthographic converts device Z instead.
- `Common.ush:1546–1554`: resolved screen position is multiplied by `SvPosition.w`, documented there as scene depth.
- `HLSLMaterialTranslator.cpp:8084–8103`: finite PixelDepth code is `GetPixelDepth(Parameters)`; the analytic derivative path uses `ScreenPosition.w` and its derivatives.

This is forward view depth / perspective clip `w`, in world units (centimeters here), **not Euclidean distance to the camera**. For an orthographic view, choose `w=1` and differentiate the affine planar counts themselves. Using reciprocal orthographic view depth is generally wrong. Do not substitute another surface's SceneDepth, raw device Z, or a depth altered inconsistently by PixelDepthOffset.

## Independent test

Run from a checkout with ordinary Python; Unreal is not launched:

```
python3 native/tools/check_dynamic_homography.py
```

The reference independently intersects original camera rays with the ground plane. It does not import the analytic kernel or production scene/homography helpers. Six poses, six image shapes, and two jitter offsets produced 758 accepted quads, 3,032 lanes, and 30,320 offset evaluations per arithmetic/derivative mode. The accepted family keeps the full 6-sigma rectangle on the finite ground. Offsets reach three pixels from the lane center. Both fine and coarse 2×2 derivatives are checked.

| Arithmetic model | Maximum absolute count error | Maximum relative count error |
| --- | ---: | ---: |
| Binary64, fine | 2.8308e-11 | 1.0364e-13 |
| Binary32, fine | 1.4363e-4 | 8.1667e-7 |
| Binary32, coarse | 1.6039e-4 | 7.2382e-7 |

“Counts” means checker periods, not linear image intensity. The largest additional center discrepancy relative to the already rounded native source counts was 7.6294e-6 periods. There were no nonfinite values or denominator-sign failures in this family. Regression thresholds are specific to these fixtures, not global accuracy bounds.

Negative controls reject incorrect depth choices: using Euclidean distance produces a 3.5042e-4 count discrepancy in one off-axis perspective fixture; using reciprocal orthographic depth produces a 0.181818 discrepancy in a simple affine orthographic fixture.

## Where precision breaks down

`n` and `w` are affine mathematically, but subtracting rounded neighboring values can lose significant digits. Evaluating `w + dx*ddx(w) + dy*ddy(w)` close to its zero amplifies those errors. Selected stress cases at 1920×1080, with the camera near the origin:

| Center distance to horizon | Nearest tested offset's horizon distance | Maximum float32 count error | Full footprint inside current finite ground? |
| ---: | ---: | ---: | :---: |
| 64 px | 61 px | 9.3263e-6 | Yes |
| 12 px | 9 px | 9.4630e-5 | Yes |
| 6 px | 3 px | 3.1173e-4 | Yes |
| 3.1 px | 0.1 px | 5.1211e-2 | No |
| 3.01 px | 0.01 px | 12.217 | No |
| 3.0001 px | 0.0001 px | 3.0201e5 | No |

These last rows deliberately approach the projective pole; their support already leaves the host's finite plane. They must not be presented as valid geometry-independent pixel integration. Even binary64 eventually loses accuracy in that conditioning regime.

Absolute-world demotion is a separate limit: translating the camera and infinite source plane coordinates by 10,000 world units increases the 6-pixel-distance stress error to 0.002013 periods. A 10-million-unit translation produces errors above one period; that is outside this host's fixed finite plane and is a stress example for a future large-world host. If such coordinates are needed, subtract a uniform plane anchor before float demotion and preserve its periodic phase accurately. Do not independently wrap `q` per pixel before taking derivatives: the wrapping introduces discontinuities.

The next gate is actual GPU material integration while retaining the fixed-pose material as the control. Shader precision, fused operations, LWC demotion, raster interpolation, helper-lane behavior at triangle/geometry boundaries, and derivatives under divergent control flow are not reproduced by this CPU model. Compute derivatives before conditional filtering branches. Keep the existing finite-plane/horizon exclusions; do not treat this coordinate reconstruction as geometry coverage or a proof about moving-image TSR quality.
