import React from 'react';
import CoachOrnament from './CoachOrnament';

export default {
  title: 'Design System/Ornaments/CoachOrnament',
  component: CoachOrnament,
  argTypes: {
    size: { control: { type: 'select' }, options: ['sm', 'md', 'lg'] },
    color: { control: { type: 'color' } },
  },
};

export const Default = {
  args: {
    size: 'md',
  },
  render: (args) => (
    <div className="flex items-center justify-center h-80 overflow-hidden rounded-xl border border-white/10 bg-black">
      <div style={{ transform: 'scale(0.09)', transformOrigin: 'center' }}>
        <CoachOrnament {...args} />
      </div>
    </div>
  ),
};
