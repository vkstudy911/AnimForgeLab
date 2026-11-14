import React from 'react';

interface Props {
  workspaceName: string;
  onResetHome?: () => void;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class WorkspaceErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(err: unknown): State {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.workspaceName !== this.props.workspaceName && this.state.hasError) {
      this.setState({ hasError: false, message: '' });
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <section className="panel workspace-fallback" role="alert">
        <h2>Workspace Error in {this.props.workspaceName}</h2>
        <p className="field-hint">{this.state.message}</p>
        <div className="workspace-fallback-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => this.setState({ hasError: false, message: '' })}
          >
            Reload View
          </button>
          {this.props.onResetHome ? (
            <button type="button" onClick={this.props.onResetHome}>
              Return to Home
            </button>
          ) : null}
        </div>
      </section>
    );
  }
}
