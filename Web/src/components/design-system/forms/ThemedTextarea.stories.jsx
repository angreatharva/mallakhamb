import React from 'react';
import { ThemedTextarea } from './ThemedTextarea';

export default {
  title: 'Design System/Forms/ThemedTextarea',
  component: ThemedTextarea,
  argTypes: {
    placeholder: { control: { type: 'text' } },
    rows: { control: { type: 'number', min: 2, max: 12, step: 1 } },
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
    error: { control: { type: 'text' } },
  },
};

export const Default = {
  args: {
    placeholder: 'Enter description',
    rows: 4,
    error: false,
  },
};

export const WithErrorMessage = {
  args: {
    placeholder: 'Enter description',
    rows: 4,
    error: 'Description is required',
  },
};
