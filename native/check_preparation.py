"""Static and pure-math checks only: no Unreal import, launch, assets, or GPU."""

import ast
import importlib.util
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT / "Unreal" / "MoireComparison"
for script in ROOT.rglob("*.py"):
    ast.parse(script.read_text(encoding="utf-8"), filename=str(script))
descriptor = json.loads((PROJECT / "MoireComparison.uproject").read_text())
assert descriptor["EngineAssociation"] == "5.8" and "Modules" not in descriptor
assert {p["Name"] for p in descriptor["Plugins"] if p["Enabled"]} == {"PythonScriptPlugin", "EditorScriptingUtilities", "SequencerScripting", "MovieRenderPipeline", "MoireCompare"}
assert any(p["Name"] == "AndroidFileServer" and not p["Enabled"] for p in descriptor["Plugins"])
assert "AndroidFileServerRuntimeSettings" not in (PROJECT / "Config" / "DefaultEngine.ini").read_text()
spec = importlib.util.spec_from_file_location("scene_contract", PROJECT / "Scripts" / "scene_contract.py")
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)
assert contract.three_to_unreal((2, 3, 5)) == (-500, 200, 300)
assert math.isclose(math.tan(math.radians(contract.HORIZONTAL_FOV_DEGREES / 2)) /
                    (contract.WIDTH / contract.HEIGHT), math.tan(math.radians(25)), abs_tol=1e-15)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def normalized(v):
    norm = math.sqrt(dot(v, v))
    return tuple(x / norm for x in v)


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


count = 0
ray_checks = sky_checks = 0
checker_values = set()
viewports = ((1920, 1080), (800, 600), (1080, 1920))
for pose in contract.POSES:
    camera = contract.camera_pose(pose)
    eye, target = camera["three_eye"], camera["three_target"]
    forward = normalized(tuple(b-a for a, b in zip(eye, target)))
    right = normalized(cross(forward, (0, 1, 0)))
    up = cross(right, forward)
    rotation = camera["unreal_rotation_degrees"]
    pitch, yaw = map(math.radians, (rotation["pitch"], rotation["yaw"]))
    ue_forward = (math.cos(pitch)*math.cos(yaw), math.cos(pitch)*math.sin(yaw), math.sin(pitch))
    ue_right = (-math.sin(yaw), math.cos(yaw), 0)
    ue_up = cross(ue_forward, ue_right)
    for vector, expected in [(forward, ue_forward), (right, ue_right), (up, ue_up)]:
        assert max(abs(a / 100 - b) for a, b in zip(contract.three_to_unreal(vector), expected)) < 1e-14
    for point in [(1, 0, -20), (-7, 0, -45), (8, 0, -70), (-3, 0, 10)]:
        delta = tuple(a-b for a, b in zip(point, eye))
        ue_delta = contract.three_to_unreal(delta)
        # Independent look-at basis vs Unreal pitch/yaw basis; viewport NDC agrees.
        for axis, ue_axis in [(right, ue_right), (up, ue_up)]:
            assert math.isclose(dot(delta, axis) / dot(delta, forward),
                                dot(ue_delta, ue_axis) / dot(ue_delta, ue_forward), abs_tol=1e-13)
        ue_point = contract.three_to_unreal(point)
        period = camera["period_world"]
        q = (point[0] / period, point[2] / period)
        uq = (ue_point[1] / (100*period), -ue_point[0] / (100*period))
        assert q == uq
        count += 1
    assert contract.homography_normalized(pose) == contract.homography_normalized(
        pose, contract.WIDTH / contract.HEIGHT)
    for width, height in viewports:
        rows = contract.homography_normalized(pose, width / height)
        pixel_rows = {key: (row[0] / width, row[1] / height, row[2])
                      for key, row in rows.items()}
        for fraction_x in (0.03, 0.19, 0.43, 0.77, 0.97):
            for fraction_y in (0.05, 0.24, 0.40, 0.68, 0.94):
                x = math.floor(fraction_x * width) + 0.5
                y = math.floor(fraction_y * height) + 0.5
                uv = (x / width, y / height, 1.0)
                # Independently trace a native pitch/yaw camera ray. This
                # uses neither the homography rows nor its Three look-at basis.
                tangent = math.tan(math.radians(contract.VERTICAL_FOV_DEGREES / 2))
                sx = (2 * uv[0] - 1) * tangent * width / height
                sy = (1 - 2 * uv[1]) * tangent
                ray = tuple(f + sx*r + sy*u for f, r, u in zip(ue_forward, ue_right, ue_up))
                denominator = dot(rows["hd"], uv)
                assert math.isclose(denominator, ray[2], abs_tol=1e-14)
                assert (denominator < 0) == (ray[2] < 0)
                if ray[2] >= 0:
                    sky_checks += 1
                    continue
                origin = camera["unreal_location_cm"]
                distance = -origin[2] / ray[2]
                point = tuple(a + distance*b for a, b in zip(origin, ray))
                expected = (point[1] / (100 * camera["period_world"]),
                            -point[0] / (100 * camera["period_world"]))
                normalized_counts = tuple(dot(rows[key], uv) / denominator for key in ("hu", "hv"))
                pixel = (x, y, 1.0)
                pixel_counts = tuple(dot(pixel_rows[key], pixel) / dot(pixel_rows["hd"], pixel)
                                     for key in ("hu", "hv"))
                for values in (normalized_counts, pixel_counts):
                    assert all(math.isclose(a, b, rel_tol=1e-12, abs_tol=2e-12)
                               for a, b in zip(values, expected)), (pose, width, height, x, y, values, expected)
                    parity = (values[0] % 1 >= 0.5) == (values[1] % 1 >= 0.5)
                    expected_parity = (expected[0] - math.floor(expected[0]) >= 0.5) == (
                        expected[1] - math.floor(expected[1]) >= 0.5)
                    assert parity == expected_parity
                    checker_values.add(parity)
                ray_checks += 1
assert ray_checks > 0 and sky_checks > 0 and checker_values == {False, True}
for u, v, expected in [(.25, .25, True), (.25, .75, False), (.75, .25, False), (.75, .75, True), (-.25, -.75, False)]:
    assert ((u % 1 >= .5) == (v % 1 >= .5)) == expected
print(f"PASS Python syntax/project JSON, {count} cross-coordinate projection/count fixtures, checker parity, and vertical/horizontal FOV conversion.")
print(f"PASS normalized and device-pixel homographies: {ray_checks} independent off-axis ground rays, {sky_checks} sky rays, all 3 poses and {len(viewports)} viewport aspects.")
print(f"Horizontal FOV: {contract.HORIZONTAL_FOV_DEGREES:.12f} degrees. This static check does not launch Unreal or render.")
