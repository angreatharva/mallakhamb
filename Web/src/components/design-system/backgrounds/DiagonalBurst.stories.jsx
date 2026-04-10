import React from 'react';
import DiagonalBurst from './DiagonalBurst';

export default {
  title: 'Design System/Backgrounds/DiagonalBurst',
  component: DiagonalBurst,
  argTypes: {
    color: { control: { type: 'color' } },
    opacity: { control: { type: 'number', min: 0, max: 1, step: 0.01 } },
    direction: {
      control: { type: 'select' },
      options: [
        'top-left-to-bottom-right',
        'top-right-to-bottom-left',
        'bottom-left-to-top-right',
        'bottom-right-to-top-left',
      ],
    },
    className: { control: false },
  },
};

export const Default = {
  args: {
    opacity: 0.1,
    direction: 'top-left-to-bottom-right',
  },
  render: (args) => (
    <div className="relative h-72 overflow-hidden rounded-xl border border-white/10 bg-black">
      <DiagonalBurst {...args} />
      <div className="relative z-10 p-6">
        <div className="text-lg font-semibold">Diagonal burst</div>
        <div className="mt-2 text-white/70">A directional gradient accent.</div>
      </div>
    </div>
  ),
};
