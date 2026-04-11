import React from 'react';
import { TiltCard } from './TiltCard';

export default {
  title: 'Design System/Cards/TiltCard',
  component: TiltCard,
  argTypes: {
    maxTilt: { control: { type: 'number', min: 0, max: 25, step: 1 } },
    className: { control: false },
    style: { control: false },
    children: { control: false },
  },
};

export const Default = {
  args: {
    maxTilt: 10,
  },
  render: (args) => (
    <TiltCard {...args}>
      <h3 className="text-lg font-semibold">Tilt card</h3>
      <p className="mt-2 text-white/70">
        Move your mouse over the card to see the 3D tilt effect (disabled when reduced motion is
        on).
      </p>
    </TiltCard>
  ),
};
