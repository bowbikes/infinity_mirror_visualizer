# Infinity Mirror Visualizer

An interactive 3D infinity mirror configurator built with React Three Fiber. This visualizer allows you to customize and preview a wall-mounted infinity mirror with real-time controls for colors, spacing, reflection depth, and custom SVG icons.

![Infinity Mirror Visualizer](preview.png)

## Features

- **Real-time 3D preview** with React Three Fiber
- **Customizable SVG icons** - Choose from presets or upload your own
- **Full color control** - Wall, frame, and light colors
- **Adjustable mirror spacing** - 10-60mm range
- **Reflection depth control** - 1-10 layers for the infinity effect
- **Interactive camera** - OrbitControls with optional auto-orbit
- **Performance optimized** - Runs smoothly on mid-range mobile devices
- **Bloom effect** - Optional neon glow (can be disabled for better performance)

## Tech Stack

- **React 18**
- **React Three Fiber** (`@react-three/fiber`)
- **React Three Drei** (`@react-three/drei`)
- **React Three Postprocessing** (`@react-three/postprocessing`)
- **Three.js**
- **Vite** (build tool)

## Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
infinity_mirror_visualizer/
├── public/
│   └── svgs/              # SVG preset icons
│       ├── hexagon.svg
│       ├── circle.svg
│       └── star.svg
├── src/
│   ├── components/
│   │   ├── SvgIcon.jsx              # SVG to 3D mesh converter
│   │   ├── ReflectionLayers.jsx     # Infinity effect layer system
│   │   ├── InfinityMirrorBox.jsx    # Main mirror box geometry
│   │   ├── InfinityMirrorScene.jsx  # 3D scene with lighting & camera
│   │   └── ControlsPanel.jsx        # UI controls
│   ├── App.jsx            # Main app component
│   ├── main.jsx           # React entry point
│   └── index.css          # Global styles
├── index.html
├── package.json
└── vite.config.js
```

## Component Overview

### `<App />`
Main component that manages state and renders the Canvas and ControlsPanel.

### `<InfinityMirrorScene />`
The 3D scene containing:
- Camera setup and OrbitControls
- Lighting (ambient, directional, point lights)
- Environment map for reflections
- Wall background
- The infinity mirror box

### `<InfinityMirrorBox />`
The mirror box geometry including:
- Outer frame
- Inner cavity
- Inner mirror (fully reflective)
- Front 2-way mirror (semi-transparent)
- Glass/acrylic front cover

### `<ReflectionLayers />`
Creates stacked layers to simulate the infinity effect:
- Each layer is positioned progressively deeper
- Dimmer and less saturated as depth increases
- Efficient reuse of geometry and materials

### `<SvgIcon />`
Converts SVG paths to 3D meshes with emissive materials:
- Parses SVG data using Three.js SVGLoader
- Creates glowing shapes
- Handles custom uploads and presets

### `<ControlsPanel />`
UI for all customization options:
- Icon selection (presets + upload)
- Color pickers
- Sliders for spacing, scale, rotation, position
- Reflection depth control
- Auto-orbit toggle

## Scale System

The visualizer uses a consistent scale:
- **1 unit = 10mm** in real-world dimensions
- Default mirror: 300mm × 300mm = 30 × 30 units
- Default spacing: 20mm = 2 units

## Performance Tuning

### For Better Mobile Performance:

1. **Reduce reflection layers** (slider in UI)
   - Default: 7 layers
   - For older phones: Try 4-5 layers

2. **Disable bloom effect** (checkbox in bottom-right)
   - Bloom adds neon glow but costs performance
   - Toggle off for smoother frame rates

3. **Adjust in code** ([App.jsx:98-107](src/App.jsx#L98-L107)):
   ```jsx
   dpr={[1, 1.5]} // Lower max pixel ratio
   ```

4. **Bloom settings** ([App.jsx:121-127](src/App.jsx#L121-L127)):
   ```jsx
   <Bloom
     intensity={1.0}      // Lower intensity
     luminanceThreshold={0.5} // Higher threshold
   />
   ```

## Customization Guide

### Adding New SVG Presets

1. Add your SVG file to `public/svgs/`
2. Update the PRESETS object in [App.jsx:19-23](src/App.jsx#L19-L23):
   ```jsx
   const PRESETS = {
     hexagon: '/svgs/hexagon.svg',
     circle: '/svgs/circle.svg',
     star: '/svgs/star.svg',
     yourIcon: '/svgs/your-icon.svg' // Add here
   }
   ```
3. Add option to dropdown in [ControlsPanel.jsx:80-84](src/components/ControlsPanel.jsx#L80-L84)

### Adjusting Camera Position

Edit [InfinityMirrorScene.jsx:36-43](src/components/InfinityMirrorScene.jsx#L36-L43):
```jsx
<OrbitControls
  target={[0, 0, 0]}
  minPolarAngle={Math.PI / 4}   // Adjust viewing angle limits
  maxPolarAngle={Math.PI / 1.5}
  minAzimuthAngle={-Math.PI / 4}
  maxAzimuthAngle={Math.PI / 4}
/>
```

### Changing Mirror Dimensions

Edit [InfinityMirrorBox.jsx:29-30](src/components/InfinityMirrorBox.jsx#L29-L30):
```jsx
const width = 30  // 300mm (1 unit = 10mm)
const height = 30 // 300mm
```

### Adjusting Reflection Effect

The infinity effect is controlled in [ReflectionLayers.jsx:25-47](src/components/ReflectionLayers.jsx#L25-L47):
- `layerSpacing`: Distance between reflection layers
- `dimFactor`: How quickly brightness fades (0.7 = 30% dimmer per layer)
- `saturationFactor`: How quickly color saturates (0.85 = 15% less saturated per layer)

## Embedding in Framer

This is a self-contained React component tree that can be embedded in Framer:

1. Build the project: `npm run build`
2. The `dist/` folder contains the compiled assets
3. Import the component into your Framer project
4. Or use an iframe pointing to the deployed visualizer

## Browser Support

- Modern browsers with WebGL 2 support
- Tested on:
  - Chrome/Edge 90+
  - Firefox 88+
  - Safari 14+
  - Mobile Safari (iOS 14+)
  - Chrome Mobile (Android)

## Troubleshooting

### SVG not loading
- Check that SVG files are in `public/svgs/` directory
- Verify the SVG is valid XML
- Check browser console for errors

### Performance issues
- Disable bloom effect
- Reduce reflection layers (1-5 instead of 7-10)
- Lower the `dpr` setting in Canvas
- Close other browser tabs/apps

### Custom SVG upload fails
- Ensure file is a valid SVG
- Try simplifying the SVG (remove gradients, filters, etc.)
- SVGs should use simple paths and shapes for best results

## License

MIT

## Credits

Built with ❤️ using React Three Fiber and Three.js
