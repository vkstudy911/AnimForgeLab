import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({
    overall: 'PASS',
    workspaceRoot: '/Users/vipinkumar/Desktop/animator /AnimForgeLab',
    checkedAtEpochMs: 1,
    checks: [
      { id: 'os', label: 'OS & Arch', status: 'PASS', summary: 'macos (aarch64)', detail: null },
    ],
  }),
}));

afterEach(() => {
  cleanup();
});

describe('App desktop shell', () => {
  it('renders AnimForge Studio landmark structure and DoctorBar', async () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'AnimForge Studio' })).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText('OS & Arch')).toBeTruthy();
    });
  });
});
