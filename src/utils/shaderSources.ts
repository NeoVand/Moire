// Base vertex shader
export const baseVertexShader = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aPosition;
layout(location = 1) in vec2 aTexCoord;
out vec2 vTexCoord;

void main() {
  vTexCoord = aTexCoord;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

// Line pattern fragment shader
export const lineFragmentShader = `#version 300 es
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
  
  float lineIndex = proj / spacing;
  float closestLine = floor(lineIndex + 0.5);
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
  float pixelSize = length(fwidth(uv));
  float alpha = 1.0 - smoothstep(halfThickness - pixelSize, halfThickness + pixelSize, dist);
  
  fragColor = u_color;
  fragColor.a = alpha * u_opacity;
}`;

// Simple concentric pattern shader
export const simpleConcentricShader = `#version 300 es
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

vec2 rotate2D(vec2 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

void main() {
  // Transform to world coordinates
  vec2 uv = (vTexCoord - 0.5) * u_resolution / u_zoom + u_pan;
  vec2 p = uv - u_position;
  
  // Apply layer rotation
  p = rotate2D(p, u_rotation);
  
  float spacing = 1.0 / u_density;
  vec2 offset = vec2(u_offsetX, u_offsetY);
  float rotOffset = u_rotationOffset * PI / 180.0;
  
  float minDist = 1e6;
  
  // Adaptive ring checking
  bool hasOffset = length(offset) > 0.01 || abs(rotOffset) > 0.01;
  
  if (!hasOffset) {
    // Fast path for centered patterns - only check nearby rings
    float r = u_shapeType < 1.5 ? length(p) : 
              u_shapeType < 2.5 ? max(abs(p.x), abs(p.y)) :
              length(p);
    
    float ringFloat = max(0.0, (r - u_phase) / spacing);
    int baseRing = int(floor(ringFloat));
    
    for (int i = -1; i <= 2; i++) {
      int ring = baseRing + i;
      if (ring < 0) continue;
      
      float radius = float(ring) * spacing + u_phase;
      if (radius <= 0.0) continue;
      
      float dist;
      if (u_shapeType < 1.5) {
        dist = abs(length(p) - radius);
      } else if (u_shapeType < 2.5) {
        dist = abs(max(abs(p.x), abs(p.y)) - radius);
      } else {
        float sides = u_shapeType < 3.5 ? 3.0 : u_sides;
        float angle = atan(p.y, p.x);
        float a = TWO_PI / sides;
        float segment = mod(angle + PI/sides, a) - PI/sides;
        float apothem = radius * cos(PI/sides);
        float edgeDist = length(p) * cos(segment) - apothem;
        dist = abs(edgeDist);
      }
      
      minDist = min(minDist, dist);
    }
  } else {
    // For offset patterns, use limited search
    float viewRadius = length(u_resolution) / (2.0 * u_zoom);
    int maxRings = min(80, int(viewRadius / spacing) + 20);
    
    for (int i = 0; i < maxRings; i++) {
      float n = float(i);
      float radius = n * spacing + u_phase;
      
      if (radius <= 0.0) continue;
      
      vec2 q = p - n * offset;
      if (abs(rotOffset) > 0.001) {
        q = rotate2D(q, -n * rotOffset);
      }
      
      // Early exit check
      float approxDist = length(q) - radius;
      if (abs(approxDist) > viewRadius) continue;
      
      float dist;
      if (u_shapeType < 1.5) {
        dist = abs(length(q) - radius);
      } else if (u_shapeType < 2.5) {
        dist = abs(max(abs(q.x), abs(q.y)) - radius);
      } else {
        float sides = u_shapeType < 3.5 ? 3.0 : u_sides;
        float angle = atan(q.y, q.x);
        float a = TWO_PI / sides;
        float segment = mod(angle + PI/sides, a) - PI/sides;
        float apothem = radius * cos(PI/sides);
        float edgeDist = length(q) * cos(segment) - apothem;
        dist = abs(edgeDist);
      }
      
      minDist = min(minDist, dist);
      if (minDist < u_thickness * 0.5) break;
    }
  }
  
  // Better anti-aliasing for high DPI
  float halfThickness = u_thickness * 0.5;
  float pixelSize = 2.0 / u_zoom;
  float alpha = 1.0 - smoothstep(halfThickness - pixelSize, halfThickness + pixelSize, minDist);
  
  fragColor = u_color;
  fragColor.a = alpha * u_opacity;
}`; 

// Ultra-optimized concentric shader with aggressive optimizations
export const ultraFastConcentricShader = `#version 300 es
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

// Precomputed constants
vec2 rotate2D(vec2 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// Fast approximation for atan2 (less accurate but much faster)
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

// Correct polygon SDF
float polygonSDF(vec2 p, float radius, float n) {
  float angle = atan(p.y, p.x);
  float r = length(p);
  float apothem = radius * cos(PI/n);
  float anglePerSide = TWO_PI / n;
  float segment = mod(angle + PI/n, anglePerSide) - PI/n;
  return r * cos(segment) - apothem;
}

void main() {
  vec2 uv = (vTexCoord - 0.5) * u_resolution / u_zoom + u_pan;
  vec2 p = uv - u_position;
  p = rotate2D(p, u_rotation);
  
  float spacing = 1.0 / u_density;
  vec2 offset = vec2(u_offsetX, u_offsetY);
  float rotOffset = u_rotationOffset * PI / 180.0;
  
  // Get sides for polygons
  float sides = u_shapeType < 3.5 ? 3.0 : u_sides;
  
  float minDistSq = 1e12; // Use squared distances to avoid sqrt
  
  bool hasOffset = dot(offset, offset) > 0.0001 || abs(rotOffset) > 0.001;
  
  if (!hasOffset) {
    // Ultra-fast path for centered patterns
    float r2 = dot(p, p); // squared distance
    float r = sqrt(r2);
    
    // Quick estimation based on shape
    float shapeR = u_shapeType < 1.5 ? r : 
                   u_shapeType < 2.5 ? max(abs(p.x), abs(p.y)) : r;
    
    int baseRing = max(0, int((shapeR - u_phase) / spacing + 0.5));
    
    // Unroll loop for better performance
    for (int i = -1; i <= 1; i++) {
      float radius = float(baseRing + i) * spacing + u_phase;
      if (radius <= 0.0) continue;
      
      float distSq;
      if (u_shapeType < 1.5) {
        float diff = r - radius;
        distSq = diff * diff;
      } else if (u_shapeType < 2.5) {
        float diff = max(abs(p.x), abs(p.y)) - radius;
        distSq = diff * diff;
      } else {
        float dist = abs(polygonSDF(p, radius, sides));
        distSq = dist * dist;
      }
      
      minDistSq = min(minDistSq, distSq);
    }
  } else {
    // Optimized offset path
    float viewRadius = length(u_resolution) / (2.0 * u_zoom);
    int maxRings = min(50, int(viewRadius / spacing) + 10);
    
    // Precompute rotation matrices if needed
    float cosRot = abs(rotOffset) > 0.001 ? cos(rotOffset) : 1.0;
    float sinRot = abs(rotOffset) > 0.001 ? sin(rotOffset) : 0.0;
    
    for (int i = 0; i < maxRings; i++) {
      float n = float(i);
      float radius = n * spacing + u_phase;
      if (radius <= 0.0) continue;
      
      vec2 q = p - n * offset;
      
      // Apply incremental rotation using angle addition formulas
      if (abs(rotOffset) > 0.001) {
        float c = cosRot;
        float s = sinRot;
        // Use power reduction formulas for cos(n*theta) and sin(n*theta)
        for (int j = 0; j < i; j++) {
          float newC = c * cosRot - s * sinRot;
          float newS = s * cosRot + c * sinRot;
          c = newC;
          s = newS;
        }
        q = vec2(c * q.x + s * q.y, -s * q.x + c * q.y);
      }
      
      // Quick bounds check
      float q2 = dot(q, q);
      if (abs(sqrt(q2) - radius) > viewRadius) continue;
      
      float distSq;
      if (u_shapeType < 1.5) {
        float diff = sqrt(q2) - radius;
        distSq = diff * diff;
      } else if (u_shapeType < 2.5) {
        float diff = max(abs(q.x), abs(q.y)) - radius;
        distSq = diff * diff;
              } else {
          float dist = abs(polygonSDF(q, radius, sides));
          distSq = dist * dist;
        }
      
      minDistSq = min(minDistSq, distSq);
      if (minDistSq < u_thickness * u_thickness * 0.25) break;
    }
  }
  
  float minDist = sqrt(minDistSq);
  float halfThickness = u_thickness * 0.5;
  float pixelSize = 1.5 / u_zoom;
  float alpha = 1.0 - smoothstep(halfThickness - pixelSize, halfThickness + pixelSize, minDist);
  
  fragColor = u_color;
  fragColor.a = alpha * u_opacity;
}`; 

// Fast and correct concentric shader
export const fastConcentricShader = `#version 300 es
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

vec2 rotate2D(vec2 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// Correct polygon distance
float polygonDist(vec2 p, float radius, float n) {
  float angle = atan(p.y, p.x);
  float r = length(p);
  float anglePerSide = TWO_PI / n;
  float segment = mod(angle + PI/n, anglePerSide) - PI/n;
  float apothem = radius * cos(PI/n);
  return abs(r * cos(segment) - apothem);
}

void main() {
  vec2 uv = (vTexCoord - 0.5) * u_resolution / u_zoom + u_pan;
  vec2 p = uv - u_position;
  p = rotate2D(p, u_rotation);
  
  float spacing = 1.0 / u_density;
  vec2 offset = vec2(u_offsetX, u_offsetY);
  float rotOffset = u_rotationOffset * PI / 180.0;
  
  float minDist = 1e6;
  bool hasOffset = length(offset) > 0.01 || abs(rotOffset) > 0.01;
  
  if (!hasOffset) {
    // Fast path - only check 3-4 rings
    float r = length(p);
    float approxR = u_shapeType < 1.5 ? r : 
                    u_shapeType < 2.5 ? max(abs(p.x), abs(p.y)) : 
                    r * 0.866; // Approximate for triangle
    
    int baseRing = max(0, int((approxR - u_phase) / spacing + 0.5));
    
    for (int i = -1; i <= 2; i++) {
      int ring = baseRing + i;
      if (ring < 0) continue;
      
      float radius = float(ring) * spacing + u_phase;
      if (radius <= 0.0) continue;
      
      float dist;
      if (u_shapeType < 1.5) {
        dist = abs(r - radius);
      } else if (u_shapeType < 2.5) {
        dist = abs(max(abs(p.x), abs(p.y)) - radius);
      } else {
        float n = u_shapeType < 3.5 ? 3.0 : u_sides;
        dist = polygonDist(p, radius, n);
      }
      
      minDist = min(minDist, dist);
    }
  } else {
    // Offset path - check more rings but with optimizations
    float viewRadius = length(u_resolution) / (2.0 * u_zoom);
    int maxRings = min(60, int(viewRadius / spacing) + 15);
    
    for (int i = 0; i < maxRings; i++) {
      float n = float(i);
      float radius = n * spacing + u_phase;
      if (radius <= 0.0) continue;
      
      vec2 q = p - n * offset;
      if (abs(rotOffset) > 0.001) {
        q = rotate2D(q, -n * rotOffset);
      }
      
      // Quick rejection test
      float qLen = length(q);
      if (abs(qLen - radius) > viewRadius * 0.5) continue;
      
      float dist;
      if (u_shapeType < 1.5) {
        dist = abs(qLen - radius);
      } else if (u_shapeType < 2.5) {
        dist = abs(max(abs(q.x), abs(q.y)) - radius);
      } else {
        float sides = u_shapeType < 3.5 ? 3.0 : u_sides;
        dist = polygonDist(q, radius, sides);
      }
      
      minDist = min(minDist, dist);
      
      // Early exit
      if (minDist < u_thickness * 0.25) break;
    }
  }
  
  // Anti-aliasing
  float halfThickness = u_thickness * 0.5;
  float pixelSize = 1.5 / u_zoom;
  float alpha = 1.0 - smoothstep(halfThickness - pixelSize, halfThickness + pixelSize, minDist);
  
  fragColor = u_color;
  fragColor.a = alpha * u_opacity;
}`; 