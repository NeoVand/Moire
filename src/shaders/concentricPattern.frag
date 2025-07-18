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

// Rotate a 2D point
vec2 rotate2D(vec2 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// Shape distance functions
float sdCircle(vec2 p) {
  return length(p);
}

float sdBox(vec2 p) {
  vec2 d = abs(p) - vec2(1.0);
  return length(max(d, vec2(0.))) + min(max(d.x, d.y), 0.);
}

float sdPolygon(vec2 p, float n) {
  if (n < 3.0) return length(p);
  float angle = atan(p.y, p.x);
  float segmentAngle = TWO_PI / n;
  float halfSegment = segmentAngle * 0.5;
  angle = mod(angle + halfSegment, segmentAngle) - halfSegment;
  return length(p) * cos(angle);
}

// Newton's method for finding ring intersection
float findRingNewton(vec2 p, vec2 offset, float rotOffset, float spacing, float shapeType, float sides) {
  // Initial guess based on distance from center
  float n = length(p) / spacing;
  
  // For circles with offset, we can solve analytically
  if (shapeType < 1.5 && abs(rotOffset) < 0.001) {
    // Solve: |p - n*offset| = n*spacing
    // This expands to a quadratic equation in n
    vec2 o = offset;
    float a = dot(o, o) - spacing * spacing;
    float b = -2.0 * dot(p, o);
    float c = dot(p, p);
    
    if (abs(a) > 0.001) {
      float discriminant = b * b - 4.0 * a * c;
      if (discriminant >= 0.0) {
        float sqrtDisc = sqrt(discriminant);
        float n1 = (-b + sqrtDisc) / (2.0 * a);
        float n2 = (-b - sqrtDisc) / (2.0 * a);
        
        // Choose the positive solution closest to our initial guess
        if (n1 > 0.0 && n2 > 0.0) {
          n = (abs(n1 - n) < abs(n2 - n)) ? n1 : n2;
        } else if (n1 > 0.0) {
          n = n1;
        } else if (n2 > 0.0) {
          n = n2;
        }
      }
    }
  } else {
    // For other shapes or with rotation, use Newton's method
    for (int i = 0; i < 3; i++) {
      vec2 q = p - n * offset;
      q = rotate2D(q, -n * rotOffset);
      
      float dist;
      if (shapeType < 1.5) {
        dist = length(q);
      } else if (shapeType < 2.5) {
        dist = max(abs(q.x), abs(q.y));
      } else {
        float angle = atan(q.y, q.x);
        float segAngle = TWO_PI / sides;
        float halfSeg = segAngle * 0.5;
        angle = mod(angle + halfSeg, segAngle) - halfSeg;
        dist = length(q) * cos(angle);
      }
      
      float f = dist - n * spacing;
      
      // Compute derivative numerically
      float h = 0.001;
      vec2 q2 = p - (n + h) * offset;
      q2 = rotate2D(q2, -(n + h) * rotOffset);
      
      float dist2;
      if (shapeType < 1.5) {
        dist2 = length(q2);
      } else if (shapeType < 2.5) {
        dist2 = max(abs(q2.x), abs(q2.y));
      } else {
        float angle2 = atan(q2.y, q2.x);
        angle2 = mod(angle2 + halfSeg, segAngle) - halfSeg;
        dist2 = length(q2) * cos(angle2);
      }
      
      float df = (dist2 - (n + h) * spacing - f) / h;
      
      if (abs(df) > 0.001) {
        n = n - f / df;
      }
    }
  }
  
  return max(0.0, n);
}

void main() {
  vec2 screenCoord = (vTexCoord - 0.5) * u_resolution;
  vec2 worldCoord = (screenCoord - u_pan) / u_zoom;
  vec2 localCoord = rotate2D(worldCoord - u_position, -u_rotation);
  
  float spacing = 1.0 / u_density;
  vec2 offset = vec2(u_offsetX, u_offsetY);
  
  float minDist = 1e6;
  
  // Find the primary ring that might contain this pixel
  float primaryRing = findRingNewton(localCoord, offset, u_rotationOffset, spacing, u_shapeType, u_sides);
  
  // Check a small range around the primary ring
  // This handles the thickness of the lines and anti-aliasing
  int checkRange = 2;
  for (int i = -checkRange; i <= checkRange; i++) {
    float n = floor(primaryRing + 0.5) + float(i);
    if (n < 0.0) continue;
    
    vec2 q = localCoord - n * offset;
    q = rotate2D(q, -n * u_rotationOffset);
    
    float targetRadius = n * spacing - u_phase;
    if (targetRadius < 0.0) continue;
    
    float dist;
    if (u_shapeType < 1.5) {
      // Circle: distance to circle of given radius
      dist = abs(sdCircle(q) - targetRadius);
    } else if (u_shapeType < 2.5) {
      // Square: scale the point and compute distance
      dist = abs(sdBox(q / targetRadius) * targetRadius - targetRadius);
    } else {
      // Polygon: scale the point and compute distance
      dist = abs(sdPolygon(q / targetRadius, u_sides) * targetRadius - targetRadius);
    }
    
    minDist = min(minDist, dist);
  }
  
  // Anti-aliasing
  float halfThickness = u_thickness * 0.5;
  vec2 uvDelta = fwidth(vTexCoord);
  float pixelSize = length(uvDelta) * u_resolution.x / u_zoom;
  float alpha = 1.0 - smoothstep(halfThickness - pixelSize, halfThickness + pixelSize, minDist);
  
  fragColor = u_color;
  fragColor.a = alpha * u_opacity;
} 