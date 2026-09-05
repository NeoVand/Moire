#include "/Users/neo/repos/Moire/native/evidence/candidate-20260905T215650Z/kernel.hlsl"
cbuffer Inputs : register(b0) { float4 HU; float4 HV; float4 HD; float4 Settings; };
float4 Main(float4 pixel : SV_Position) : SV_Target0 {
  float2 result = checkerMeanH(HU.xyz, HV.xyz, HD.xyz, pixel.x, pixel.y, Settings.z, Settings.w);
  return float4(result, 0.0, 1.0);
}
