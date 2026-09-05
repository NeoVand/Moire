"""Camera-following planar Custom Material body; perspective views only."""

import math

import scene_contract as contract


def checker_code(period_world, diagnostic=False):
    if not math.isfinite(period_world) or period_world <= 0:
        raise ValueError("A positive finite period is required")
    # On the ground plane, q/clip.w and 1/clip.w are affine in raster pixels.
    # Form derivatives before any branch, then normalize all rows together
    # and center coordinates at this pixel. No fixed camera uniforms remain.
    return f"""float2 q = float2(WorldPosition.y, -WorldPosition.x) / {period_world * contract.CM_PER_WORLD_UNIT:.17g};
float w = rcp(max(LinearDepth, 0.001));
float2 n = q * w;
float3 hu = float3(ddx(n.x) / w, ddy(n.x) / w, q.x);
float3 hv = float3(ddx(n.y) / w, ddy(n.y) / w, q.y);
float3 hd = float3(ddx(w) / w, ddy(w) / w, 1.0);
bool valid = LinearDepth > 0.0 && all(isfinite(hu)) && all(isfinite(hv)) && all(isfinite(hd));
if (!valid) return float3(1.0, 0.0, 0.0);
float2 result = MoireKernel::checkerMeanH(hu, hv, hd, 0.0, 0.0, 1.0, 0.25);
if (result.y > 3.5) return float3(1.0, 0.0, 1.0);
""" + ("return result.y < 1.5 ? float3(0.1, 0.8, 0.3) : float3(0.1, 0.3, 0.9);" if diagnostic else f"""float value = {contract.DARK:.17g} + {contract.LIGHT - contract.DARK:.17g} * result.x;
return float3(value, value, value);""")
