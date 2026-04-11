import React from 'react';
import FadeIn from './FadeIn';

export default {
  title: 'Design System/Animations/FadeIn',
  component: FadeIn,
  argTypes: {
    delay: { control: { type: 'number', min: 0, max: 1000, step: 50 } },
    direction: { control: { type: 'select' }, options: ['up', 'down', 'left', 'right'] },
    className: { control: false },
    children: { control: false },
  },
};

export const Default = {
  args: {
    delay: 100,
    direction: 'up',
  },
  render: (args) => (
    <div className="space-y-4">
      <div className="text-white/70">
        Scroll is not required in Storybook; it should animate on mount.
      </div>
      <FadeIn {...args}>
        <div className="rounded-xl border border-white/10 bg-white/5 p-6">
          <div className="text-lg font-semibold">Fades in</div>
          <div className="mt-2 text-white/70">Intersection Observer triggers once.</div>
        </div>
      </FadeIn>
    </div>
  ),
};
