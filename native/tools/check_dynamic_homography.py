#!/usr/bin/env python3
"""CPU check of q / PixelDepth, 1 / PixelDepth planar homographies.

No renderer, kernel, Unreal Python module, or third-party dependency is used.
The float32 model rounds each operation separately; actual Metal compilation,
interpolation, helper lanes and FMA behavior must still be checked on the GPU.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
ENGINE = Path('/Users/Shared/Epic Games/UE_5.8/Engine')


def f32(x):
    try:
        return struct.unpack('f', struct.pack('f', x))[0]
    except OverflowError:
        return math.copysign(math.inf, x)


def dot(a, b):
    return sum(x*y for x, y in zip(a, b))


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def unit(a):
    n = math.sqrt(dot(a, a))
    return tuple(x/n for x in a)


def camera(name, eye, target, width, height, roll=0, jitter=(0, 0), period=4):
    forward = unit(tuple(t-e for t, e in zip(target, eye)))
    right0 = unit(cross(forward, (0, 1, 0)))
    up0 = cross(right0, forward)
    c, s = math.cos(roll), math.sin(roll)
    right = tuple(c*r+s*u for r, u in zip(right0, up0))
    up = tuple(c*u-s*r for r, u in zip(right0, up0))
    tangent = math.tan(math.radians(25))
    rx = tuple(2*tangent*width/height*r/width for r in right)
    ry = tuple(-2*tangent*u/height for u in up)
    r0 = tuple(f-width*x/2-height*y/2+jitter[0]*x+jitter[1]*y for f, x, y in zip(forward, rx, ry))
    return dict(name=name, eye=eye, target=target, width=width, height=height,
                roll=roll, jitter=jitter, period=period, forward=forward,
                ray_x=rx, ray_y=ry, ray_0=r0)


def ground(cam, x, y):
    """Original ray/plane intersection, including behind-camera extrapolation."""
    ray = tuple(a+b*x+c*y for a, b, c in zip(cam['ray_0'], cam['ray_x'], cam['ray_y']))
    if ray[1] == 0:
        raise ZeroDivisionError('Exact horizon.')
    t = -cam['eye'][1]/ray[1]
    p = tuple(e+t*r for e, r in zip(cam['eye'], ray))
    # The unnormalized perspective ray has dot(ray,forward)=1. Depth is
    # forward view depth, in Unreal centimeters, not the ray's Euclidean length.
    depth_cm = t * dot(ray, cam['forward']) * 100
    q = (p[0]/cam['period'], p[2]/cam['period'])
    return q, depth_cm, p


def lane(cam, x, y, precision):
    q, depth, p = ground(cam, x, y)
    if precision == 'f64':
        w = 1/depth
        return (q[0]*w, q[1]*w, w), q
    # WorldPosition custom input is an ordinary float3 after any LWC demotion.
    # Three (X,Y,Z) -> Unreal (-Z,X,Y)*100, with period in cm.
    ue_x, ue_y = f32(-100*p[2]), f32(100*p[0])
    period_cm = f32(100*cam['period'])
    native_q = (f32(ue_y/period_cm), f32(f32(-ue_x)/period_cm))
    w = f32(1/f32(depth))
    return (f32(native_q[0]*w), f32(native_q[1]*w), w), native_q


def quad_rows(cam, qx, qy, precision, derivative):
    values = {(x, y): lane(cam, qx+x+.5, qy+y+.5, precision) for y in (0, 1) for x in (0, 1)}
    rnd = f32 if precision == 'f32' else float
    rows = {}
    for y in (0, 1):
        for x in (0, 1):
            dx_y, dy_x = (y, x) if derivative == 'fine' else (0, 0)
            dx = tuple(rnd(b-a) for a, b in zip(values[0, dx_y][0], values[1, dx_y][0]))
            dy = tuple(rnd(b-a) for a, b in zip(values[dy_x, 0][0], values[dy_x, 1][0]))
            center, native_q = values[x, y]
            rows[x, y] = tuple((dx[i], dy[i], center[i]) for i in range(3)), native_q
    return rows


def evaluate(rows, x, y, precision):
    rnd = f32 if precision == 'f32' else float
    v = tuple(rnd(rnd(rnd(a*x)+rnd(b*y))+c) for a, b, c in rows)
    if v[2] == 0 or not all(math.isfinite(z) for z in v):
        return None, v[2]
    return (rnd(v[0]/v[2]), rnd(v[1]/v[2])), v[2]


def horizon_distance(cam, x, y):
    return -(cam['ray_0'][1]+cam['ray_x'][1]*x+cam['ray_y'][1]*y)/math.hypot(cam['ray_x'][1], cam['ray_y'][1])


def footprint_inside(cam, x, y):
    if horizon_distance(cam, x, y) <= 3:
        return False
    for dx in (-3, 3):
        for dy in (-3, 3):
            _, depth, p = ground(cam, x+dx, y+dy)
            if depth <= 0 or max(abs(p[0]), abs(p[2])) >= 50000:
                return False
    return True


def blank_stats():
    return dict(cases=0, evaluations=0, nonfinite=0, sign_failures=0,
                max_absolute_count_error=0.0, max_relative_count_error=0.0,
                max_center_native_count_difference=0.0,
                max_derivative_relative_error=0.0, worst=None)


OFFSETS = ((0, 0), (-.5, -.5), (.5, .5), (-2.75, 0), (2.75, 0),
           (0, -2.75), (0, 2.75), (-2, 2), (2, -2), (0, -3))


def accumulate(stats, cam, qx, qy, precision, derivative, require_inside=False):
    rows_by_lane = quad_rows(cam, qx, qy, precision, derivative)
    for (ix, iy), (rows, native_q) in rows_by_lane.items():
        cx, cy = qx+ix+.5, qy+iy+.5
        if require_inside and not footprint_inside(cam, cx, cy):
            continue
        stats['cases'] += 1
        if precision == 'f32':
            center, _ = evaluate(rows, 0, 0, precision)
            if center:
                stats['max_center_native_count_difference'] = max(stats['max_center_native_count_difference'], *(abs(a-b) for a, b in zip(center, native_q)))
        # Affine reciprocal-depth gradient has a closed-form independent value.
        for axis in (0, 1):
            expected = -cam[['ray_x', 'ray_y'][axis]][1]/(100*cam['eye'][1])
            if abs(expected) > 1e-20:
                stats['max_derivative_relative_error'] = max(stats['max_derivative_relative_error'], abs(rows[2][axis]-expected)/abs(expected))
        for dx, dy in OFFSETS:
            original, depth, _ = ground(cam, cx+dx, cy+dy)
            actual, den = evaluate(rows, dx, dy, precision)
            stats['evaluations'] += 1
            if actual is None:
                stats['nonfinite'] += 1
                continue
            if den*depth <= 0:
                stats['sign_failures'] += 1
            absolute = max(abs(a-b) for a, b in zip(actual, original))
            relative = max(abs(a-b)/max(1, abs(b)) for a, b in zip(actual, original))
            stats['max_relative_count_error'] = max(stats['max_relative_count_error'], relative)
            if absolute > stats['max_absolute_count_error']:
                stats['max_absolute_count_error'] = absolute
                stats['worst'] = dict(camera=cam['name'], size=[cam['width'], cam['height']], eye=cam['eye'], target=cam['target'], jitter=cam['jitter'], center=[cx, cy], offset=[dx, dy], horizon_distance=horizon_distance(cam, cx, cy), counts_original=original, counts_reconstructed=actual, denominator=den, footprint_inside_finite_ground=footprint_inside(cam, cx, cy))


def fixtures():
    dimensions = ((640, 360), (1920, 1080), (1280, 720), (1024, 1024), (1200, 500), (600, 1000))
    poses = [
        ('Glide0', (0, 12, 28), (0, 0, -22), 0, 4),
        ('Glide8', (math.sin(8*.28)*6, 12, 28), (math.sin(8*.28)*6*.45, 0, -22), 0, 4),
        ('Approach4', (0, 12, 28-math.sin(4*.22)*12), (0, 0, -22-math.sin(4*.22)*12), 0, 2),
        ('Yawed', (21, 7, 19), (-12, 0, -48), 0, 4),
        ('Rolled', (-17, 18, 6), (7, 0, -74), .21, 4),
        ('LowCamera', (0, .5, 11), (0, 0, -39), -.09, .5),
    ]
    result = []
    for width, height in dimensions:
        for name, eye, target, roll, period in poses:
            for jitter in ((0, 0), (.375, -.3125)):
                cam = camera(name, eye, target, width, height, roll, jitter, period)
                for fx in (.08, .29, .51, .87):
                    for fy in (.4, .57, .83):
                        qx, qy = 2*int(width*fx/2), 2*int(height*fy/2)
                        # Raster helper interpolation is not reliable evidence
                        # across a geometry edge; the main family stays inside.
                        if all(footprint_inside(cam, qx+x+.5, qy+y+.5) for x in (0, 1) for y in (0, 1)):
                            result.append((cam, qx, qy))
    return result


def stress_fixture(distance, translation=0):
    width, height = 1920, 1080
    qx, qy = 110, 360
    horizon_y = qy+.5-distance
    pitch = math.atan(math.tan(math.radians(25))*(1-2*horizon_y/height))
    eye = (translation, 12, translation+28)
    target = (translation, 12-50*math.tan(pitch), translation-22)
    cam = camera(f'Horizon{distance:g}_Origin{translation:g}', eye, target, width, height)
    return cam, qx, qy


def counterexamples():
    cam = camera('NonlinearDepthCounterexample', (0, 12, 28), (0, 0, -22), 640, 360)
    cx, cy = 531.5, 250.5
    def wrong_value(x, y):
        q, _, p = ground(cam, x, y)
        distance = math.sqrt(sum((a-b)**2 for a, b in zip(p, cam['eye']))) * 100
        return q[0]/distance, q[1]/distance, 1/distance
    center = wrong_value(cx, cy)
    dx = tuple(b-a for a, b in zip(center, wrong_value(cx+1, cy)))
    dy = tuple(b-a for a, b in zip(center, wrong_value(cx, cy+1)))
    rows = tuple((dx[i], dy[i], center[i]) for i in range(3))
    actual, _ = evaluate(rows, -3, 3, 'f64')
    original, _, _ = ground(cam, cx-3, cy+3)
    euclidean_error = max(abs(a-b) for a, b in zip(actual, original))
    # Orthographic plane: q=(x,y), linear depth=10+x. Reciprocal depth is
    # non-affine, so one-pixel secants cannot represent the affine q field.
    ortho = lambda x, y: (x/(10+x), y/(10+x), 1/(10+x))
    center = ortho(2, 3)
    dx = tuple(b-a for a, b in zip(center, ortho(3, 3)))
    dy = tuple(b-a for a, b in zip(center, ortho(2, 4)))
    rows = tuple((dx[i], dy[i], center[i]) for i in range(3))
    actual, _ = evaluate(rows, 2, 1, 'f64')
    return dict(euclidean_distance_max_count_error=euclidean_error,
                orthographic_wrong_reciprocal_depth_max_count_error=max(abs(a-b) for a, b in zip(actual, (4, 4))))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path)
    args = parser.parse_args()
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
    out = args.out or ROOT / 'native/evidence' / ('dynamic-homography-'+stamp)
    if out.exists():
        raise SystemExit('Refusing to overwrite existing evidence directory.')
    family = fixtures()
    summary = {}
    for precision, derivative in (('f64', 'fine'), ('f32', 'fine'), ('f32', 'coarse')):
        stats = blank_stats()
        for cam, qx, qy in family:
            accumulate(stats, cam, qx, qy, precision, derivative, True)
        summary[precision+'_'+derivative] = stats
    stress = []
    for translation in (0, 10000, 10000000):
        for distance in (64, 12, 6, 3.1, 3.01, 3.0001, 3.000001):
            cam, qx, qy = stress_fixture(distance, translation)
            results = {}
            for precision in ('f64', 'f32'):
                stats = blank_stats()
                accumulate(stats, cam, qx, qy, precision, 'fine')
                results[precision] = stats
            stress.append(dict(translation_world=translation, first_lane_horizon_distance=distance, results=results))
    negatives = counterexamples()
    assert summary['f64_fine']['max_relative_count_error'] < 1e-10
    assert summary['f64_fine']['nonfinite'] == 0
    assert summary['f32_fine']['nonfinite'] == 0
    assert summary['f32_coarse']['nonfinite'] == 0
    assert summary['f32_fine']['max_absolute_count_error'] < 1e-3
    assert summary['f32_coarse']['max_absolute_count_error'] < 1e-3
    assert negatives['euclidean_distance_max_count_error'] > 1e-5
    assert negatives['orthographic_wrong_reciprocal_depth_max_count_error'] > .1
    references = []
    for relative, lines, observation in (
        ('Shaders/Private/MaterialTemplate.ush', [1120, 1127], 'Both PixelDepth overloads call GetScreenPositionDepth.'),
        ('Shaders/Private/Common.ush', [1396, 1403], 'Perspective returns ScreenPosition.w; orthographic converts device Z.'),
        ('Shaders/Private/Common.ush', [1546, 1554], 'ScreenPosition is NDC position multiplied by SvPosition.w, documented as SceneDepth.'),
        ('Source/Runtime/Engine/Private/Materials/HLSLMaterialTranslator.cpp', [8084, 8103], 'PixelDepth finite code is GetPixelDepth(Parameters); analytic derivative code uses ScreenPosition.w.'),
    ):
        file = ENGINE / relative
        references.append(dict(file=str(file), lines=lines, observation=observation, sha256=hashlib.sha256(file.read_bytes()).hexdigest() if file.exists() else None))
    report = dict(created_at=datetime.now(timezone.utc).isoformat(), status='cpu-model-passed-native-gpu-validation-required',
                  utility_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), gpu_jobs=0,
                  quad_count=len(family), quad_lanes=4, tested_offsets_pixels=OFFSETS, summary=summary,
                  regression_gates=dict(binary64_relative_count_error_below=1e-10, binary32_finite_family_absolute_count_error_below=1e-3, gates_are_not_global_error_bounds=True),
                  stress=stress, negative_controls=negatives, engine_source_references=references,
                  model='Original camera rays in binary64. Ordinary float world-position input and PixelDepth rounded to binary32; every arithmetic operation and fine/coarse quad subtraction rounded separately. No fused multiply-add, actual interpolation, or shader optimization simulation.',
                  interpretation='Exact projective reconstruction in real arithmetic for a perspective camera and a single plane. CPU float32 errors are measured in source periods, not image radiance; they are not a bound on the shared kernel output.',
                  limitations=['No GPU execution: Metal interpolation, helper lanes, FMA, and material input precision remain unverified.', 'Main family keeps a 6-sigma rectangle on the finite 100000-world-unit ground plane. Stress includes invalid finite-plane footprints and near-pole extrapolation; inspect each worst-case flag.', 'Jitter is a constant screen translation shared by source rays and material derivatives. The material center remains local (0,0), with no extra half-pixel or unjitter correction.', 'Unqualified ddx/ddy may be coarse. Both coarse and fine are exact for affine real-valued n and w; their rounded results can differ.', 'Use perspective PixelDepth, not Euclidean distance, raw device Z, SceneDepth from another surface, or orthographic view depth.', 'No WorldPositionOffset/PixelDepthOffset or nonplanar surface equivalence is claimed. Apply q and depth to the same actually shaded plane.', 'Large absolute coordinates lose fractional phase during float world-position demotion; a fixed or uniform high-precision plane anchor is a separate integration decision.'])
    out.mkdir(parents=True)
    (out/'report.json').write_text(json.dumps(report, indent=2, allow_nan=False)+'\n')
    print(json.dumps(dict(output=str(out), quad_count=len(family), summary=summary, negative_controls=negatives), indent=2))


if __name__ == '__main__':
    main()
