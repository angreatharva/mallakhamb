import React from 'react';
import { Users } from 'lucide-react';
import { StatCard } from './StatCard';

export default {
  title: 'Design System/Cards/StatCard',
  component: StatCard,
  argTypes: {
    icon: { control: false },
    label: { control: { type: 'text' } },
    value: { control: { type: 'text' } },
    subtitle: { control: { type: 'text' } },
    color: { control: { type: 'color' } },
    delay: { control: { type: 'number', min: 0, max: 1000, step: 50 } },
    padding: { control: false },
    fontSize: { control: false },
  },
};

export const Default = {
  args: {
    icon: Users,
    label: 'Total participants',
    value: '1,234',
    subtitle: 'Active this month',
    color: '#8B5CF6',
    delay: 0,
  },
};
