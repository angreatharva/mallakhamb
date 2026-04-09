import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'vitest-axe';

import { ThemeProvider } from '../theme/ThemeProvider';
import { ThemedButton } from '../forms/ThemedButton';
import { ThemedInput } from '../forms/ThemedInput';
import { ThemedSelect } from '../forms/ThemedSelect';
import { ThemedTextarea } from '../forms/ThemedTextarea';
import { GlassCard } from '../cards/GlassCard';
import { DarkCard } from '../cards/DarkCard';
import { StatCard } from '../cards/StatCard';
import { FadeIn } from '../animations/FadeIn';
import HexGrid from '../backgrounds/HexGrid';
import RadialBurst from '../backgrounds/RadialBurst';
import GradientText from '../ornaments/GradientText';
import { LiveRegion, ErrorAnnouncement, StatusAnnouncement } from './LiveRegion';
import { Trophy } from 'lucide-react';

const renderWithTheme = (ui) =>
  render(
    <MemoryRouter initialEntries={['/admin/dashboard']}>
      <ThemeProvider role="admin">{ui}</ThemeProvider>
    </MemoryRouter>
  );

describe('Design System a11y coverage', () => {
  it('passes axe checks for forms components', async () => {
    const { container } = renderWithTheme(
      <form aria-label="Design system form">
        <label htmlFor="name-input">Name</label>
        <ThemedInput id="name-input" placeholder="Enter name" />

        <label htmlFor="role-select">Role</label>
        <ThemedSelect
          id="role-select"
          options={[
            { value: 'admin', label: 'Admin' },
            { value: 'coach', label: 'Coach' },
          ]}
        />

        <label htmlFor="notes-textarea">Notes</label>
        <ThemedTextarea id="notes-textarea" />

        <ThemedButton type="submit">Submit</ThemedButton>
      </form>
    );

    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it('passes axe checks for cards and ornaments', async () => {
    const { container } = renderWithTheme(
      <section aria-label="Card gallery">
        <GlassCard>
          <h2>Glass</h2>
          <p>Glass card content</p>
        </GlassCard>
        <DarkCard>
          <h2>Dark</h2>
          <p>Dark card content</p>
        </DarkCard>
        <StatCard label="Total Teams" value={12} color="#8B5CF6" icon={Trophy} />
        <p>
          <GradientText>Accessible heading style</GradientText>
        </p>
      </section>
    );

    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it('passes axe checks for backgrounds and animations wrappers', async () => {
    const { container } = renderWithTheme(
      <section aria-label="Decorative effects section">
        <div aria-hidden="true">
          <HexGrid color="#8B5CF6" />
          <RadialBurst color="#8B5CF6" />
        </div>
        <FadeIn>
          <p>Animated content</p>
        </FadeIn>
      </section>
    );

    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });

  it('has ARIA semantics for live region announcements', () => {
    renderWithTheme(
      <div>
        <LiveRegion politeness="polite" role="status">
          Data updated
        </LiveRegion>
        <ErrorAnnouncement error="Submission failed" />
        <StatusAnnouncement message="Saved successfully" />
      </div>
    );

    const statuses = screen.getAllByRole('status');
    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses[0]).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Saved successfully')).toBeInTheDocument();
  });
});

