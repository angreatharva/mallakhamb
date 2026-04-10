import React from 'react';
import { Plus } from 'lucide-react';
import { ThemedButton } from './ThemedButton';

export default {
  title: 'Design System/Forms/ThemedButton',
  component: ThemedButton,
  argTypes: {
    variant: { control: { type: 'select' }, options: ['solid', 'outline', 'ghost'] },
    size: { control: { type: 'select' }, options: ['sm', 'md', 'lg'] },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
    icon: { control: false },
    padding: { control: false },
    onClick: { action: 'clicked' },
  },
};

export const Solid = {
  args: {
    children: 'Submit',
    variant: 'solid',
    size: 'md',
    loading: false,
    disabled: false,
  },
};

export const OutlineWithIcon = {
  args: {
    children: 'Add item',
    variant: 'outline',
    size: 'md',
    icon: Plus,
  },
};

export const Loading = {
  args: {
    children: 'Saving',
    variant: 'solid',
    size: 'md',
    loading: true,
  },
};
