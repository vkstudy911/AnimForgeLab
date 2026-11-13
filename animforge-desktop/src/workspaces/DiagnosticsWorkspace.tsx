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
  } = useStudioContext();
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [copied, setCopied] = useState(false);
  const [probeResult, setProbeResult] = useState<PreviewServerProbeResult | null>(null);
  const [probing, setProbing] = useState(false);

  const probeSeqRef = useRef(0);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  return (
    <div className="page-container">
      <div className="page-header-row">
        <div>
          <h2>System Diagnostics</h2>
          <p className="field-hint">
            Inspect local toolchain probes, engine availability, and loopback preview server.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefreshAll}
          disabled={doctorLoading || busy.loadingList || probing}
        >
          {doctorLoading || busy.loadingList || probing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <section className="panel" aria-labelledby="preview-server-heading">
        <div className="page-header-row">
          <div>
            <h3 id="preview-server-heading">PreviewServer Loopback URL</h3>
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

      <DoctorBar key={refreshNonce} />
    </div>
  );
}
