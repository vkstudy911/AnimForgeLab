import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDialog } from './StudioDialog';
import { StudioTabs } from './StudioTabs';
import { WorkspaceErrorBoundary } from './WorkspaceErrorBoundary';

afterEach(() => {
  cleanup();
});

describe('Accessible UI primitives', () => {
  it('StudioTabs enforces single-row roving tabindex, keyboard arrows, and hidden panels', () => {
    render(
      <StudioTabs
        label="Panel Views"
        tabs={[
          { id: 'scenes', label: 'Scenes', content: <div>Scenes Pane</div> },
          { id: 'characters', label: 'Characters', content: <div>Characters Pane</div> },
          { id: 'assets', label: 'Assets', content: <div>Assets Pane</div> },
        ]}
      />
    );

    const scenesTab = screen.getByRole('tab', { name: 'Scenes' });
    const charsTab = screen.getByRole('tab', { name: 'Characters' });
    expect(scenesTab.getAttribute('aria-selected')).toBe('true');
    expect(scenesTab.tabIndex).toBe(0);
    expect(charsTab.tabIndex).toBe(-1);

    scenesTab.focus();
    fireEvent.keyDown(scenesTab, { key: 'ArrowRight' });
    expect(charsTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(charsTab);
    expect(screen.getByText('Scenes Pane').closest('[role="tabpanel"]')?.hasAttribute('hidden')).toBe(
      true
    );
    expect(
      screen.getByText('Characters Pane').closest('[role="tabpanel"]')?.hasAttribute('hidden')
    ).toBe(false);
  });

  it('StudioDialog closes on Cancel unless dirty guard blocks Escape', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <StudioDialog open title="Create Project" onClose={onClose} preventEscapeWhenDirty>
        <p>Body</p>
      </StudioDialog>
    );

    const dialog = document.querySelector('dialog')!;
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onClose).not.toHaveBeenCalled();

    rerender(
      <StudioDialog open title="Create Project" onClose={onClose} preventEscapeWhenDirty={false}>
        <p>Body</p>
      </StudioDialog>
    );
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('WorkspaceErrorBoundary catches child exceptions and offers recovery', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Explode(): JSX.Element {
      throw new Error('Stage render failure');
    }

    const onHome = vi.fn();
    render(
      <WorkspaceErrorBoundary workspaceName="Animation Studio" onResetHome={onHome}>
        <Explode />
      </WorkspaceErrorBoundary>
    );

    expect(screen.getByRole('alert').textContent).toContain('Stage render failure');
    fireEvent.click(screen.getByRole('button', { name: 'Return to Home' }));
    expect(onHome).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
