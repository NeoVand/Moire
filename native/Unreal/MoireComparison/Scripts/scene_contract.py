"""Pure Python scene contract; importing this file does not load Unreal."""

import math

PACKAGE_ROOT = "/Game/MoireComparison"
CM_PER_WORLD_UNIT = 100.0
WIDTH, HEIGHT = 1920, 1080
VERTICAL_FOV_DEGREES = 50.0
HORIZONTAL_FOV_DEGREES = math.degrees(
    2.0 * math.atan(math.tan(math.radians(VERTICAL_FOV_DEGREES / 2.0)) * WIDTH / HEIGHT)
)
BASE_PERIOD_WORLD = 4.0
PLANE_WIDTH_WORLD = 100000.0
DARK, LIGHT = 0.025, 0.82
SKY = (0.105, 0.13, 0.16)
POSES = (
    {"name": "Glide0", "motion": "glide", "time": 0.0, "detail": 1.0},
    {"name": "Glide8", "motion": "glide", "time": 8.0, "detail": 1.0},
    {"name": "Approach4", "motion": "approach", "time": 4.0, "detail": 2.0},
)


def three_to_unreal(point):
    """Three right-handed Y-up -> Unreal left-handed Z-up, in centimeters."""
    x, y, z = point
    return (-z * CM_PER_WORLD_UNIT, x * CM_PER_WORLD_UNIT, y * CM_PER_WORLD_UNIT)


def camera_pose(pose):
    """Same cameraPose as src/compare/scene.ts, expressed in both conventions."""
    time = pose["time"]
    x = math.sin(time * 0.28) * 6.0 if pose["motion"] == "glide" else 0.0
    z = 28.0 - math.sin(time * 0.22) * 12.0 if pose["motion"] == "approach" else 28.0
    eye = (x, 12.0, z)
    target = (x * 0.45, 0.0, z - 50.0)
    location = three_to_unreal(eye)
    look_at = three_to_unreal(target)
    forward = tuple(b - a for a, b in zip(location, look_at))
    pitch = math.degrees(math.atan2(forward[2], math.hypot(*forward[:2])))
    yaw = math.degrees(math.atan2(forward[1], forward[0]))
    return {
        **pose, "three_eye": eye, "three_target": target,
        "unreal_location_cm": location, "unreal_target_cm": look_at,
        "unreal_rotation_degrees": {"pitch": pitch, "yaw": yaw, "roll": 0.0},
        "period_world": BASE_PERIOD_WORLD / pose["detail"],
        "horizontal_fov_degrees": HORIZONTAL_FOV_DEGREES,
    }


def checker_code(period_world):
    """Unfiltered source only. This is not an analytic filtering implementation."""
    period_cm = period_world * CM_PER_WORLD_UNIT
    return f"""float2 q = float2(WorldPosition.y, -WorldPosition.x) / {period_cm:.17g};
float2 cell = frac(q);
float ink = ((cell.x >= 0.5) == (cell.y >= 0.5)) ? 1.0 : 0.0;
return float3({DARK:.17g} + ({LIGHT:.17g} - {DARK:.17g}) * ink,
              {DARK:.17g} + ({LIGHT:.17g} - {DARK:.17g}) * ink,
              {DARK:.17g} + ({LIGHT:.17g} - {DARK:.17g}) * ink);"""
