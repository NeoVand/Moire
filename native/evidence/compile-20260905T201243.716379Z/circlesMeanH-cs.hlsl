#include "/Users/neo/repos/Moire/demo/ours-kernel.hlsl"
cbuffer Inputs : register(b0) { float4 HU; float4 HV; float4 HD; float4 Settings; };
RWStructuredBuffer<float2> Answer : register(u0);
[numthreads(1,1,1)] void Main(uint3 id : SV_DispatchThreadID) {
  Answer[id.x] = circlesMeanH(HU.xyz, HV.xyz, HD.xyz, Settings.x, Settings.y, Settings.z, Settings.w);
}
