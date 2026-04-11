import React, { useState } from 'react';
import { Mail, Eye, EyeOff } from 'lucide-react';
import { ThemedInput } from './ThemedInput';

export default {
  title: 'Design System/Forms/ThemedInput',
  component: ThemedInput,
  argTypes: {
    type: { control: { type: 'text' } },
    placeholder: { control: { type: 'text' } },
    disabled: { control: 'boolean' },
    readOnly: { control: 'boolean' },
    error: { control: { type: 'text' } },
    icon: { control: false },
    rightElement: { control: false },
    padding: { control: false },
    fontSize: { control: false },
  },
};

export const Email = {
  args: {
    icon: Mail,
    type: 'email',
    placeholder: 'Enter email',
  },
};

export const WithErrorMessage = {
  args: {
    icon: Mail,
    type: 'email',
    placeholder: 'Enter email',
    error: 'Email is required',
  },
};

export const PasswordWithToggle = {
  render: (args) => {
    const [visible, setVisible] = useState(false);

    return (
      <ThemedInput
        {...args}
        type={visible ? 'text' : 'password'}
        rightElement={
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="text-white/70 hover:text-white transition-colors"
            aria-label={visible ? 'Hide password' : 'Show password'}
          >
            {visible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        }
      />
    );
  },
  args: {
    placeholder: 'Enter password',
  },
};
