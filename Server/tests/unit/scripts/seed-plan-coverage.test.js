/**
 * The committed seed files agree with each other: every meet is planned, every
 * judge sits somewhere, and the walk-in fixtures match the form the desk prints.
 * A meet added to meets.json without `planPanels.js --add-missing` would only
 * fail an hour into a seeding run, at "No panel plan for ...".
 */
const fs = require('fs');
const path = require('path');
const { readMeets } = require('../../../scripts/lib/meets');
const { readPlan } = require('../../../scripts/lib/panel-plan');
const { judgeEmails } = require('../../../scripts/lib/judges');
const { buildFormLayout } = require('../../../src/utils/walk-in/form-layout.util');

describe('seed files', () => {
  const plan = readPlan();

  it('plans every meet in meets.json, and nothing else', () => {
    const places = readMeets().meets.map((m) => m.place).sort();
    expect(plan.meets.map((m) => m.place).sort()).toEqual(places);
  });

  it('seats every judge in judges.json at some meet', () => {
    const seated = new Set(plan.meets.flatMap((m) => Object.values(m.seats)));
    expect(judgeEmails().filter((email) => !seated.has(email))).toEqual([]);
  });

  it('records the seed of every addition, so it can be reproduced', () => {
    for (const addition of plan.additions || []) {
      expect(Number.isInteger(addition.seed)).toBe(true);
      expect(addition.places.every((p) => plan.meets.some((m) => m.place === p))).toBe(true);
    }
  });
});

describe('walk-in fixtures', () => {
  const dir = path.join(__dirname, '..', '..', 'fixtures', 'walk-in');
  const forms = JSON.parse(fs.readFileSync(path.join(dir, 'forms.json'), 'utf8'));
  const layout = buildFormLayout();

  it('are of the form the desk prints now (re-render: npm run walkin:fixtures)', () => {
    expect(forms.formVersion).toBe(layout.version);
  });

  const pages = forms.desks.flatMap((d) => d.pages);

  it('name rows that exist on their page, and images that are committed', () => {
    for (const page of pages) {
      expect(fs.existsSync(path.join(dir, page.file))).toBe(true);
      const sections = layout.pages.find((p) => p.page === page.page).sections;
      for (const row of page.rows) {
        const section = sections.find((s) => s.key === row.section);
        expect(section).toBeDefined();
        expect(section.rows.some((r) => r.rowNo === row.rowNo)).toBe(true);
        expect(row.apparatus.every((a) => section.rows[0].ticks.some((t) => t.apparatus === a))).toBe(true);
      }
    }
  });

  it('each desk enters a different seeded meet, with a coach of its own', () => {
    const places = forms.desks.map((d) => d.meet);
    expect(places.every((p) => readMeets().meets.some((m) => m.place === p))).toBe(true);
    expect(new Set(places).size).toBe(places.length);
    expect(new Set(forms.desks.map((d) => d.coach.email)).size).toBe(forms.desks.length);
  });

  it('never writes the same child twice (one child, one Player ID)', () => {
    const keys = pages.flatMap((p) => p.rows.map((r) => `${r.firstName}|${r.lastName}|${r.dateOfBirth}`));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
