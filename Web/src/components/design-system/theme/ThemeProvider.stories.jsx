import React from 'react';
import { useTheme } from './useTheme';

const ThemeInspector = () => {
  const theme = useTheme();

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <div className="text-lg font-semibold">Theme context</div>
      <div className="mt-2 text-white/70">Role: {theme.role}</div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          ['primary', theme.colors.primary],
          ['primaryLight', theme.colors.primaryLight],
          ['primaryDark', theme.colors.primaryDark],
          ['background', theme.colors.background],
          ['card', theme.colors.card],
          ['border', theme.colors.border],
          ['borderBright', theme.colors.borderBright],
        ].map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2"
          >
            <div className="text-sm text-white/70">{label}</div>
            <div className="flex items-center gap-2">
              <div
                className="h-4 w-4 rounded border border-white/10"
                style={{ background: value }}
              />
              <div className="text-xs font-mono text-white/60">{value}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default {
  title: 'Design System/Theme/ThemeProvider',
  component: ThemeInspector,
  parameters: {
    docs: {
      description: {
        component:
          'The Storybook preview wraps stories in `ThemeProvider` + `MemoryRouter`. Use the toolbar to change the role theme.',
      },
    },
  },
};

export const Default = {};
