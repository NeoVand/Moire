# Moiré Pattern Generator

A high-performance WebGL-based tool for creating moiré interference patterns through layered geometric shapes.

![Demo](./public/moirescreenvideo.gif)

## Getting Started

```bash
git clone <repository-url>
cd Moire
npm install
npm run dev
```

Open `http://localhost:5173` to start creating patterns.

### Building for Production

```bash
npm run build
```

This creates an optimized build in the `dist` folder.

## What's Implemented

### Pattern Categories
- **Lines** (1 pattern): Straight lines with adjustable angle and density
- **Concentric** (4 patterns): Circles, squares, triangles, and custom polygons (3-10 sides)

### Core Features
- **WebGL Rendering**: Hardware-accelerated graphics for smooth performance
- **Layer System**: Add and manage multiple pattern layers
- **Canvas Interaction**: Pan (click-drag), zoom (scroll), direct layer manipulation (Option+drag)
- **Parameter Controls**: 
  - Spacing/density control
  - Line thickness adjustment
  - Color selection with opacity
  - X/Y offset for progressive patterns
  - Rotation offset for spiral effects
  - Phase control for ring positioning
- **High DPI Support**: Crisp rendering on retina displays
- **Optimized Shaders**: Fast path for simple patterns, adaptive ring checking for complex ones

### UI
- Left sidebar: Layer management and transforms
- Right sidebar: Pattern selection and parameters  
- Canvas: Real-time WebGL preview with interactive controls
- Help modal: Keyboard shortcuts and interaction guide

## Basic Usage

1. **Add Layers**: Click the `+` button to add pattern layers
2. **Select Patterns**: Choose category (Lines/Concentric) and pattern type
3. **Adjust Parameters**: 
   - **Ring Spacing**: Controls density of concentric patterns
   - **Line Width**: Adjusts thickness of pattern lines
   - **X/Y Offset**: Creates progressive offset effects
   - **Rotation Offset**: Adds rotation between successive rings
4. **Position Layers**: Use transform controls or Option+drag on canvas
5. **Create Interference**: Overlap layers with different parameters for moiré effects

## Technical Details

- **Stack**: React, TypeScript, Vite, Tailwind CSS
- **Rendering**: WebGL 2.0 with custom GLSL shaders
- **Performance**: 
  - Optimized shaders with early exit strategies
  - Adaptive ring checking (3-4 rings for simple patterns, up to 60 for complex)
  - 60+ FPS for most patterns on modern hardware
- **Architecture**:
  - Custom WebGL renderer class for efficient resource management
  - Shader caching system to prevent recompilation
  - Single quad geometry for full-screen effects

## Performance Notes

The WebGL implementation provides significant performance improvements over Canvas 2D:
- **3x faster** for simple concentric patterns without offsets
- **2x faster** for complex patterns with offsets and rotations
- **Smooth 60 FPS** even with multiple layers active
- **Efficient memory usage** through shader caching and resource pooling

## Current Limitations

- No export functionality (PNG/SVG)
- No animation system
- Limited pattern types (only lines and concentric shapes currently)
- No undo/redo system
- No pattern presets or saving
- No curve-based patterns yet (sine waves, spirals, etc.)

## Next Steps

**High Priority:**
- Add PNG/SVG export functionality
- Implement more pattern types (curves, tiles)
- Add pattern saving/loading

**Medium Priority:**
- Animation system with keyframes
- Pattern preset library
- More shape types (stars, polygons with more sides)
- Gradient fills and advanced blending modes

**Low Priority:**
- Collaborative features
- Educational tutorials
- WebGPU support for even better performance

## Contributing

The codebase is well-structured and TypeScript-typed. Key areas for contribution:
- Export system implementation
- New pattern types
- Performance optimizations
- UI/UX improvements

## License

MIT
