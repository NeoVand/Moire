#version 300 es
precision highp float;

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
uniform vec2 u_position;
uniform float u_rotation;
uniform float u_shapeType; // 1.0 = circles, 2.0 = squares, 3.0 = triangles

in vec2 vTexCoord;
out vec4 fragColor;

// Individual shape SDFs - distance to unit shape (0 on boundary, positive outside)
float shapeCircle(vec2 q) {
  return length(q) - 1.0;
}

float shapeSquare(vec2 q) {
  return max(abs(q.x), abs(q.y)) - 1.0;
}

float shapeTriangle(vec2 p) {
  // Sharp triangle using polar coordinates approach (avoids SDF rounding)
  // Based on http://thndl.com/square-shaped-shaders.html
  const float PI = 3.14159265359;
  const float TWO_PI = 6.28318530718;
  
  // Number of sides
  float N = 3.0;
  
  // Angle and radius from current point
  float a = atan(p.y, p.x) + PI;
  float r = TWO_PI / N;
  
  // Sharp triangle distance using cos modulation
  float d = cos(floor(0.5 + a/r) * r - a) * length(p);
  
  // Return distance from radius 1.0 boundary
  return d - 1.0;
}

// Universal concentric SDF solver using Newton's method
float concentricSDF(vec2 p, vec2 offset, float spacing, float phase, float shapeType) {
  const float epsilon = 1e-6;
  bool isCircle = shapeType < 1.5;
  bool isSquare = shapeType >= 1.5 && shapeType < 2.5;
  bool isTriangle = shapeType >= 2.5;
  
  // Initial guess for ring index
  float shapeDistAtP;
  if (isCircle) {
    shapeDistAtP = shapeCircle(p);
  } else if (isSquare) {
    shapeDistAtP = shapeSquare(p);
  } else {
    shapeDistAtP = shapeTriangle(p);
  }
  float n = max(0.0, (shapeDistAtP + phase) / spacing);
  
  // Newton's method: solve F(n) = shape(p - n*offset) - (n*spacing - phase) = 0
  for (int i = 0; i < 3; i++) {
    vec2 q = p - n * offset;
    
    // F(n) = shape(q) - (n*spacing - phase)
    float shapeDist;
    if (isCircle) {
      shapeDist = shapeCircle(q);
    } else if (isSquare) {
      shapeDist = shapeSquare(q);
    } else {
      shapeDist = shapeTriangle(q);
    }
    float f = shapeDist - (n * spacing - phase);
    
    // dF/dn = -dot(grad_shape, offset) - spacing
    vec2 gradShape;
    if (isCircle) {
      // Circle gradient
      gradShape = length(q) > epsilon ? normalize(q) : vec2(0.0);
    } else if (isSquare) {
      // Square gradient - depends on which face dominates
      if (abs(q.x) > abs(q.y)) {
        gradShape = vec2(sign(q.x), 0.0);
      } else {
        gradShape = vec2(0.0, sign(q.y));
      }
    } else {
      // Triangle gradient - numerical with appropriate step size for polar approach
      const float h = 0.001;
      float dx = shapeTriangle(q + vec2(h, 0.0)) - shapeTriangle(q - vec2(h, 0.0));
      float dy = shapeTriangle(q + vec2(0.0, h)) - shapeTriangle(q - vec2(0.0, h));
      gradShape = vec2(dx, dy) / (2.0 * h);
      
      // Ensure we have a valid gradient
      if (length(gradShape) < epsilon) {
        gradShape = normalize(q);
        if (length(gradShape) < epsilon) {
          gradShape = vec2(1.0, 0.0);
        }
      }
    }
    
    float df = -dot(gradShape, offset) - spacing;
    
    // Newton step: n = n - f/df
    if (abs(df) > epsilon) {
      n -= f / df;
    }
    n = max(0.0, n); // Keep positive
  }
  
  // Snap to nearest two integer rings and find minimum distance
  float n0 = floor(n);
  float n1 = n0 + 1.0;
  
  float minDist = 1e6;
  
  // Check ring n0
  if (n0 >= 0.0) {
    vec2 q0 = p - n0 * offset;
    float shapeDist0;
    if (isCircle) {
      shapeDist0 = shapeCircle(q0);
    } else if (isSquare) {
      shapeDist0 = shapeSquare(q0);
    } else {
      shapeDist0 = shapeTriangle(q0);
    }
    float targetSize0 = n0 * spacing - phase;
    float ringDist0 = abs(shapeDist0 - targetSize0);
    minDist = min(minDist, ringDist0);
  }
  
  // Check ring n1
  vec2 q1 = p - n1 * offset;
  float shapeDist1;
  if (isCircle) {
    shapeDist1 = shapeCircle(q1);
  } else if (isSquare) {
    shapeDist1 = shapeSquare(q1);
  } else {
    shapeDist1 = shapeTriangle(q1);
  }
  float targetSize1 = n1 * spacing - phase;
  if (targetSize1 >= 0.0) {
    float ringDist1 = abs(shapeDist1 - targetSize1);
    minDist = min(minDist, ringDist1);
  }
  
  return minDist;
}

void main() {
  vec2 uv = (vTexCoord - 0.5) * u_resolution / u_zoom + u_pan;
  vec2 pos = uv - u_position;
  
  // Apply rotation
  float cosR = cos(u_rotation);
  float sinR = sin(u_rotation);
  vec2 rotatedPos = vec2(cosR * pos.x - sinR * pos.y, sinR * pos.x + cosR * pos.y);
  
  float spacing = 1.0 / u_density;
  float phaseOffset = u_phase;
  vec2 offsetVec = vec2(u_offsetX, u_offsetY);
  
  // Use universal solver for both shapes
  float dist = concentricSDF(rotatedPos, offsetVec, spacing, phaseOffset, u_shapeType);
  
  float halfThickness = u_thickness * 0.5;
  
  // Anti-aliasing
  vec2 uvDelta = fwidth(vTexCoord);
  float pixelSize = length(uvDelta) * u_resolution.x / u_zoom;
  float alpha = 1.0 - smoothstep(halfThickness - pixelSize, halfThickness + pixelSize, dist);
  
  fragColor = u_color;
  fragColor.a = alpha * u_opacity;
} 