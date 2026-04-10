import React from 'react';
import { DarkCard } from './DarkCard';

export default {
  title: 'Design System/Cards/DarkCard',
  component: DarkCard,
  argTypes: {
    hover: { control: 'boolean' },
    className: { control: false },
    style: { control: false },
    padding: { control: false },
    children: { control: false },
  },
};

export const Default = {
  args: {
    hover: true,
  },
  render: (args) => (
    <DarkCard {...args}>
      <h3 className="text-lg font-semibold">Dark card</h3>
      <p className="mt-2 text-white/70">Hover to see the role-accent border and subtle lift.</p>
    </DarkCard>
  ),
};
