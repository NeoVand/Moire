# Moiré Pattern Generator

A React-based tool for creating moiré interference patterns through layered geometric shapes.

![Demo](./public/moirescreenvideo.gif)

## Getting Started

```bash
git clone <repository-url>
cd Moire
npm install
npm run dev
```

Open `http://localhost:5173` to start creating patterns.

## What's Implemented

### Pattern Categories
- **Lines** (5 patterns): Straight lines, radial lines, sawtooth/square/triangle waves
- **Curves** (8 patterns): Sine waves, spirals, cycloids, epitrochoids, Lissajous curves, hyperbolas, catenaries, and parametric curves with custom JavaScript functions
- **Tiles** (5 patterns): Triangular, square, rhombus, hexagonal tilings, and circle packing
- **Concentric** (9 patterns): Circles, squares, triangles, pentagons, hexagons, ellipses, rhombus, and 5-point stars

### Core Features
- **Layer System**: Add, reorder, and manage multiple pattern layers
- **Canvas Interaction**: Pan (click-drag), zoom (scroll), direct layer manipulation (Option+drag)
- **Parameter Controls**: Adjustable spacing, thickness, colors, rotations, and offsets
- **Parametric Curves**: Write custom X(t,n) and Y(t,n) functions in JavaScript
- **Progressive Offsets**: Create complex interference effects by offsetting each curve/shape

### UI
- Left sidebar: Layer management and transforms
- Right sidebar: Pattern selection and parameters  
- Canvas: Real-time preview with interactive controls
- Parametric editor: Code input for custom curve equations

## Basic Usage

1. **Add Layers**: Click the `+` button to add pattern layers
2. **Select Patterns**: Choose category and pattern type in right sidebar
3. **Adjust Parameters**: Use sliders to modify spacing, thickness, colors, etc.
4. **Position Layers**: Use transform controls or Option+drag on canvas
5. **Create Interference**: Overlap layers with slight parameter differences

For parametric curves, edit the JavaScript functions directly:
```javascript
// X function example
return amplitude * Math.cos(t + n * 0.1) + n * 10;

// Y function example  
return amplitude * Math.sin(t * 2) + n * spacing;
```

## Technical Details

- **Stack**: React, TypeScript, Vite, Tailwind CSS
- **Rendering**: HTML5 Canvas with real-time updates
- **Performance**: Optimized for smooth interaction up to ~200 curves/shapes per layer

## Current Limitations

- No export functionality (PNG/SVG)
- No animation system
- Limited to Canvas 2D rendering
- No undo/redo system
- No pattern presets or saving

## Next Steps

**High Priority:**
- Add PNG/SVG export functionality
- Implement pattern saving/loading
- Add undo/redo system

**Medium Priority:**
- Animation system with keyframes
- Pattern preset library
- WebGL upgrade for better performance
- More curve families and tessellation patterns

**Low Priority:**
- Collaborative features
- Educational tutorials
- Advanced mathematical function support

## Contributing

The codebase is well-structured and TypeScript-typed. Key areas for contribution:
- Export system implementation
- New pattern types
- Performance optimizations
- UI/UX improvements

## License

MIT
