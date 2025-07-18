#version 300 es
precision highp float;

const float PI = 3.14159265359;
const float TWO_PI = 6.28318530718;

uniform float u_density;
uniform float u_thickness;
uniform vec4 u_color;
uniform vec2 u_resolution;
uniform vec2 u_pan;
uniform float u_zoom;
uniform float u_opacity;
uniform float u_phase;
uniform float u_offsetX;
uniform float u_offsetY;
uniform float u_rotationOffset;
uniform vec2 u_position;
uniform float u_rotation;
uniform float u_shapeType;
uniform float u_sides;

in vec2 vTexCoord;
out vec4 fragColor;

// Fast approximation of atan2 for better performance
float fastAtan2(float y, float x) {
  float ax = abs(x);
  float ay = abs(y);
  float a = min(ax, ay) / max(ax, ay);
  float s = a * a;
  float r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a;
  if (ay > ax) r = 1.57079637 - r;
  if (x < 0.0) r = PI - r;
  if (y < 0.0) r = -r;
  return r;
}

// Continuous field function for concentric patterns
float concentricField(vec2 p, vec2 offset, float rotOffset, float spacing) {
  // This function computes a continuous "phase" for the pattern
  // Instead of checking discrete rings, we compute where in the pattern cycle we are
  
  if (length(offset) < 0.001 && abs(rotOffset) < 0.001) {
    // Simple case: no offsets
    return length(p) / spacing;
  }
  
  // For patterns with offset, we need to solve the inverse mapping
  // The key insight: each ring n is at position n*offset with rotation n*rotOffset
  // We want to find the continuous "ring parameter" t such that:
  // p = t*offset + rotate(baseShape, t*rotOffset) * t*spacing
  
  // For small offsets, use Taylor expansion
  if (length(offset) < 0.1 * spacing && abs(rotOffset) < 0.1) {
    float r = length(p);
    vec2 dir = p / (r + 0.001);
    
    // First-order correction for offset
    float correction = dot(dir, offset) / spacing;
    
    // First-order correction for rotation
    if (abs(rotOffset) > 0.001) {
      vec2 perpDir = vec2(-dir.y, dir.x);
      correction += r * rotOffset * dot(perpDir, offset) / (spacing * spacing);
    }
    
    return (r + correction) / spacing;
  }
  
  // For larger offsets, use iterative refinement
  float t = length(p) / spacing; // Initial guess
  
  // Gauss-Newton iteration
  for (int i = 0; i < 3; i++) {
    vec2 expectedPos = t * offset;
    float expectedAngle = t * rotOffset;
    
    // Rotate the radial vector
    vec2 radial = vec2(cos(expectedAngle), sin(expectedAngle)) * t * spacing;
    vec2 error = p - (expectedPos + radial);
    
    // Compute Jacobian
    vec2 dt_offset = offset;
    vec2 dt_rotation = vec2(-sin(expectedAngle), cos(expectedAngle)) * t * spacing * rotOffset + 
                       vec2(cos(expectedAngle), sin(expectedAngle)) * spacing;
    vec2 dt_total = dt_offset + dt_rotation;
    
    // Newton step
    float step = dot(error, dt_total) / (dot(dt_total, dt_total) + 0.001);
    t += step;
    
    // Converged?
    if (abs(step) < 0.001) break;
  }
  
  return max(0.0, t);
}

// Shape distance functions that work with continuous parameters
float shapeDistance(vec2 p, float t, float shapeType, float sides) {
  if (shapeType < 1.5) {
    // Circle
    return length(p);
  } else if (shapeType < 2.5) {
    // Square
    return max(abs(p.x), abs(p.y));
  } else {
    // Polygon
    float angle = fastAtan2(p.y, p.x);
    float segmentAngle = TWO_PI / sides;
    float halfSegment = segmentAngle * 0.5;
    angle = mod(angle + halfSegment, segmentAngle) - halfSegment;
    return length(p) * cos(angle);
  }
}

void main() {
  vec2 screenCoord = (vTexCoord - 0.5) * u_resolution;
  vec2 worldCoord = (screenCoord - u_pan) / u_zoom;
  
  // Apply layer transform
  vec2 p = worldCoord - u_position;
  float c = cos(-u_rotation);
  float s = sin(-u_rotation);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  
  float spacing = 1.0 / u_density;
  vec2 offset = vec2(u_offsetX, u_offsetY);
  
  // Get continuous field parameter
  float fieldParam = concentricField(p, offset, u_rotationOffset, spacing);
  
  // Apply phase
  fieldParam -= u_phase / spacing;
  
  // Extract ring index and position within ring
  float ringIndex = floor(fieldParam);
  float ringFraction = fract(fieldParam);
  
  // Compute actual position for this ring
  vec2 ringOffset = ringIndex * offset;
  float ringRotation = ringIndex * u_rotationOffset;
  
  // Transform to ring-local coordinates
  vec2 q = p - ringOffset;
  c = cos(-ringRotation);
  s = sin(-ringRotation);
  q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  
  // Compute shape distance
  float shapeDist = shapeDistance(q, ringIndex, u_shapeType, u_sides);
  float targetRadius = ringIndex * spacing;
  
  // Distance to the ring
  float dist = abs(shapeDist - targetRadius);
  
  // Also check adjacent rings for anti-aliasing
  float dist2 = 1e6;
  if (ringFraction < 0.1 || ringFraction > 0.9) {
    float adjRing = (ringFraction < 0.5) ? ringIndex - 1.0 : ringIndex + 1.0;
    if (adjRing >= 0.0) {
      vec2 adjOffset = adjRing * offset;
      float adjRotation = adjRing * u_rotationOffset;
      vec2 adjQ = p - adjOffset;
      c = cos(-adjRotation);
      s = sin(-adjRotation);
      adjQ = vec2(c * adjQ.x - s * adjQ.y, s * adjQ.x + c * adjQ.y);
      float adjShapeDist = shapeDistance(adjQ, adjRing, u_shapeType, u_sides);
      float adjTargetRadius = adjRing * spacing;
      dist2 = abs(adjShapeDist - adjTargetRadius);
    }
  }
  
  dist = min(dist, dist2);
  
  // Anti-aliasing
  float halfThickness = u_thickness * 0.5;
  vec2 uvDelta = fwidth(vTexCoord);
  float pixelSize = length(uvDelta) * u_resolution.x / u_zoom;
  float alpha = 1.0 - smoothstep(halfThickness - pixelSize, halfThickness + pixelSize, dist);
  
  fragColor = u_color;
  fragColor.a = alpha * u_opacity;
} 