import React, { useState } from 'react';
import { ErrorAnnouncement, LiveRegion, StatusAnnouncement } from './LiveRegion';

export default {
  title: 'Design System/Accessibility/LiveRegion',
  component: LiveRegion,
  argTypes: {
    politeness: { control: { type: 'select' }, options: ['polite', 'assertive', 'off'] },
    role: { control: { type: 'select' }, options: ['status', 'alert', 'log'] },
    atomic: { control: 'boolean' },
    clearOnUnmount: { control: 'boolean' },
    children: { control: { type: 'text' } },
  },
};

export const CustomLiveRegion = {
  args: {
    politeness: 'polite',
    role: 'status',
    atomic: true,
    clearOnUnmount: true,
    children: 'Background sync complete',
  },
  render: (args) => (
    <div className="space-y-4">
      <div className="text-white/70">
        This renders a screen-reader-only live region. Use the Accessibility addon panel to inspect
        ARIA.
      </div>
      <LiveRegion {...args} />
      <div className="rounded-lg border border-white/10 bg-white/5 p-4">
        Visible content (live region is <span className="font-mono">sr-only</span>).
      </div>
    </div>
  ),
};

export const StatusAndErrorHelpers = {
  render: () => {
    const [status, setStatus] = useState('Ready');
    const [error, setError] = useState(null);

    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          <button
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10"
            onClick={() => {
              setError(null);
              setStatus('Saved successfully');
            }}
            type="button"
          >
            Trigger status
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10"
            onClick={() => {
              setStatus('Ready');
              setError('Network error: please retry');
            }}
            type="button"
          >
            Trigger error
          </button>
        </div>

        <div className="rounded-lg border border-white/10 bg-white/5 p-4">
          <div className="text-white/70">Status: {status}</div>
          <div className="text-white/70">Error: {error || '—'}</div>
        </div>

        <StatusAnnouncement message={status} />
        <ErrorAnnouncement error={error} />
      </div>
    );
  },
};
