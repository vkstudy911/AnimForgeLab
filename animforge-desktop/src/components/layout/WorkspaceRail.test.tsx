import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceRail } from './WorkspaceRail';

afterEach(() => {
  cleanup();
});

describe('WorkspaceRail', () => {
  it('renders semantic navigation landmark with all 10 workspaces and aria-current="page"', () => {
    const onSelect = vi.fn();
    render(<WorkspaceRail activeWorkspace="studio" onSelect={onSelect} />);

    const nav = screen.getByRole('navigation', { name: 'Studio Workspaces' });
    const buttons = within(nav).getAllByRole('button');
    expect(buttons).toHaveLength(10);

    const studioBtn = screen.getByRole('button', { name: 'Animation Studio' });
    expect(studioBtn.getAttribute('aria-current')).toBe('page');

    fireEvent.click(screen.getByRole('button', { name: 'Diagnostics' }));
    expect(onSelect).toHaveBeenCalledWith('diagnostics');
  });
});
