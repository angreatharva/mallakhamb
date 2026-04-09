import React, { useState } from 'react';
import { HexGrid, RadialBurst, DiagonalBurst, HexMesh, Constellation } from './index';
import { DESIGN_TOKENS } from '../../../styles/tokens';

/**
 * BackgroundsDemo - Demonstration of all background decoration components
 * 
 * This component showcases all available background decorations with interactive controls.
 * Use this as a reference for implementing backgrounds in your pages.
 */
const BackgroundsDemo = () => {
  const [activeDemo, setActiveDemo] = useState('hexgrid');
  const [color, setColor] = useState(DESIGN_TOKENS.colors.brand.saffron);
  const [opacity, setOpacity] = useState(0.05);

  const demos = {
    hexgrid: {
      name: 'HexGrid',
      component: <HexGrid color={color} opacity={opacity} />,
      description: 'SVG-based hexagonal pattern for geometric backgrounds',
    },
    radialburst: {
      name: 'RadialBurst',
      component: <RadialBurst color={color} opacity={opacity} position="top-right" size="lg" />,
      description: 'Radial gradient burst effect with configurable position and size',
    },
    diagonalburst: {
      name: 'DiagonalBurst',
      component: <DiagonalBurst color={color} opacity={opacity} direction="top-left-to-bottom-right" />,
      description: 'Diagonal gradient effect for dynamic backgrounds',
    },
    hexmesh: {
      name: 'HexMesh',
      component: <HexMesh color={color} opacity={opacity} />,
      description: 'Mesh pattern with interconnected lines and dots',
    },
    constellation: {
      name: 'Constellation',
      component: <Constellation color={color} opacity={opacity * 6} starCount={50} />,
      description: 'Star field with connected dots creating constellation effect',
    },
  };

  const roleColors = [
    { name: 'Saffron', value: DESIGN_TOKENS.colors.brand.saffron },
    { name: 'Purple', value: DESIGN_TOKENS.colors.roles.admin },
    { name: 'Green', value: DESIGN_TOKENS.colors.roles.coach },
    { name: 'Gold', value: DESIGN_TOKENS.colors.roles.superadmin },
    { name: 'Blue', value: DESIGN_TOKENS.colors.roles.public },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">Background Decorations</h1>
        <p className="text-gray-400 mb-8">
          Reusable background decoration components for visual effects
        </p>

        {/* Controls */}
        <div className="bg-[#111111] rounded-lg p-6 mb-8 border border-white/10">
          <h2 className="text-xl font-semibold mb-4">Controls</h2>
          
          {/* Component Selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Component</label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(demos).map(([key, demo]) => (
                <button
                  key={key}
                  onClick={() => setActiveDemo(key)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    activeDemo === key
                      ? 'bg-[#FF6B00] text-white'
                      : 'bg-[#1A1A1A] text-gray-400 hover:bg-[#222222]'
                  }`}
                >
                  {demo.name}
                </button>
              ))}
            </div>
          </div>

          {/* Color Selector */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Color</label>
            <div className="flex flex-wrap gap-2">
              {roleColors.map((roleColor) => (
                <button
                  key={roleColor.name}
                  onClick={() => setColor(roleColor.value)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    color === roleColor.value
                      ? 'ring-2 ring-white'
                      : 'hover:ring-1 ring-gray-500'
                  }`}
                  style={{ backgroundColor: roleColor.value }}
                >
                  {roleColor.name}
                </button>
              ))}
            </div>
          </div>

          {/* Opacity Slider */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">
              Opacity: {opacity.toFixed(2)}
            </label>
            <input
              type="range"
              min="0"
              max="0.5"
              step="0.01"
              value={opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>

          {/* Description */}
          <div className="mt-6 p-4 bg-[#1A1A1A] rounded-lg">
            <p className="text-sm text-gray-300">{demos[activeDemo].description}</p>
          </div>
        </div>

        {/* Preview */}
        <div className="relative bg-[#111111] rounded-lg overflow-hidden border border-white/10" style={{ height: '500px' }}>
          {/* Background decoration */}
          {demos[activeDemo].component}

          {/* Content overlay to demonstrate readability */}
          <div className="relative z-10 p-8 h-full flex flex-col justify-center items-center">
            <h2 className="text-3xl font-bold mb-4">{demos[activeDemo].name}</h2>
            <p className="text-gray-300 text-center max-w-md mb-6">
              This content demonstrates that the background decoration does not interfere with readability.
              All decorations are positioned absolutely with pointer-events-none.
            </p>
            <div className="grid grid-cols-3 gap-4 w-full max-w-2xl">
              <div className="bg-white/5 backdrop-blur-sm p-4 rounded-lg border border-white/10">
                <div className="text-2xl font-bold mb-1">100+</div>
                <div className="text-sm text-gray-400">Users</div>
              </div>
              <div className="bg-white/5 backdrop-blur-sm p-4 rounded-lg border border-white/10">
                <div className="text-2xl font-bold mb-1">50+</div>
                <div className="text-sm text-gray-400">Teams</div>
              </div>
              <div className="bg-white/5 backdrop-blur-sm p-4 rounded-lg border border-white/10">
                <div className="text-2xl font-bold mb-1">25+</div>
                <div className="text-sm text-gray-400">Events</div>
              </div>
            </div>
          </div>
        </div>

        {/* Usage Example */}
        <div className="mt-8 bg-[#111111] rounded-lg p-6 border border-white/10">
          <h2 className="text-xl font-semibold mb-4">Usage Example</h2>
          <pre className="bg-[#0A0A0A] p-4 rounded-lg overflow-x-auto text-sm">
            <code className="text-green-400">
{`import { ${demos[activeDemo].name} } from '@/components/design-system/backgrounds';

<div className="relative">
  <${demos[activeDemo].name} 
    color="${color}" 
    opacity={${opacity}}
  />
  <div className="relative z-10">
    {/* Your content here */}
  </div>
</div>`}
            </code>
          </pre>
        </div>

        {/* Features */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#111111] rounded-lg p-6 border border-white/10">
            <h3 className="font-semibold mb-2">🎨 Customizable</h3>
            <p className="text-sm text-gray-400">
              Configure color and opacity to match your theme
            </p>
          </div>
          <div className="bg-[#111111] rounded-lg p-6 border border-white/10">
            <h3 className="font-semibold mb-2">♿ Accessible</h3>
            <p className="text-sm text-gray-400">
              Respects prefers-reduced-motion setting
            </p>
          </div>
          <div className="bg-[#111111] rounded-lg p-6 border border-white/10">
            <h3 className="font-semibold mb-2">🚀 Non-intrusive</h3>
            <p className="text-sm text-gray-400">
              Positioned absolutely with pointer-events-none
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BackgroundsDemo;
