import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  DiagnosticsIcon,
  XCircleIcon,
} from './ui/Icons';
import { StatusBadge, type BadgeTone } from './ui/StatusBadge';

export type CheckStatus = 'PASS' | 'WARN' | 'FAIL';

export interface DoctorCheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  summary: string;
  detail: string | null;
}

export interface DoctorReport {
  overall: CheckStatus;
  workspaceRoot: string;
  checks: DoctorCheckItem[];
  checkedAtEpochMs: number;
}

export interface DoctorBarProps {
  onReportLoaded?: (report: DoctorReport) => void;
}

function statusToTone(status: CheckStatus): BadgeTone {
  switch (status) {
    case 'PASS':
      return 'pass';
    case 'WARN':
      return 'warn';
    case 'FAIL':
      return 'fail';
  }
}

function StatusIcon({ status }: { status: CheckStatus }) {
  switch (status) {
    case 'PASS':
      return <CheckCircleIcon size={15} />;
    case 'WARN':
      return <AlertTriangleIcon size={15} />;
    case 'FAIL':
      return <XCircleIcon size={15} />;
  }
}

export function DoctorBar({ onReportLoaded }: DoctorBarProps = {}) {
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const runSeqRef = useRef(0);
  const onReportLoadedRef = useRef(onReportLoaded);
  onReportLoadedRef.current = onReportLoaded;

  const runChecks = useCallback(async () => {
    const runId = ++runSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<DoctorReport>('run_doctor');
      if (runId !== runSeqRef.current) return;
      setReport(result);
      onReportLoadedRef.current?.(result);
    } catch (err: unknown) {
      if (runId !== runSeqRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (runId === runSeqRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void runChecks();
    return () => {
      runSeqRef.current += 1;
    };
  }, [runChecks]);

  const subtitle = report
    ? `Workspace: ${report.workspaceRoot}`
    : error && !loading
      ? 'Workspace diagnostics unavailable'
      : 'Inspecting system dependencies...';

  return (
    <section className="panel doctor-panel" aria-labelledby="doctor-heading">
      <div className="page-header-row doctor-header" style={{ marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <DiagnosticsIcon size={16} />
            <h2 id="doctor-heading">Environment Diagnostics</h2>
            {report ? (
              <StatusBadge tone={statusToTone(report.overall)}>
                Overall: {report.overall}
              </StatusBadge>
            ) : null}
          </div>
          <p className="doctor-root field-hint mono" style={{ marginTop: 4 }}>
            {subtitle}
          </p>
        </div>
        <button type="button" onClick={() => void runChecks()} disabled={loading}>
          {loading ? 'Checking...' : 'Re-check'}
        </button>
      </div>

      {error ? (
        <div role="alert" className="studio-alert doctor-error" style={{ margin: '0 0 12px 0' }}>
          <span>Diagnostics failed: {error}</span>
        </div>
      ) : null}

      {report ? (
        <ul className="doctor-list" role="list">
          {report.checks.map((item) => (
            <li key={item.id} className="doctor-item">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="doctor-item-top" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <StatusIcon status={item.status} />
                  <span className="doctor-label" style={{ fontWeight: 600 }}>
                    {item.label}
                  </span>
                </div>
                <p className="doctor-summary field-hint" style={{ marginTop: 2 }}>
                  {item.summary}
                </p>
                {item.detail ? (
                  <details className="doctor-detail-box" open style={{ marginTop: 4 }}>
                    <summary className="field-hint" style={{ cursor: 'pointer' }}>
                      Details
                    </summary>
                    <p className="doctor-detail mono field-hint" style={{ marginTop: 2 }}>
                      {item.detail}
                    </p>
                  </details>
                ) : null}
              </div>
              <StatusBadge tone={statusToTone(item.status)}>{item.status}</StatusBadge>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
