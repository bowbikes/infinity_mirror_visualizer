# Quick Start Guide

Get your infinity mirror visualizer running in 3 steps:

## 1. Install Dependencies

```bash
npm install
```

This will install:
- React & React DOM
- React Three Fiber & Drei
- Three.js
- Postprocessing (for bloom effect)
- Vite (build tool)

## 2. Start Development Server

```bash
npm run dev
```

The app will open at `http://localhost:3000`

## 3. Customize Your Mirror

Use the control panel on the right to:
- **Choose an icon**: Hexagon, Circle, Star, or upload your own SVG
- **Adjust colors**: Wall, frame, and light colors
- **Control spacing**: Mirror depth (10-60mm)
- **Transform icon**: Scale, rotate, and position
- **Set reflection depth**: 1-10 layers for the infinity effect
- **Toggle auto-orbit**: Automatic camera rotation

## Performance Tips

For best mobile performance:
1. Keep reflection layers at 5-7 (not 10)
2. Toggle off bloom effect if needed (bottom-right checkbox)
3. Use simpler SVG shapes

## File Structure

```
src/
├── components/
│   ├── SvgIcon.jsx              - Converts SVG to 3D mesh
│   ├── ReflectionLayers.jsx     - Creates infinity effect
│   ├── InfinityMirrorBox.jsx    - Mirror geometry
│   ├── InfinityMirrorScene.jsx  - 3D scene setup
│   └── ControlsPanel.jsx        - UI controls
├── App.jsx                      - Main component
└── main.jsx                     - Entry point

public/svgs/                     - SVG presets
```

## Adding Custom SVG Presets

1. Place SVG file in `public/svgs/youricon.svg`
2. Edit `src/App.jsx` line 19-23:
   ```jsx
   const PRESETS = {
     hexagon: '/svgs/hexagon.svg',
     circle: '/svgs/circle.svg',
     star: '/svgs/star.svg',
     youricon: '/svgs/youricon.svg'  // Add here
   }
   ```
3. Edit `src/components/ControlsPanel.jsx` line 80-84 to add dropdown option

## Building for Production

```bash
npm run build
```

Output goes to `dist/` folder, ready to deploy or embed in Framer.

## Troubleshooting

**Black screen?**
- Check browser console for errors
- Make sure all dependencies installed correctly

**Poor performance?**
- Reduce reflection layers
- Disable bloom effect
- Close other browser tabs

**SVG not showing?**
- Verify SVG is valid XML
- Check SVG has fill color or paths
- Try one of the presets first

## Next Steps

- Read [README.md](README.md) for full documentation
- Customize colors and dimensions to match your product
- Export configurations for your customers
- Embed in your Framer site

Enjoy! 🪞✨
