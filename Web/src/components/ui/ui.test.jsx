/**
 * The look primitives: roles, names, keyboard behaviour and states
 * (design-language PLAN §6, Phase 3.1). Visual checks are the specimen spec.
 */
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import {
  Button, IconButton, Field, Input, PasswordInput, Tabs, TabPanel, Segmented, Dialog, ConfirmDialog,
  Menu, DataTable, StatusTag, Stat, SpecList, Heading, Tag, EmptyState, ErrorState,
  Notice, RunningOrder, RunningOrderItem, TextLink,
} from './index';
import { readEase } from '@/utils/ui/look';

describe('Button', () => {
  it('is a type="button" by default, so it never submits a form by accident', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('while loading: disabled, busy, and keeps its accessible name', () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Submit slip</Button>);
    const button = screen.getByRole('button', { name: 'Submit slip' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('carries its variant and size as classes and an icon as decoration', () => {
    render(<Button variant="line" size="sm" icon={Plus}>Add</Button>);
    const button = screen.getByRole('button', { name: 'Add' });
    expect(button).toHaveClass('ui-btn', 'ui-btn--line', 'ui-btn--sm');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('as a link, a disabled one says so instead of using `disabled`', () => {
    render(<Button as="a" href="/scores" disabled>Scores</Button>);
    expect(screen.getByRole('link', { name: 'Scores' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('an IconButton is named by its label', () => {
    render(<IconButton label="Close" icon={Plus} />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});

describe('Field', () => {
  it('labels its control and points it at the help and the error', () => {
    render(
      <Field label="Email" help="The reset code goes here" error="Enter a valid email">
        <Input type="email" />
      </Field>,
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const described = input.getAttribute('aria-describedby').split(' ').map((id) => document.getElementById(id).textContent);
    expect(described).toEqual(['The reset code goes here', 'Enter a valid email']);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email');
  });

  it('keeps a mark field a number-only TEXT input', () => {
    render(<Field label="Execution"><Input numeric inputMode="decimal" /></Field>);
    const input = screen.getByLabelText('Execution');
    expect(input).not.toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('inputmode', 'decimal');
    expect(input).toHaveClass('ui-input--numeric');
  });

  it('shows and hides a password, saying which it will do', async () => {
    const user = userEvent.setup();
    render(<Field label="Password"><PasswordInput /></Field>);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true');
  });
});

const TabsHarness = () => {
  const [tab, setTab] = useState('ind');
  return (
    <>
      <Tabs label="Results" idBase="r" value={tab} onChange={setTab}
        tabs={[{ id: 'ind', label: 'Individual' }, { id: 'team', label: 'Team' }, { id: 'all', label: 'All' }]} />
      <TabPanel idBase="r" tabId={tab}>panel {tab}</TabPanel>
    </>
  );
};

describe('Tabs and Segmented', () => {
  it('tabs: one Tab stop; arrows, Home and End move and select', async () => {
    const user = userEvent.setup();
    render(<TabsHarness />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    tabs[0].focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Team' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Team' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Individual' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Individual');
  });

  it('segmented: a radiogroup; arrows move the choice', async () => {
    const user = userEvent.setup();
    const Harness = () => {
      const [v, setV] = useState('dark');
      return <Segmented label="Appearance" value={v} onChange={setV} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />;
    };
    render(<Harness />);
    screen.getByRole('radio', { name: 'Dark' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveFocus();
  });
});

const DialogHarness = ({ onClose = () => {} }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      <Dialog open={open} onClose={() => { setOpen(false); onClose(); }} title="Remove athlete" tone="danger"
        actions={<><Button variant="line">Cancel</Button><Button variant="danger">Remove</Button></>}>
        Scores already given are kept.
      </Dialog>
    </>
  );
};

describe('Dialog', () => {
  it('is a labelled modal that takes focus, traps Tab, closes on Esc and gives focus back', async () => {
    const user = userEvent.setup();
    render(<DialogHarness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await user.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Remove athlete' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await user.tab(); await user.tab();
    expect(screen.getByRole('button', { name: 'Remove' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('ConfirmDialog starts on Cancel, stays open on failure and says why', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn().mockRejectedValue(new Error('The meet is locked.'));
    render(<ConfirmDialog open onClose={onClose} onConfirm={onConfirm} title="Lock the sheet" confirmText="Lock">Nobody can edit it after this.</ConfirmDialog>);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Lock' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The meet is locked.');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Menu', () => {
  it('opens on the first item, moves with arrows, closes on Esc back to the button', async () => {
    const user = userEvent.setup();
    const rename = vi.fn();
    render(<Menu label="Team actions" items={[{ label: 'Rename', icon: Pencil, onSelect: rename }, { label: 'Remove', icon: Trash2, onSelect: () => {}, danger: true }]} />);
    const button = screen.getByRole('button', { name: 'Team actions' });
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    button.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Remove' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(button).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }));
    expect(rename).toHaveBeenCalledTimes(1);
  });
});

describe('DataTable and the text primitives', () => {
  it('keeps every column, labels each cell for the phone cards and marks the current row', () => {
    render(<DataTable caption="Running order" getRowKey={(r) => r.id} activeKey={2}
      columns={[{ key: 'name', header: 'Athlete' }, { key: 'total', header: 'Total', numeric: true }]}
      rows={[{ id: 1, name: 'Aarav Patil', total: '9.85' }, { id: 2, name: 'Ravi Gaikwad', total: '9.40' }]} />);
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Athlete', 'Total']);
    const cells = screen.getAllByRole('cell');
    expect(cells[1]).toHaveAttribute('data-label', 'Total');
    expect(cells[1]).toHaveClass('ui-num');
    expect(screen.getAllByRole('row')[2]).toHaveAttribute('aria-current', 'true');
  });

  it('shows status, stats and specs as text', () => {
    render(
      <>
        <StatusTag status="success">Paid</StatusTag>
        <Tag tone="ident">Judge</Tag>
        <Stat label="Final score" value="9.85" unit="PTS" />
        <SpecList items={[{ label: 'Pole height', value: '2.6', unit: 'm' }]} />
        <Heading level={1} step="display-l">Running order</Heading>
      </>,
    );
    expect(screen.getByText('Paid')).toHaveClass('ui-status--success');
    expect(screen.getByText('Judge')).toHaveClass('ui-tag--ident');
    expect(screen.getByText('Final score')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Running order' })).toHaveClass('type-display-l');
    expect(screen.getByRole('term')).toHaveTextContent('Pole height');
  });

  it('an error state is announced; an empty one is not', () => {
    render(<><EmptyState>No teams yet.</EmptyState><ErrorState>Could not load the teams.</ErrorState></>);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the teams.');
  });
});

describe('readEase', () => {
  it('reads a cubic-bezier token for framer-motion, with a fallback', () => {
    document.documentElement.style.setProperty('--ease-cut', 'cubic-bezier(.62,0,.12,1)');
    expect(readEase('ease-cut')).toEqual([0.62, 0, 0.12, 1]);
    expect(readEase('no-such-token', [0, 0, 1, 1])).toEqual([0, 0, 1, 1]);
  });
});

describe('Notice', () => {
  it('says its title and text, and takes the role the caller gives it', () => {
    render(<Notice tone="danger" title="Login Failed" role="alert">Incorrect credentials.</Notice>);
    expect(screen.getByRole('alert')).toHaveTextContent('Login Failed');
    expect(screen.getByRole('alert')).toHaveTextContent('Incorrect credentials.');
  });

  it('has no role of its own', () => {
    render(<Notice>Server is starting.</Notice>);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('RunningOrder', () => {
  it('rows are pressed buttons named by their title first (the number is decoration)', async () => {
    const onClick = vi.fn();
    render(
      <RunningOrder label="Levels">
        <RunningOrderItem index={1} title="District" meta="Meets held at district level." selected onClick={() => {}} />
        <RunningOrderItem index={2} title="State" titleAs="h3" onClick={onClick} />
      </RunningOrder>,
    );
    expect(screen.getByRole('list', { name: 'Levels' })).toBeInTheDocument();
    const district = screen.getByRole('button', { name: /^District\b/ });
    expect(district).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { level: 3, name: 'State' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^State/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('TextLink', () => {
  it('renders the element it is given', () => {
    render(<TextLink href="/forgot-password">Forgot password?</TextLink>);
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveClass('ui-link');
  });
});
