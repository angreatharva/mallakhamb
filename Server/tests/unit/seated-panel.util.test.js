const { seatedPanelSize } = require('../../src/utils/scoring/seated-panel.util');

const seat = (judgeType, apparatus = null) => ({ judgeType, apparatus });

describe('seatedPanelSize', () => {
  it('counts evaluation seats only', () => {
    expect(seatedPanelSize([seat('Senior Judge'), seat('Judge 1'), seat('Judge 2'), seat('Scorer'), seat('Time Keeper')])).toBe(3);
  });

  it('ignores another apparatus, keeps category-wide seats, counts a role once', () => {
    const seats = [
      seat('Senior Judge', 'Pole Mallakhamb'), seat('Judge 1', 'Pole Mallakhamb'),
      seat('Judge 1'), seat('Judge 2'), seat('Judge 3', 'Rope Mallakhamb'), seat('Judge 4', 'Pole Mallakhamb'),
    ];
    expect(seatedPanelSize(seats, 'Pole Mallakhamb')).toBe(4);
    // Rope: the category-wide Judge 1 and 2, plus its own Judge 3; the Senior Judge seat is Pole's.
    expect(seatedPanelSize(seats, 'Rope Mallakhamb')).toBe(3);
  });

  it('is null when the seats make no panel', () => {
    expect(seatedPanelSize([seat('Senior Judge'), seat('Judge 1')])).toBeNull();
    expect(seatedPanelSize(null)).toBeNull();
  });
});
