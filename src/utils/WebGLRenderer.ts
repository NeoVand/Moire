export interface ShaderProgram {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
  attributes: Record<string, number>;
}

export interface RenderLayer {
  type: string;
  shader: ShaderProgram;
  uniforms: Record<string, any>;
}

// Global shader cache shared between renderer instances
// const globalShaderCache = new Map<string, WeakRef<ShaderProgram>>();

export class WebGLRenderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private quadBuffer: WebGLBuffer | null = null;
  private shaderCache: Map<string, ShaderProgram> = new Map();
  private animationFrameId: number | null = null;
  private pixelRatio: number = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    
    // Check if canvas already has a context (React StrictMode double-invoke)
    const existingContext = (canvas as any).__webglContext;
    if (existingContext && !existingContext.isContextLost()) {
      this.gl = existingContext;
      this.pixelRatio = window.devicePixelRatio || 1;
      // Still need to initialize our instance-specific resources
      this.initializeQuadBuffer();
      this.setupBlending();
      return;
    }
    
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      antialias: false,
      depth: false,
      stencil: false,
      desynchronized: true,
      powerPreference: 'high-performance'
    });

    if (!gl) {
      // Try WebGL 1.0 as fallback
      console.warn('WebGL 2.0 not available, trying WebGL 1.0...');
      const gl1 = canvas.getContext('webgl', {
        alpha: true,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance'
      });
      
      if (!gl1) {
        throw new Error('Neither WebGL 2.0 nor WebGL 1.0 is supported');
      }
      throw new Error('WebGL 2.0 required for ES 3.0 shaders');
    }

    this.gl = gl;
    
    // Store context on canvas for reuse
    (canvas as any).__webglContext = gl;
    
    this.pixelRatio = window.devicePixelRatio || 1;
    this.initializeQuadBuffer();
    this.setupBlending();
  }

  private initializeQuadBuffer() {
    const gl = this.gl;
    const quadVertices = new Float32Array([
      -1, -1, 0, 0,  // Bottom left
       1, -1, 1, 0,  // Bottom right
      -1,  1, 0, 1,  // Top left
       1,  1, 1, 1   // Top right
    ]);

    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
  }

  private setupBlending() {
    const gl = this.gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  private compileShader(source: string, type: number): WebGLShader {
    const gl = this.gl;
    
    // Check if context is lost
    if (gl.isContextLost()) {
      throw new Error('WebGL context lost');
    }
    
    // Clear any previous errors
    gl.getError();
    
    const shader = gl.createShader(type);
    if (!shader) {
      const error = gl.getError();
      throw new Error(`Failed to create shader. GL Error: ${error}`);
    }

    const shaderType = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      
      // Sometimes getShaderInfoLog returns null or empty string
      let errorMessage = info || 'Unknown shader compilation error';
      
      // Try to get more info from WebGL error
      const glError = gl.getError();
      if (glError !== gl.NO_ERROR) {
        errorMessage += ` (GL Error: ${glError})`;
      }
      
      console.error(`${shaderType} shader compilation failed:`, errorMessage);
      
      // Don't log full shader source in production
      if (import.meta.env.DEV) {
        console.error('Shader source preview:', source.substring(0, 200) + '...');
      }
      
      throw new Error(`${shaderType} shader compilation error: ${errorMessage}`);
    }

    return shader;
  }

  public createShaderProgram(vertexSource: string, fragmentSource: string): ShaderProgram {
    const cacheKey = `${vertexSource.substring(0, 50)}::${fragmentSource.substring(0, 50)}`;
    const cached = this.shaderCache.get(cacheKey);
    if (cached) return cached;

    const gl = this.gl;
    const vertexShader = this.compileShader(vertexSource, gl.VERTEX_SHADER);
    const fragmentShader = this.compileShader(fragmentSource, gl.FRAGMENT_SHADER);

    const program = gl.createProgram();
    if (!program) throw new Error('Failed to create shader program');

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Shader linking error: ${info}`);
    }

    // Clean up shaders after linking
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    // Get attribute locations
    const attributes: Record<string, number> = {
      aPosition: gl.getAttribLocation(program, 'aPosition'),
      aTexCoord: gl.getAttribLocation(program, 'aTexCoord')
    };

    // Get common uniform locations
    const uniformNames = [
      'u_density', 'u_angle', 'u_thickness', 'u_color', 'u_resolution',
      'u_pan', 'u_zoom', 'u_phase', 'u_opacity', 'u_position', 'u_rotation',
      'u_offsetX', 'u_offsetY', 'u_rotationOffset', 'u_shapeType', 'u_sides'
    ];

    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    uniformNames.forEach(name => {
      uniforms[name] = gl.getUniformLocation(program, name);
    });

    const shaderProgram = { program, uniforms, attributes };
    this.shaderCache.set(cacheKey, shaderProgram);
    return shaderProgram;
  }

  public resize(width: number, height: number) {
    const scaledWidth = Math.floor(width * this.pixelRatio);
    const scaledHeight = Math.floor(height * this.pixelRatio);
    
    this.canvas.width = scaledWidth;
    this.canvas.height = scaledHeight;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    
    this.gl.viewport(0, 0, scaledWidth, scaledHeight);
  }

  private setUniforms(shader: ShaderProgram, uniforms: Record<string, any>) {
    const gl = this.gl;
    
    for (const [name, value] of Object.entries(uniforms)) {
      const location = shader.uniforms[name];
      if (!location) continue;

      if (typeof value === 'number') {
        gl.uniform1f(location, value);
      } else if (Array.isArray(value)) {
        switch (value.length) {
          case 2:
            gl.uniform2fv(location, value);
            break;
          case 3:
            gl.uniform3fv(location, value);
            break;
          case 4:
            gl.uniform4fv(location, value);
            break;
        }
      }
    }
  }

  private drawQuad() {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    
    // Enable and set up position attribute (location 0)
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    
    // Enable and set up texCoord attribute (location 1)
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  public clear(color: string) {
    const gl = this.gl;
    const rgb = this.hexToRgb(color);
    gl.clearColor(rgb[0], rgb[1], rgb[2], 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  private hexToRgb(hex: string): [number, number, number] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
      parseInt(result[1], 16) / 255,
      parseInt(result[2], 16) / 255,
      parseInt(result[3], 16) / 255
    ] : [1, 1, 1];
  }

  public renderLayer(layer: RenderLayer) {
    const gl = this.gl;
    gl.useProgram(layer.shader.program);
    this.setUniforms(layer.shader, layer.uniforms);
    this.drawQuad();
  }

  public startRenderLoop(renderCallback: () => void) {
    const render = () => {
      renderCallback();
      this.animationFrameId = requestAnimationFrame(render);
    };
    render();
  }

  public stopRenderLoop() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public destroy() {
    this.stopRenderLoop();
    const gl = this.gl;
    
    if (this.quadBuffer) {
      gl.deleteBuffer(this.quadBuffer);
      this.quadBuffer = null;
    }
    
    this.shaderCache.forEach(shader => {
      gl.deleteProgram(shader.program);
    });
    
    this.shaderCache.clear();
    
    // Don't lose context in development (React StrictMode)
    // This allows reusing the context
    const isDevelopment = import.meta.env.DEV;
    if (!isDevelopment) {
      const loseContext = gl.getExtension('WEBGL_lose_context');
      if (loseContext) {
        loseContext.loseContext();
      }
      // Remove stored context reference
      if (this.canvas) {
        delete (this.canvas as any).__webglContext;
      }
    }
  }
} 