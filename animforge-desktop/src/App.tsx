export default function App() {
  return (
    <div className="studio-shell">
      <header className="studio-header">
        <div className="studio-brand">
          <h1>AnimForge Studio</h1>
          <span className="studio-tag">Tauri 2 Desktop Shell</span>
        </div>
      </header>
      <main className="studio-main">
        <section className="panel" aria-labelledby="shell-status-heading">
          <h2 id="shell-status-heading">Studio Core Ready</h2>
          <p>macOS WKWebView / Linux WebKitGTK shell configured for local preview.</p>
        </section>
      </main>
    </div>
  );
}
