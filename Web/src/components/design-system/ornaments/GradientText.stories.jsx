import React from 'react';
import GradientText from './GradientText';

export default {
  title: 'Design System/Ornaments/GradientText',
  component: GradientText,
  argTypes: {
    animate: { control: 'boolean' },
    colors: { control: false },
    className: { control: false },
    children: { control: { type: 'text' } },
  },
};

export const Default = {
  args: {
    children: 'Mallakhamb India',
    animate: false,
    className: 'text-4xl font-bold',
  },
};

export const Animated = {
  args: {
    children: 'Animated gradient',
    animate: true,
    colors: ['#FF6B00', '#F5A623', '#FF8C38'],
    className: 'text-4xl font-bold',
  },
};
