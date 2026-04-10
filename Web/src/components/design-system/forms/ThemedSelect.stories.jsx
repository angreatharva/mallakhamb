import React from 'react';
import { ThemedSelect } from './ThemedSelect';

export default {
  title: 'Design System/Forms/ThemedSelect',
  component: ThemedSelect,
  argTypes: {
    placeholder: { control: { type: 'text' } },
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
    options: { control: 'object' },
  },
};

export const Default = {
  args: {
    placeholder: 'Select an option',
    options: [
      { value: 'beginner', label: 'Beginner' },
      { value: 'intermediate', label: 'Intermediate' },
      { value: 'advanced', label: 'Advanced' },
    ],
    defaultValue: '',
  },
};
