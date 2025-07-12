#version 300 es
precision highp float;

in vec3 aPosition;
in vec2 aTexCoord;
out vec2 vTexCoord;

void main() {
  vTexCoord = aTexCoord;
  gl_Position = vec4(aPosition, 1.0);
} 