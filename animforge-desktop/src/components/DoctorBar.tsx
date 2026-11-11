import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

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

export function DoctorBar() {
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const runSeqRef = useRef(0);

  const runChecks = useCallback(async () => {
    const runId = ++runSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<DoctorReport>('run_doctor');
      if (runId !== runSeqRef.current) return;
      setReport(result);
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
    <section className="panel doctor-panel">
      <div className="doctor-header">
        <div>
          <h2 id="doctor-heading">Environment Diagnostics</h2>
          <p className="doctor-root">{subtitle}</p>
        </div>
        <button type="button" onClick={() => void runChecks()} disabled={loading}>
          {loading ? 'Checking...' : 'Re-check'}
        </button>
      </div>

      {error ? (
        <div role="alert" className="doctor-error">
          Diagnostics failed: {error}
        </div>
      ) : null}

      {report ? (
        <ul className="doctor-list" role="list">
          {report.checks.map((item) => (
            <li key={item.id} className="doctor-item">
              <div className="doctor-item-top">
                <span className="doctor-label">{item.label}</span>
                <span className={`badge badge-${item.status.toLowerCase()}`}>{item.status}</span>
              </div>
              <p className="doctor-summary">{item.summary}</p>
              {item.detail ? <p className="doctor-detail">{item.detail}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
