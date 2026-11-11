import { DoctorBar } from './components/DoctorBar';

export default function App() {
  return (
    <div className="studio-shell">
      <header className="studio-header">
        <div className="studio-brand">
          <h1>AnimForge Studio</h1>
          <span className="studio-tag">macOS / Linux Desktop</span>
        </div>
      </header>
      <main className="studio-main">
        <DoctorBar />
      </main>
    </div>
  );
}
