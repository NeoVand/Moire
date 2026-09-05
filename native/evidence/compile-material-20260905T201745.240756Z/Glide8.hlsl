#define PI 3.141592653589793
#define TAU 6.283185307179586
#include "/Users/neo/repos/Moire/native/Unreal/MoireComparison/Shaders/Moire/Generated/Kernel.ush"
#include "/Users/neo/repos/Moire/native/Unreal/MoireComparison/Shaders/Moire/Generated/Kernel.ush"
cbuffer Settings : register(b0) { float2 InputViewportSize; float2 Padding; };
float3 MaterialBody(float2 ViewportUV, float2 ViewportSize) {
float3 hu = float3(-4.9672976211300854 / ViewportSize.x, -1.1006901829870057 / ViewportSize.y, 2.9105993899962623);
float3 hv = float3(0.2571314215064946 / ViewportSize.x, -6.9997490830916886 / ViewportSize.y, 4.653237110960716);
float3 hd = float3(0 / ViewportSize.x, -0.90692929487536089 / ViewportSize.y, 0.22038677831620426);
float2 pixel = ViewportUV * ViewportSize;
float ink = MoireKernel::checkerMeanH(hu, hv, hd, pixel.x, pixel.y, 1.0, 0.25).x;
float value = 0.025000000000000001 + 0.79499999999999993 * ink;
return float3(value, value, value);
}
float4 Main(float2 InputUV : TEXCOORD0) : SV_Target0 {
  return float4(MaterialBody(InputUV, InputViewportSize), 1.0);
}
