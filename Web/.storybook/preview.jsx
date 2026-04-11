import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../src/components/design-system/theme/ThemeProvider';
import '../src/index.css';

export const globalTypes = {
  role: {
    name: 'Role theme',
    description: 'Design-system role theme override',
    defaultValue: 'public',
    toolbar: {
      icon: 'user',
      items: [
        { value: 'public', title: 'Public' },
        { value: 'player', title: 'Player' },
        { value: 'coach', title: 'Coach' },
        { value: 'judge', title: 'Judge' },
        { value: 'admin', title: 'Admin' },
        { value: 'superadmin', title: 'Super Admin' },
      ],
      dynamicTitle: true,
    },
  },
};

export const parameters = {
  layout: 'padded',
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/i,
    },
  },
  docs: {
    source: { state: 'open' },
  },
  darkMode: {
    stylePreview: true,
  },
};

export const decorators = [
  (Story, context) => {
    const role = context.globals.role || 'public';

    return (
      <MemoryRouter initialEntries={[`/${role}`]}>
        <ThemeProvider role={role}>
          <div className="min-h-screen p-6 text-white bg-[#0B0B0F]">
            <Story />
          </div>
        </ThemeProvider>
      </MemoryRouter>
    );
  },
];
