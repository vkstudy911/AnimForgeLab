import { useCallback, useEffect, useRef, useState } from 'react';
import { DoctorBar } from '../components/DoctorBar';
import { StatusBadge } from '../components/ui/StatusBadge';
import { useStudioContext } from '../context/StudioContext';
import type { PreviewServerProbeResult } from '../types';

export function DiagnosticsWorkspace() {
  const {
    previewBaseUrl,
    probePreviewServer,
    refreshDoctor,
    refreshProjects,
    busy,
    doctorLoading,
    doctorReport,
  } = useStudioContext();
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);
  const [probeResult, setProbeResult] = useState<PreviewServerProbeResult | null>(null);
  const [probing, setProbing] = useState(false);

  const probeSeqRef = useRef(0);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const runProbe = useCallback(async () => {
    const seq = ++probeSeqRef.current;
    setProbing(true);
    try {
      const res = await probePreviewServer();
      if (seq === probeSeqRef.current && res) {
        setProbeResult(res);
      }
    } finally {
      if (seq === probeSeqRef.current) {
        setProbing(false);
      }
    }
  }, [probePreviewServer]);

  useEffect(() => {
    mountedRef.current = true;
    void runProbe();
    return () => {
      mountedRef.current = false;
      probeSeqRef.current += 1;
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
      if (reportTimerRef.current !== null) {
        clearTimeout(reportTimerRef.current);
      }
    };
  }, [runProbe]);

  const handleRefreshAll = () => {
    setRefreshNonce((n) => n + 1);
    void runProbe();
    void refreshDoctor();
    void refreshProjects();
  };

  const handleCopyUrl = async () => {
    if (!previewBaseUrl || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(previewBaseUrl);
      if (!mountedRef.current) return;
      setCopied(true);
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => {
        copyTimerRef.current = null;
        if (mountedRef.current) {
          setCopied(false);
        }
      }, 1800);
    } catch {
      // Ignore clipboard failures in restricted environments
    }
  };

  const handleGenerateReport = async () => {
    if (!navigator.clipboard?.writeText) return;
    const lines: string[] = [
      '# AnimForge Studio — Diagnostic Report',
      `Timestamp: ${new Date().toISOString()}`,
      `Workspace Root: ${doctorReport?.workspaceRoot ?? 'Unknown'}`,
      `PreviewServer Base URL: ${probeResult?.baseUrl ?? previewBaseUrl ?? 'Unknown'}`,
      `PreviewServer Reachable: ${probeResult?.reachable ? `Yes (${probeResult.latencyMs}ms)` : 'No'}`,
      `Overall System Health: ${doctorReport?.overall ?? 'Pending'}`,
      '',
      '## System & Toolchain Probes',
    ];

    if (doctorReport?.checks) {
      for (const check of doctorReport.checks) {
        lines.push(`- [${check.status}] ${check.label}: ${check.summary}${check.detail ? ` (${check.detail})` : ''}`);
      }
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      if (!mountedRef.current) return;
      setCopiedReport(true);
      if (reportTimerRef.current !== null) {
        clearTimeout(reportTimerRef.current);
      }
      reportTimerRef.current = setTimeout(() => {
        reportTimerRef.current = null;
        if (mountedRef.current) {
          setCopiedReport(false);
        }
      }, 2000);
    } catch {
      // Ignore
    }
  };

  const dirsCheck = doctorReport?.checks.find((c) => c.id === 'dirs');

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h2>System Diagnostics</h2>
          <p className="field-hint">
            Inspect local toolchain probes, engine availability, storage health, and loopback preview server.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void handleGenerateReport()}
          >
            {copiedReport ? 'Report Copied!' : 'Copy Diagnostic Report'}
          </button>
          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={doctorLoading || busy.loadingList || probing}
          >
            {doctorLoading || busy.loadingList || probing ? 'Refreshing...' : 'Refresh All'}
          </button>
        </div>
      </div>

      <div className="dialog-two-col" style={{ marginBottom: 14 }}>
        <section className="panel" aria-labelledby="preview-server-heading">
          <div className="page-header-row">
            <div>
              <h3 id="preview-server-heading">PreviewServer Loopback</h3>
              <p className="mono field-hint" style={{ marginTop: 4 }}>
                {probeResult?.baseUrl || previewBaseUrl || 'Preview server URL unavailable'}
              </p>
              {probeResult && !probeResult.reachable && probeResult.error ? (
                <p className="field-hint" style={{ color: 'var(--status-fail)', marginTop: 4 }}>
                  {probeResult.error}
                </p>
              ) : null}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {probing && !probeResult ? (
                <StatusBadge tone="neutral">Checking...</StatusBadge>
              ) : probeResult ? (
                <StatusBadge tone={probeResult.reachable ? 'pass' : 'fail'}>
                  {probeResult.reachable ? `Reachable (${probeResult.latencyMs} ms)` : 'Offline'}
                </StatusBadge>
              ) : (
                <StatusBadge tone="warn">Unprobed</StatusBadge>
              )}
              <button type="button" onClick={() => void runProbe()} disabled={probing}>
                {probing ? 'Probing...' : 'Probe Connection'}
              </button>
              {previewBaseUrl ? (
                <button type="button" onClick={() => void handleCopyUrl()}>
                  {copied ? 'Copied' : 'Copy URL'}
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="panel" aria-labelledby="storage-health-heading">
          <h3 id="storage-health-heading">Storage &amp; Persistence</h3>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 'var(--text-sm)', marginTop: 8 }}>
            <dt className="field-hint">Workspace Root</dt>
            <dd className="mono" style={{ wordBreak: 'break-all' }}>{doctorReport?.workspaceRoot ?? 'Loading...'}</dd>
            <dt className="field-hint">Database</dt>
            <dd className="mono">projects/animforge.db (SQLite)</dd>
            <dt className="field-hint">Disk Status</dt>
            <dd className="mono">{dirsCheck?.summary ?? 'OK'}</dd>
          </dl>
        </section>
      </div>

      <DoctorBar key={refreshNonce} />
    </div>
  );
}
