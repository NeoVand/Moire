#define PI 3.141592653589793
#define TAU 6.283185307179586
#include "/Users/neo/repos/Moire/native/Unreal/MoireComparison/Shaders/Moire/Generated/Kernel.ush"
#include "/Users/neo/repos/Moire/native/Unreal/MoireComparison/Shaders/Moire/Generated/Kernel.ush"
cbuffer Settings : register(b0) { float2 InputViewportSize; float2 Padding; };
float3 MaterialBody(float3 WorldPosition, float LinearDepth) {
float2 q = float2(WorldPosition.y, -WorldPosition.x) / 200;
float w = rcp(max(LinearDepth, 0.001));
float2 n = q * w;
float3 hu = float3(ddx(n.x) / w, ddy(n.x) / w, q.x);
float3 hv = float3(ddx(n.y) / w, ddy(n.y) / w, q.y);
float3 hd = float3(ddx(w) / w, ddy(w) / w, 1.0);
bool valid = LinearDepth > 0.0 && all(isfinite(hu)) && all(isfinite(hv)) && all(isfinite(hd));
if (!valid) return float3(1.0, 0.0, 0.0);
float2 result = MoireKernel::checkerMeanH(hu, hv, hd, 0.0, 0.0, 1.0, 0.25);
if (result.y > 3.5) return float3(1.0, 0.0, 1.0);
float value = 0.025000000000000001 + 0.79499999999999993 * result.x;
return float3(value, value, value);
}
float4 Main(float3 InputWorld : TEXCOORD0, float InputDepth : TEXCOORD1) : SV_Target0 {
  return float4(MaterialBody(InputWorld, InputDepth), 1.0);
}
