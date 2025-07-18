#version 300 es
precision highp float;

const float PI = 3.14159265359;
const float TWO_PI = 6.28318530718;
const float EPSILON = 1e-6;

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

// Debug mode - uncomment to visualize convergence issues
// #define DEBUG_MODE

// Rotate a 2D point by angle (in radians)
vec2 rotate2D(vec2 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

// Individual shape SDFs
float shapeCircle(vec2 q) {
  return length(q) - 1.0;
}

float shapeSquare(vec2 q) {
  return max(abs(q.x), abs(q.y)) - 1.0;
}

// Simple polygon SDF using standard approach
float shapePolygon(vec2 p, float n) {
  if (n < 3.0) return length(p) - 1.0;
  
  float angle = atan(p.y, p.x);
  float radius = length(p);
  
  // Create regular polygon
  float anglePerSide = TWO_PI / n;
  float halfAngle = anglePerSide * 0.5;
  
  // Map to nearest edge
  float a = mod(angle + halfAngle, anglePerSide) - halfAngle;
  
  // Distance to edge
  return radius * cos(a) - cos(halfAngle);
}

float shapeTriangle(vec2 p) {
  return shapePolygon(p, 3.0);
}

// Structure to return debug info
struct SDFResult {
  float dist;
  int iterations;
  bool converged;
  float finalN;
};

// Universal concentric SDF solver using Newton's method with debug info
SDFResult concentricSDFDebug(vec2 p, vec2 offset, float spacing, float phase, float shapeType, float sides, float rotationOffset) {
  SDFResult result;
  result.dist = 1e6;
  result.iterations = 0;
  result.converged = false;
  result.finalN = 0.0;
  
  bool isCircle = shapeType < 1.5;
  bool isSquare = shapeType >= 1.5 && shapeType < 2.5;
  bool isTriangle = shapeType >= 2.5 && shapeType < 3.5;
  
  // Initial guess for ring index
  float distanceFromOrigin = length(p);
  float n = max(0.0, (distanceFromOrigin + phase) / spacing);
  
  // Refine initial guess
  for (int i = 0; i < 2; i++) {
    vec2 q = p - n * offset;
    q = rotate2D(q, n * rotationOffset);
    
    float shapeDist;
    if (isCircle) {
      shapeDist = shapeCircle(q);
    } else if (isSquare) {
      shapeDist = shapeSquare(q);
    } else if (isTriangle) {
      shapeDist = shapeTriangle(q);
    } else {
      shapeDist = shapePolygon(q, sides);
    }
    
    float newN = max(0.0, (shapeDist + phase) / spacing);
    n = mix(n, newN, 0.5);
  }
  
  // Newton's method iterations
  float lastN = n;
  for (int i = 0; i < 5; i++) { // Increased iterations
    result.iterations = i + 1;
    
    vec2 q = p - n * offset;
    q = rotate2D(q, n * rotationOffset);
    
    float shapeDist;
    if (isCircle) {
      shapeDist = shapeCircle(q);
    } else if (isSquare) {
      shapeDist = shapeSquare(q);
    } else if (isTriangle) {
      shapeDist = shapeTriangle(q);
    } else {
      shapeDist = shapePolygon(q, sides);
    }
    float f = shapeDist - (n * spacing - phase);
    
    // Check if we're close enough
    if (abs(f) < 0.001 * spacing) {
      result.converged = true;
      break;
    }
    
    // Calculate gradient using finite differences
    vec2 gradShape;
    if (isCircle) {
      gradShape = normalize(q);
    } else if (isSquare) {
      if (abs(q.x) > abs(q.y)) {
        gradShape = vec2(sign(q.x), 0.0);
      } else {
        gradShape = vec2(0.0, sign(q.y));
      }
    } else {
      // Numerical gradient for polygons with adaptive step
      float h = max(0.001, length(q) * 0.001);
      float dx, dy;
      if (isTriangle) {
        dx = shapeTriangle(q + vec2(h, 0.0)) - shapeTriangle(q - vec2(h, 0.0));
        dy = shapeTriangle(q + vec2(0.0, h)) - shapeTriangle(q - vec2(0.0, h));
      } else {
        dx = shapePolygon(q + vec2(h, 0.0), sides) - shapePolygon(q - vec2(h, 0.0), sides);
        dy = shapePolygon(q + vec2(0.0, h), sides) - shapePolygon(q - vec2(0.0, h), sides);
      }
      vec2 grad = vec2(dx, dy) / (2.0 * h);
      gradShape = length(grad) > EPSILON ? normalize(grad) : vec2(1.0, 0.0);
    }
    
    // Calculate derivative with rotation - FIXED version
    vec2 rotatedOffset = rotate2D(offset, n * rotationOffset);
    
    // The position derivative includes rotation effect
    vec2 positionDerivative = -rotatedOffset;
    
    // The rotation derivative
    if (abs(rotationOffset) > EPSILON) {
      vec2 rotDerivative = rotationOffset * vec2(-q.y, q.x);
      positionDerivative += rotDerivative;
    }
    
    float df = dot(gradShape, positionDerivative) - spacing;
    
    // Check for zero derivative (can't make progress)
    if (abs(df) < EPSILON) {
      break;
    }
    
    // Newton step with damping for stability
    float step = f / df;
    
    // Limit step size to prevent overshooting
    step = clamp(step, -spacing * 0.5, spacing * 0.5);
    
    n -= step;
    n = max(0.0, n);
    
    // Check if we're making progress
    if (abs(n - lastN) < EPSILON) {
      break;
    }
    lastN = n;
  }
  
  result.finalN = n;
  
  // Check nearest rings
  float n0 = floor(n);
  float n1 = n0 + 1.0;
  
  if (n0 >= 0.0) {
    vec2 q0 = p - n0 * offset;
    q0 = rotate2D(q0, n0 * rotationOffset);
    float shapeDist0;
    if (isCircle) {
      shapeDist0 = shapeCircle(q0);
    } else if (isSquare) {
      shapeDist0 = shapeSquare(q0);
    } else if (isTriangle) {
      shapeDist0 = shapeTriangle(q0);
    } else {
      shapeDist0 = shapePolygon(q0, sides);
    }
    float targetSize0 = n0 * spacing - phase;
    result.dist = abs(shapeDist0 - targetSize0);
  }
  
  vec2 q1 = p - n1 * offset;
  q1 = rotate2D(q1, n1 * rotationOffset);
  float shapeDist1;
  if (isCircle) {
    shapeDist1 = shapeCircle(q1);
  } else if (isSquare) {
    shapeDist1 = shapeSquare(q1);
  } else if (isTriangle) {
    shapeDist1 = shapeTriangle(q1);
  } else {
    shapeDist1 = shapePolygon(q1, sides);
  }
  float targetSize1 = n1 * spacing - phase;
  if (targetSize1 >= 0.0) {
    result.dist = min(result.dist, abs(shapeDist1 - targetSize1));
  }
  
  return result;
}

// Robust solver using binary search - works well for all offset types
float concentricSDFRotationFirst(vec2 p, vec2 offset, float spacing, float phase, float shapeType, float sides, float rotationOffset) {
  bool isCircle = shapeType < 1.5;
  bool isSquare = shapeType >= 1.5 && shapeType < 2.5;
  bool isTriangle = shapeType >= 2.5 && shapeType < 3.5;
  
  // Binary search for the ring index
  float minN = 0.0;
  
  // Better upper bound calculation
  // Account for the maximum distance we might need to check
  float maxOffset = length(offset) * 100.0; // Assume we won't go beyond 100 rings
  float maxRotation = abs(rotationOffset) * 100.0;
  float maxN = (length(p) + maxOffset + maxRotation + abs(phase)) / spacing + 5.0;
  
  // Binary search for the ring that contains our point
  for (int iter = 0; iter < 20; iter++) {
    float midN = (minN + maxN) * 0.5;
    
    vec2 q = p - midN * offset;
    q = rotate2D(q, midN * rotationOffset);
    
    float shapeDist;
    if (isCircle) {
      shapeDist = shapeCircle(q);
    } else if (isSquare) {
      shapeDist = shapeSquare(q);
    } else if (isTriangle) {
      shapeDist = shapeTriangle(q);
    } else {
      shapeDist = shapePolygon(q, sides);
    }
    
    float targetRadius = midN * spacing - phase;
    
    if (shapeDist < targetRadius) {
      // We're inside ring midN, so the answer is less than midN
      maxN = midN;
    } else {
      // We're outside ring midN, so the answer is greater than midN
      minN = midN;
    }
    
    // Stop if we've converged
    if (maxN - minN < 0.001) {
      break;
    }
  }
  
  // Check nearest rings
  float n = (minN + maxN) * 0.5;
  float n0 = floor(n);
  
  // For polygons, check more rings as the distance field is less smooth
  int ringsToCheck = (isTriangle || (!isCircle && !isSquare)) ? 3 : 2;
  
  float minDist = 1e6;
  
  for (int i = -1; i < ringsToCheck; i++) {
    float ringN = n0 + float(i);
    if (ringN < 0.0) continue;
    
    vec2 q = p - ringN * offset;
    q = rotate2D(q, ringN * rotationOffset);
    
    float shapeDist;
    if (isCircle) {
      shapeDist = shapeCircle(q);
    } else if (isSquare) {
      shapeDist = shapeSquare(q);
    } else if (isTriangle) {
      shapeDist = shapeTriangle(q);
    } else {
      shapeDist = shapePolygon(q, sides);
    }
    
    float targetSize = ringN * spacing - phase;
    if (targetSize >= 0.0) {
      minDist = min(minDist, abs(shapeDist - targetSize));
    }
  }
  
  return minDist;
}

// Optimized brute force for overlapping rings
float concentricSDFBruteForce(vec2 p, vec2 offset, float spacing, float phase, float shapeType, float sides, float rotationOffset) {
  bool isCircle = shapeType < 1.5;
  bool isSquare = shapeType >= 1.5 && shapeType < 2.5;
  bool isTriangle = shapeType >= 2.5 && shapeType < 3.5;
  
  float minDist = 1e6;
  
  // First, get a rough estimate of which ring we're near
  float roughDist = length(p);
  float centerRing = (roughDist + phase) / spacing;
  
  // Calculate search range based on how much rings can move due to offsets
  float maxDisplacement = length(offset) * centerRing + abs(rotationOffset) * centerRing * spacing;
  float searchRadius = maxDisplacement / spacing + 5.0;
  
  int startRing = max(0, int(centerRing - searchRadius));
  int endRing = int(centerRing + searchRadius) + 1;
  
  // For very large rotations, we need to check more rings
  if (abs(rotationOffset) > 0.5) {
    // Rings can wrap around multiple times
    float wraps = abs(rotationOffset) / TWO_PI;
    int extraRings = int(wraps * 20.0);
    endRing += extraRings;
  }
  
  // Limit to prevent performance issues
  endRing = min(endRing, startRing + 50);
  
  // Check rings in the search range
  for (int n = startRing; n <= endRing; n++) {
    float ringN = float(n);
    vec2 q = p - ringN * offset;
    q = rotate2D(q, ringN * rotationOffset);
    
    float shapeDist;
    if (isCircle) {
      shapeDist = shapeCircle(q);
    } else if (isSquare) {
      shapeDist = shapeSquare(q);
    } else if (isTriangle) {
      shapeDist = shapeTriangle(q);
    } else {
      shapeDist = shapePolygon(q, sides);
    }
    
    float targetSize = ringN * spacing - phase;
    if (targetSize >= 0.0) {
      float dist = abs(shapeDist - targetSize);
      minDist = min(minDist, dist);
      
      // Early exit if we found a perfect match
      if (dist < 0.001 * spacing) {
        break;
      }
    }
  }
  
  return minDist;
}

// Ultimate solver - handles all cases including extreme offsets
float concentricSDFUltimate(vec2 p, vec2 offset, float spacing, float phase, float shapeType, float sides, float rotationOffset) {
  bool isCircle = shapeType < 1.5;
  bool isSquare = shapeType >= 1.5 && shapeType < 2.5;
  bool isTriangle = shapeType >= 2.5 && shapeType < 3.5;
  
  float minDist = 1e6;
  
  // Different strategies based on offset type
  bool hasTranslation = length(offset) > 0.001;
  bool hasRotation = abs(rotationOffset) > 0.001;
  
  // For pure translation or small rotation, use optimized search
  if (!hasRotation || (hasRotation && abs(rotationOffset) < 0.05)) {
    // Estimate ring range based on position
    float currentDist = length(p);
    float ringEstimate = (currentDist + phase) / spacing;
    
    // Search range depends on offset magnitude
    float searchRange = 10.0;
    if (hasTranslation) {
      // Need to check many more rings when there's translation
      searchRange += length(offset) * 100.0 / spacing;
    }
    if (hasRotation) {
      searchRange += abs(rotationOffset) * 20.0;
    }
    
    int startRing = max(0, int(ringEstimate - searchRange));
    int endRing = int(ringEstimate + searchRange);
    
    for (int n = startRing; n <= endRing; n++) {
      float ringN = float(n);
      vec2 q = p - ringN * offset;
      q = rotate2D(q, ringN * rotationOffset);
      
      float shapeDist;
      if (isCircle) {
        shapeDist = shapeCircle(q);
      } else if (isSquare) {
        shapeDist = shapeSquare(q);
      } else if (isTriangle) {
        shapeDist = shapeTriangle(q);
      } else {
        shapeDist = shapePolygon(q, sides);
      }
      
      float targetSize = ringN * spacing - phase;
      if (targetSize >= 0.0) {
        minDist = min(minDist, abs(shapeDist - targetSize));
      }
    }
  } else {
    // For significant rotation, we need a different approach
    // Rings can spiral and overlap extensively
    
    // Calculate how many rings we need to check
    // This is based on the viewport size and maximum possible displacement
    float viewportRadius = length(u_resolution) / u_zoom;
    float maxRingRadius = viewportRadius + length(u_pan) + 100.0;
    
    // With rotation, inner rings can spiral outward
    // and outer rings can spiral inward
    int maxRings = int(maxRingRadius / spacing);
    
    // Add extra rings for rotation spiral
    float spiralFactor = abs(rotationOffset) / PI;
    maxRings += int(spiralFactor * float(maxRings));
    
    // Higher cap to ensure we don't miss rings
    maxRings = min(maxRings, 500);
    
    // Check all rings - this is expensive but necessary for correctness
    for (int n = 0; n <= maxRings; n++) {
      float ringN = float(n);
      
      // Early skip for rings that start very far away
      float baseRadius = ringN * spacing - phase;
      if (baseRadius < 0.0) continue;
      if (baseRadius > maxRingRadius * 2.0) break;
      
      vec2 q = p - ringN * offset;
      q = rotate2D(q, ringN * rotationOffset);
      
      float shapeDist;
      if (isCircle) {
        shapeDist = shapeCircle(q);
      } else if (isSquare) {
        shapeDist = shapeSquare(q);
      } else if (isTriangle) {
        shapeDist = shapeTriangle(q);
      } else {
        shapeDist = shapePolygon(q, sides);
      }
      
      float targetSize = baseRadius;
      minDist = min(minDist, abs(shapeDist - targetSize));
    }
  }
  
  return minDist;
}

// Smart ring finder - uses analytical bounds to minimize checks
float concentricSDFSmart(vec2 p, vec2 offset, float spacing, float phase, float shapeType, float sides, float rotationOffset) {
  bool isCircle = shapeType < 1.5;
  bool isSquare = shapeType >= 1.5 && shapeType < 2.5;
  bool isTriangle = shapeType >= 2.5 && shapeType < 3.5;
  
  float minDist = 1e6;
  
  // Key insight: for a point p, we can estimate which rings might contain it
  // by solving the inverse problem
  
  // Without offsets, ring n is at distance n*spacing - phase
  // With offsets, ring n is displaced by n*offset and rotated by n*rotationOffset
  
  // Estimate the ring index range
  float pLength = length(p);
  float baseRingEstimate = (pLength + phase) / spacing;
  
  // For small offsets, rings stay mostly in order
  if (length(offset) < 0.1 && abs(rotationOffset) < 0.1) {
    // Fast path: check only nearby rings
    int centerRing = int(baseRingEstimate + 0.5);
    int checkRadius = 5;
    
    for (int i = -checkRadius; i <= checkRadius; i++) {
      int n = centerRing + i;
      if (n < 0) continue;
      
      float ringN = float(n);
      vec2 q = p - ringN * offset;
      q = rotate2D(q, ringN * rotationOffset);
      
      float shapeDist;
      if (isCircle) {
        shapeDist = shapeCircle(q);
      } else if (isSquare) {
        shapeDist = shapeSquare(q);
      } else if (isTriangle) {
        shapeDist = shapeTriangle(q);
      } else {
        shapeDist = shapePolygon(q, sides);
      }
      
      float targetSize = ringN * spacing - phase;
      if (targetSize >= 0.0) {
        float dist = abs(shapeDist - targetSize);
        minDist = min(minDist, dist);
        
        // Early exit if we found a perfect match
        if (dist < 0.01 * spacing) {
          return dist;
        }
      }
    }
  } else {
    // For larger offsets, use a smarter search strategy
    // Key observation: rings that end up at position p originally started at position p + n*offset
    // After rotation by n*θ, the relationship is more complex but we can bound it
    
    // Binary search for the ring range
    float minN = 0.0;
    float maxN = pLength / spacing + 50.0;
    
    // Refine the range using binary search
    for (int iter = 0; iter < 10; iter++) {
      float midN = (minN + maxN) * 0.5;
      vec2 q = p - midN * offset;
      q = rotate2D(q, midN * rotationOffset);
      float qDist = length(q);
      float expectedDist = midN * spacing - phase;
      
      if (qDist < expectedDist) {
        maxN = midN;
      } else {
        minN = midN;
      }
    }
    
    // Check rings in the refined range
    int startRing = max(0, int(minN - 5.0));
    int endRing = int(maxN + 5.0);
    
    // Adaptive step size based on how fast rings are changing
    int stepSize = 1;
    if (abs(rotationOffset) > 0.5 || length(offset) > 1.0) {
      // For very large offsets, we might need to check more densely
      stepSize = 1;
    } else if (abs(rotationOffset) > 0.1 || length(offset) > 0.5) {
      // For moderate offsets, we can skip some rings
      stepSize = max(1, (endRing - startRing) / 50);
    }
    
    // First pass: coarse search
    float coarseMin = 1e6;
    int bestRing = startRing;
    
    for (int n = startRing; n <= endRing; n += stepSize) {
      float ringN = float(n);
      vec2 q = p - ringN * offset;
      q = rotate2D(q, ringN * rotationOffset);
      
      float shapeDist;
      if (isCircle) {
        shapeDist = shapeCircle(q);
      } else if (isSquare) {
        shapeDist = shapeSquare(q);
      } else if (isTriangle) {
        shapeDist = shapeTriangle(q);
      } else {
        shapeDist = shapePolygon(q, sides);
      }
      
      float targetSize = ringN * spacing - phase;
      if (targetSize >= 0.0) {
        float dist = abs(shapeDist - targetSize);
        if (dist < coarseMin) {
          coarseMin = dist;
          bestRing = n;
        }
      }
    }
    
    // Second pass: fine search around the best ring
    int fineStart = max(startRing, bestRing - stepSize);
    int fineEnd = min(endRing, bestRing + stepSize);
    
    for (int n = fineStart; n <= fineEnd; n++) {
      float ringN = float(n);
      vec2 q = p - ringN * offset;
      q = rotate2D(q, ringN * rotationOffset);
      
      float shapeDist;
      if (isCircle) {
        shapeDist = shapeCircle(q);
      } else if (isSquare) {
        shapeDist = shapeSquare(q);
      } else if (isTriangle) {
        shapeDist = shapeTriangle(q);
      } else {
        shapeDist = shapePolygon(q, sides);
      }
      
      float targetSize = ringN * spacing - phase;
      if (targetSize >= 0.0) {
        float dist = abs(shapeDist - targetSize);
        minDist = min(minDist, dist);
      }
    }
  }
  
  return minDist;
}

void main() {
  vec2 uv = (vTexCoord - 0.5) * u_resolution / u_zoom + u_pan;
  vec2 pos = uv - u_position;
  
  float cosR = cos(u_rotation);
  float sinR = sin(u_rotation);
  vec2 rotatedPos = vec2(cosR * pos.x - sinR * pos.y, sinR * pos.x + cosR * pos.y);
  
  float spacing = 1.0 / u_density;
  vec2 offsetVec = vec2(u_offsetX, u_offsetY);
  
  float dist = 1e6;
  
  if (abs(u_offsetX) < EPSILON && abs(u_offsetY) < EPSILON && abs(u_rotationOffset) < EPSILON) {
    // Simple case: no offsets
    float shapeDist;
    if (u_shapeType < 1.5) {
      shapeDist = shapeCircle(rotatedPos);
    } else if (u_shapeType < 2.5) {
      shapeDist = shapeSquare(rotatedPos);
    } else if (u_shapeType < 3.5) {
      shapeDist = shapePolygon(rotatedPos, 3.0);
    } else {
      shapeDist = shapePolygon(rotatedPos, u_sides);
    }
    
    float ringIndex = (shapeDist + u_phase) / spacing;
    float nearestRing = round(ringIndex);
    float targetRadius = nearestRing * spacing - u_phase;
    
    dist = abs(shapeDist - targetRadius);
  } else {
    // WITH OFFSETS: Use adaptive algorithm based on offset magnitude
    
    float pixelRadius = length(rotatedPos);
    float baseRingEstimate = (pixelRadius + u_phase) / spacing;
    
    // Determine algorithm based on offset magnitudes
    bool smallOffsets = length(offsetVec) < 0.05 && abs(u_rotationOffset) < 0.05;
    bool mediumOffsets = length(offsetVec) < 0.5 && abs(u_rotationOffset) < 0.3;
    
    if (smallOffsets) {
      // FAST PATH: Small offsets - check only ~20 rings
      int centerRing = int(baseRingEstimate + 0.5);
      for (int i = -10; i <= 10; i++) {
        int n = centerRing + i;
        if (n < 0) continue;
        
        float ringN = float(n);
        vec2 q = rotatedPos - ringN * offsetVec;
        q = rotate2D(q, -ringN * u_rotationOffset);
        
        float shapeDist;
        if (u_shapeType < 1.5) {
          shapeDist = shapeCircle(q);
        } else if (u_shapeType < 2.5) {
          shapeDist = shapeSquare(q);
        } else if (u_shapeType < 3.5) {
          shapeDist = shapePolygon(q, 3.0);
        } else {
          shapeDist = shapePolygon(q, u_sides);
        }
        
        float targetSize = ringN * spacing - u_phase;
        if (targetSize >= 0.0) {
          dist = min(dist, abs(shapeDist - targetSize));
        }
      }
    } else if (mediumOffsets) {
      // MEDIUM PATH: Moderate offsets - adaptive search with early exit
      float searchRadius = 20.0 + length(offsetVec) * 30.0 / spacing + abs(u_rotationOffset) * 30.0;
      int startRing = max(0, int(baseRingEstimate - searchRadius));
      int endRing = int(baseRingEstimate + searchRadius);
      
      float bestDist = 1e6;
      int ringsWithoutImprovement = 0;
      
      for (int n = startRing; n <= endRing; n++) {
        float ringN = float(n);
        vec2 q = rotatedPos - ringN * offsetVec;
        q = rotate2D(q, -ringN * u_rotationOffset);
        
        float shapeDist;
        if (u_shapeType < 1.5) {
          shapeDist = shapeCircle(q);
        } else if (u_shapeType < 2.5) {
          shapeDist = shapeSquare(q);
        } else if (u_shapeType < 3.5) {
          shapeDist = shapePolygon(q, 3.0);
        } else {
          shapeDist = shapePolygon(q, u_sides);
        }
        
        float targetSize = ringN * spacing - u_phase;
        if (targetSize >= 0.0) {
          float ringDist = abs(shapeDist - targetSize);
          
          if (ringDist < bestDist) {
            bestDist = ringDist;
            ringsWithoutImprovement = 0;
          } else {
            ringsWithoutImprovement++;
          }
          
          dist = min(dist, ringDist);
          
          // Early exit if we found a very good match and haven't improved in a while
          if (bestDist < 0.1 * spacing && ringsWithoutImprovement > 5) {
            break;
          }
        }
      }
    } else {
      // LARGE OFFSETS: Comprehensive search with sampling
      
      // First pass: Coarse sampling to find candidate rings
      float searchRadius = 50.0 + length(offsetVec) * 100.0 / spacing + abs(u_rotationOffset) * 100.0;
      int startRing = max(0, int(baseRingEstimate - searchRadius));
      int endRing = int(baseRingEstimate + searchRadius);
      
      // Sample every Nth ring for speed
      int sampleStep = max(1, (endRing - startRing) / 100);
      float bestSampledDist = 1e6;
      int bestSampledRing = startRing;
      
      // Coarse search
      for (int n = startRing; n <= endRing; n += sampleStep) {
        float ringN = float(n);
        vec2 q = rotatedPos - ringN * offsetVec;
        q = rotate2D(q, -ringN * u_rotationOffset);
        
        float shapeDist;
        if (u_shapeType < 1.5) {
          shapeDist = shapeCircle(q);
        } else if (u_shapeType < 2.5) {
          shapeDist = shapeSquare(q);
        } else if (u_shapeType < 3.5) {
          shapeDist = shapePolygon(q, 3.0);
        } else {
          shapeDist = shapePolygon(q, u_sides);
        }
        
        float targetSize = ringN * spacing - u_phase;
        if (targetSize >= 0.0) {
          float ringDist = abs(shapeDist - targetSize);
          if (ringDist < bestSampledDist) {
            bestSampledDist = ringDist;
            bestSampledRing = n;
          }
          dist = min(dist, ringDist);
        }
      }
      
      // Second pass: Refine around best sampled ring
      int refineStart = max(startRing, bestSampledRing - sampleStep);
      int refineEnd = min(endRing, bestSampledRing + sampleStep);
      
      for (int n = refineStart; n <= refineEnd; n++) {
        float ringN = float(n);
        vec2 q = rotatedPos - ringN * offsetVec;
        q = rotate2D(q, -ringN * u_rotationOffset);
        
        float shapeDist;
        if (u_shapeType < 1.5) {
          shapeDist = shapeCircle(q);
        } else if (u_shapeType < 2.5) {
          shapeDist = shapeSquare(q);
        } else if (u_shapeType < 3.5) {
          shapeDist = shapePolygon(q, 3.0);
        } else {
          shapeDist = shapePolygon(q, u_sides);
        }
        
        float targetSize = ringN * spacing - u_phase;
        if (targetSize >= 0.0) {
          dist = min(dist, abs(shapeDist - targetSize));
        }
      }
      
      // For very large rotations, check some distant rings
      if (abs(u_rotationOffset) > 0.5) {
        int extraChecks = min(20, int(abs(u_rotationOffset) / PI * 10.0));
        for (int i = 1; i <= extraChecks; i++) {
          int n = endRing + i * 20;
          float ringN = float(n);
          
          vec2 q = rotatedPos - ringN * offsetVec;
          q = rotate2D(q, -ringN * u_rotationOffset);
          
          float shapeDist;
          if (u_shapeType < 1.5) {
            shapeDist = shapeCircle(q);
          } else if (u_shapeType < 2.5) {
            shapeDist = shapeSquare(q);
          } else if (u_shapeType < 3.5) {
            shapeDist = shapePolygon(q, 3.0);
          } else {
            shapeDist = shapePolygon(q, u_sides);
          }
          
          float targetSize = ringN * spacing - u_phase;
          if (targetSize >= 0.0) {
            dist = min(dist, abs(shapeDist - targetSize));
          }
        }
      }
    }
  }
  
  float halfThickness = u_thickness * 0.5;
  vec2 uvDelta = fwidth(vTexCoord);
  float pixelSize = length(uvDelta) * u_resolution.x / u_zoom;
  float alpha = 1.0 - smoothstep(halfThickness - pixelSize, halfThickness + pixelSize, dist);
  
  fragColor = u_color;
  fragColor.a = alpha * u_opacity;
} 