import React from 'react';
import HexMesh from './HexMesh';

export default {
  title: 'Design System/Backgrounds/HexMesh',
  component: HexMesh,
  argTypes: {
    color: { control: { type: 'color' } },
    opacity: { control: { type: 'number', min: 0, max: 1, step: 0.01 } },
    className: { control: false },
  },
};

export const Default = {
  args: {
    opacity: 0.06,
  },
  render: (args) => (
    <div className="relative h-64 overflow-hidden rounded-xl border border-white/10 bg-black">
      <HexMesh {...args} />
      <div className="relative z-10 p-6">
        <div className="text-lg font-semibold">Content on top</div>
        <div className="mt-2 text-white/70">Mesh pattern for subtle depth.</div>
      </div>
    </div>
  ),
};
