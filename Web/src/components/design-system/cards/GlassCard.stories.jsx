import React from 'react';
import { GlassCard } from './GlassCard';

export default {
  title: 'Design System/Cards/GlassCard',
  component: GlassCard,
  argTypes: {
    className: { control: false },
    style: { control: false },
    padding: { control: false },
    children: { control: false },
  },
};

export const Default = {
  render: (args) => (
    <GlassCard {...args}>
      <h3 className="text-lg font-semibold">Glass card</h3>
      <p className="mt-2 text-white/70">
        Use this for elevated content blocks where you want a lighter glassmorphism treatment.
      </p>
    </GlassCard>
  ),
};
