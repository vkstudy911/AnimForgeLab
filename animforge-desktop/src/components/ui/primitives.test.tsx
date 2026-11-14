import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioButton } from './StudioButton';
import { StudioDialog } from './StudioDialog';
import { StudioNotification } from './StudioNotification';
import { StudioTabs } from './StudioTabs';
import { StudioTooltip } from './StudioTooltip';
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

  it('StudioButton renders variants and handles click and disabled/loading state', () => {
    const handleClick = vi.fn();
    const { rerender } = render(
      <StudioButton
        variant="primary"
        size="sm"
        icon={<span data-testid="btn-icon">★</span>}
        onClick={handleClick}
      >
        Save
      </StudioButton>
    );

    const btn = screen.getByRole('button', { name: /Save/i });
    expect(btn.classList.contains('btn-primary')).toBe(true);
    expect(screen.getByTestId('btn-icon')).toBeDefined();
    expect(btn.style.fontSize).toBe('var(--text-xs)');
    expect(btn.style.padding).toBe('3px 8px');

    fireEvent.click(btn);
    expect(handleClick).toHaveBeenCalledTimes(1);

    // Variants: danger, ghost, secondary
    rerender(
      <StudioButton variant="danger">
        Delete
      </StudioButton>
    );
    expect(screen.getByRole('button', { name: 'Delete' }).classList.contains('btn-danger')).toBe(true);

    rerender(
      <StudioButton variant="ghost">
        Ghost
      </StudioButton>
    );
    expect(screen.getByRole('button', { name: 'Ghost' }).classList.contains('btn-ghost')).toBe(true);

    rerender(
      <StudioButton variant="secondary">
        Cancel
      </StudioButton>
    );
    expect(screen.getByRole('button', { name: 'Cancel' }).classList.contains('btn-secondary')).toBe(true);

    // Disabled state
    rerender(
      <StudioButton disabled onClick={handleClick}>
        Disabled
      </StudioButton>
    );
    const disabledBtn = screen.getByRole('button', { name: 'Disabled' });
    expect(disabledBtn.hasAttribute('disabled')).toBe(true);
    fireEvent.click(disabledBtn);
    expect(handleClick).toHaveBeenCalledTimes(1);

    // Loading state
    rerender(
      <StudioButton loading onClick={handleClick}>
        Loading
      </StudioButton>
    );
    const loadingBtn = screen.getByRole('button', { name: 'Loading' });
    expect(loadingBtn.hasAttribute('disabled')).toBe(true);
    expect(loadingBtn.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(loadingBtn);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('StudioTooltip shows tooltip on focus/hover and links aria-describedby', () => {
    render(
      <StudioTooltip content="Quick Save shortcut" position="bottom">
        <button type="button">Save</button>
      </StudioTooltip>
    );

    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.getAttribute('aria-describedby')).toBeNull();
    expect(screen.queryByRole('tooltip')).toBeNull();

    // Hover
    fireEvent.mouseEnter(button);
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toBeDefined();
    expect(tooltip.textContent).toBe('Quick Save shortcut');
    expect(tooltip.getAttribute('data-position')).toBe('bottom');
    expect(button.getAttribute('aria-describedby')).toBe(tooltip.id);

    // Leave
    fireEvent.mouseLeave(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(button.getAttribute('aria-describedby')).toBeNull();

    // Focus
    fireEvent.focus(button);
    const tooltipOnFocus = screen.getByRole('tooltip');
    expect(tooltipOnFocus).toBeDefined();
    expect(button.getAttribute('aria-describedby')).toBe(tooltipOnFocus.id);

    // Escape closes tooltip
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(button.getAttribute('aria-describedby')).toBeNull();

    // Blur after focus
    fireEvent.focus(button);
    expect(screen.getByRole('tooltip')).toBeDefined();
    fireEvent.blur(button);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('StudioNotification renders variant styling and calls onDismiss when dismiss button is clicked', () => {
    const handleDismiss = vi.fn();
    const handleAction = vi.fn();

    const { rerender } = render(
      <StudioNotification
        type="error"
        title="Sync Failed"
        message="Cannot reach project storage"
        onDismiss={handleDismiss}
        action={{ label: 'Retry', onClick: handleAction }}
      />
    );

    // Error notification has role="alert"
    const alert = screen.getByRole('alert');
    expect(alert.classList.contains('studio-notification-error')).toBe(true);
    expect(screen.getByText('Sync Failed')).toBeDefined();
    expect(screen.getByText('Cannot reach project storage')).toBeDefined();

    // Action button
    const actionBtn = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(actionBtn);
    expect(handleAction).toHaveBeenCalledTimes(1);

    // Dismiss button
    const dismissBtn = screen.getByRole('button', { name: 'Dismiss' });
    fireEvent.click(dismissBtn);
    expect(handleDismiss).toHaveBeenCalledTimes(1);

    // Success notification has role="status" and variant class
    rerender(
      <StudioNotification
        type="success"
        message="Changes saved"
      />
    );
    const status = screen.getByRole('status');
    expect(status.classList.contains('studio-notification-success')).toBe(true);
    expect(screen.getByText('Changes saved')).toBeDefined();
  });
});
