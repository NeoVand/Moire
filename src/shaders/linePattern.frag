#version 300 es
precision highp float;
uniform float u_density;
uniform float u_angle;
uniform float u_thickness;
uniform vec4 u_color;
uniform vec2 u_resolution;
uniform vec2 u_pan;
uniform float u_zoom;
uniform float u_phase;
uniform float u_opacity;
uniform vec2 u_position;
uniform float u_rotation;
in vec2 vTexCoord;
out vec4 fragColor;

float lineSDF(vec2 p, float angle, float spacing, float phaseOffset) {
  vec2 dir = vec2(cos(angle), sin(angle));
  float proj = dot(p, dir) + phaseOffset;
  
  // Find distance to closest line
  float lineIndex = proj / spacing;
  float closestLine = floor(lineIndex + 0.5); // Round to nearest line
  float targetPos = closestLine * spacing;
  
  return abs(proj - targetPos);
}

void main() {
  vec2 uv = (vTexCoord - 0.5) * u_resolution / u_zoom + u_pan;
  vec2 pos = uv - u_position;
  float cosR = cos(u_rotation);
  float sinR = sin(u_rotation);
  uv = vec2(cosR * pos.x - sinR * pos.y, sinR * pos.x + cosR * pos.y);
  
  float spacing = 1.0 / u_density;
  float phaseOffset = u_phase;
  float dist = lineSDF(uv, u_angle, spacing, phaseOffset);
  float halfThickness = u_thickness * 0.5;
  
  // Improved anti-aliasing with pixel-perfect smoothstep
  float pixelSize = length(fwidth(uv));
  float alpha = 1.0 - smoothstep(halfThickness - pixelSize, halfThickness + pixelSize, dist);
  
  fragColor = u_color;
  fragColor.a = alpha * u_opacity;
} 