import React from 'react';
import RadialBurst from './RadialBurst';

export default {
  title: 'Design System/Backgrounds/RadialBurst',
  component: RadialBurst,
  argTypes: {
    color: { control: { type: 'color' } },
    opacity: { control: { type: 'number', min: 0, max: 1, step: 0.01 } },
    position: {
      control: { type: 'select' },
      options: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'],
    },
    size: { control: { type: 'select' }, options: ['sm', 'md', 'lg'] },
    className: { control: false },
  },
};

export const Default = {
  args: {
    opacity: 0.2,
    position: 'top-right',
    size: 'md',
  },
  render: (args) => (
    <div className="relative h-72 overflow-hidden rounded-xl border border-white/10 bg-black">
      <RadialBurst {...args} />
      <div className="relative z-10 p-6">
        <div className="text-lg font-semibold">Radial burst</div>
        <div className="mt-2 text-white/70">Use for subtle accent lighting.</div>
      </div>
    </div>
  ),
};
