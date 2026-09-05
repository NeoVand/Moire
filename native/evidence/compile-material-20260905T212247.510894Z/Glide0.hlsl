#define PI 3.141592653589793
#define TAU 6.283185307179586
#include "/Users/neo/repos/Moire/native/Unreal/MoireComparison/Shaders/Moire/Generated/Kernel.ush"
#include "/Users/neo/repos/Moire/native/Unreal/MoireComparison/Shaders/Moire/Generated/Kernel.ush"
cbuffer Settings : register(b0) { float2 InputViewportSize; float2 Padding; };
float3 MaterialBody(float2 ViewportUV, float2 ViewportSize) {
float3 hu = float3(-4.9739483536533182 / ViewportSize.x, 0 / ViewportSize.y, 2.4869741768266591);
float3 hv = float3(-0 / ViewportSize.x, -7.0009846081596132 / ViewportSize.y, 4.7840435426940902);
float3 hd = float3(-0 / ViewportSize.x, -0.90686329121238518 / ViewportSize.y, 0.2200586931308684);
float2 pixel = ViewportUV * ViewportSize;
float ink = MoireKernel::checkerMeanH(hu, hv, hd, pixel.x, pixel.y, 1.0, 0.25).x;
float value = 0.025000000000000001 + 0.79499999999999993 * ink;
return float3(value, value, value);
}
float4 Main(float2 InputUV : TEXCOORD0) : SV_Target0 {
  return float4(MaterialBody(InputUV, InputViewportSize), 1.0);
}
