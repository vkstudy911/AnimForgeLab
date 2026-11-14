import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DoctorBar, DoctorReport } from './DoctorBar';

const mockInvoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const SAMPLE_REPORT: DoctorReport = {
  overall: 'PASS',
  workspaceRoot: '/Users/vipinkumar/Desktop/animator /AnimForgeLab',
  checkedAtEpochMs: 1700000000000,
  checks: [
    { id: 'os', label: 'OS & Arch', status: 'PASS', summary: 'macos (aarch64)', detail: null },
    { id: 'rust', label: 'Rust & Cargo', status: 'PASS', summary: 'rustc 1.99.1 / cargo 1.99.1', detail: null },
    { id: 'node', label: 'Node & npm', status: 'PASS', summary: 'node v24.19.0 / npm 11.17.0', detail: null },
    { id: 'ffmpeg', label: 'FFmpeg & ffprobe', status: 'PASS', summary: 'ffmpeg 9.0.1 / ffprobe 9.0.1', detail: null },
    { id: 'givemotion', label: 'GiveMotion', status: 'PASS', summary: 'Chrome 157 + libx264', detail: 'software (x264)' },
    { id: 'remotion', label: 'Remotion', status: 'WARN', summary: 'External CLI only', detail: 'Custom license' },
    { id: 'stretchystudio', label: 'StretchyStudio', status: 'PASS', summary: 'WebGL2 editor ready', detail: null },
    { id: 'directories', label: 'Workspace Paths', status: 'PASS', summary: 'assets/ & projects/ ok', detail: null },
  ],
};

beforeEach(() => {
  mockInvoke.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('DoctorBar', () => {
  it('loads and renders all 8 doctor check categories with accessible text badges', async () => {
    mockInvoke.mockResolvedValueOnce(SAMPLE_REPORT);
    render(<DoctorBar />);

    await waitFor(() => {
      expect(screen.getByText('Rust & Cargo')).toBeTruthy();
    });

    expect(mockInvoke).toHaveBeenCalledWith('run_doctor');
    expect(screen.getAllByText(/^(PASS|WARN|FAIL)$/)).toHaveLength(8);
    expect(screen.getByText('External CLI only')).toBeTruthy();
  });

  it('re-runs doctor check when Re-check is clicked and surfaces IPC errors via alert', async () => {
    mockInvoke
      .mockResolvedValueOnce(SAMPLE_REPORT)
      .mockRejectedValueOnce(new Error('Worker probe failed'));

    render(<DoctorBar />);
    await waitFor(() => expect(screen.getByText('GiveMotion')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Re-check' }));

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert.textContent).toContain('Worker probe failed');
    });
  });

  it('ignores stale initial response completing BEFORE active StrictMode run finishes', async () => {
    let resolveFirst!: (val: DoctorReport) => void;
    let resolveSecond!: (val: DoctorReport) => void;
    mockInvoke
      .mockReturnValueOnce(new Promise<DoctorReport>((res) => { resolveFirst = res; }))
      .mockReturnValueOnce(new Promise<DoctorReport>((res) => { resolveSecond = res; }));

    render(
      <StrictMode>
        <DoctorBar />
      </StrictMode>
    );

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(2));

    const freshReport: DoctorReport = { ...SAMPLE_REPORT, workspaceRoot: '/fresh/workspace ' };
    const staleReport: DoctorReport = { ...SAMPLE_REPORT, workspaceRoot: '/stale/workspace' };

    // Stale mount #1 resolves FIRST -> loading stays locked ('Checking...') until mount #2 completes
    await act(async () => {
      resolveFirst(staleReport);
    });
    expect((screen.getByRole('button', { name: 'Checking...' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/\/stale\/workspace/)).toBeNull();

    // Active mount #2 finishes -> unlocks Re-check and preserves trailing space
    await act(async () => {
      resolveSecond(freshReport);
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Re-check' })).toBeTruthy();
      expect(
        screen.getByText((_c, el) => el?.textContent === 'Workspace: /fresh/workspace ')
      ).toBeTruthy();
    });
  });

  it('ignores stale initial response resolving AFTER active StrictMode run completed', async () => {
    let resolveFirst!: (val: DoctorReport) => void;
    let resolveSecond!: (val: DoctorReport) => void;
    mockInvoke
      .mockReturnValueOnce(new Promise<DoctorReport>((res) => { resolveFirst = res; }))
      .mockReturnValueOnce(new Promise<DoctorReport>((res) => { resolveSecond = res; }));

    render(
      <StrictMode>
        <DoctorBar />
      </StrictMode>
    );

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(2));

    const freshReport: DoctorReport = { ...SAMPLE_REPORT, workspaceRoot: '/fresh/workspace ' };
    const staleReport: DoctorReport = { ...SAMPLE_REPORT, workspaceRoot: '/stale/workspace' };

    // Active mount #2 completes first
    await act(async () => {
      resolveSecond(freshReport);
    });
    await waitFor(() => {
      expect(
        screen.getByText((_c, el) => el?.textContent === 'Workspace: /fresh/workspace ')
      ).toBeTruthy();
    });

    // Stale mount #1 finishes late -> must NOT overwrite fresh state
    await act(async () => {
      resolveFirst(staleReport);
    });
    expect(screen.queryByText(/\/stale\/workspace/)).toBeNull();
    expect(
      screen.getByText((_c, el) => el?.textContent === 'Workspace: /fresh/workspace ')
    ).toBeTruthy();
  });

  it('clears inspecting subtitle when the initial doctor probe rejects', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Initial probe boom'));
    render(<DoctorBar />);
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Initial probe boom');
    });
    expect(screen.queryByText('Inspecting system dependencies...')).toBeNull();
    expect(screen.getByText('Workspace diagnostics unavailable')).toBeTruthy();
  });
});
