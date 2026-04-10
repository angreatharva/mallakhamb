import React from 'react';
import Constellation from './Constellation';

export default {
  title: 'Design System/Backgrounds/Constellation',
  component: Constellation,
  argTypes: {
    color: { control: { type: 'color' } },
    opacity: { control: { type: 'number', min: 0, max: 1, step: 0.05 } },
    starCount: { control: { type: 'number', min: 10, max: 120, step: 5 } },
    connectionDistance: { control: { type: 'number', min: 50, max: 250, step: 10 } },
    className: { control: false },
  },
};

export const Default = {
  args: {
    opacity: 0.35,
    starCount: 55,
    connectionDistance: 150,
  },
  render: (args) => (
    <div className="relative h-72 overflow-hidden rounded-xl border border-white/10 bg-black">
      <Constellation {...args} />
      <div className="relative z-10 p-6">
        <div className="text-lg font-semibold">Constellation</div>
        <div className="mt-2 text-white/70">A star field with subtle connections.</div>
      </div>
    </div>
  ),
};
