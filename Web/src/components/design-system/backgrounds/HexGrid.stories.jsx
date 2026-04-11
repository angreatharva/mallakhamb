import React from 'react';
import HexGrid from './HexGrid';

export default {
  title: 'Design System/Backgrounds/HexGrid',
  component: HexGrid,
  argTypes: {
    color: { control: { type: 'color' } },
    opacity: { control: { type: 'number', min: 0, max: 1, step: 0.01 } },
    className: { control: false },
  },
};

export const Default = {
  args: {
    opacity: 0.05,
  },
  render: (args) => (
    <div className="relative h-64 overflow-hidden rounded-xl border border-white/10 bg-black">
      <HexGrid {...args} />
      <div className="relative z-10 p-6">
        <div className="text-lg font-semibold">Content on top</div>
        <div className="mt-2 text-white/70">
          Background components should never block interaction.
        </div>
      </div>
    </div>
  ),
};
