import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logError } from '../lib/error-logger';

interface Props {
  children: ReactNode;
  resetKey?: string;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logError(error.message, 'ErrorBoundary', info.componentStack ?? error.stack);
  }

  componentDidUpdate(prevProps: Props): void {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid rgba(255,255,255,0.1)',
            textAlign: 'center',
            color: '#fff',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
        >
          <div style={{ fontSize: '12px', color: '#a0a0a0', marginBottom: '8px' }}>
            YOUTUBE DETOX
          </div>
          <div style={{ fontSize: '13px', color: '#ccc', marginBottom: '12px' }}>
            Something went wrong
          </div>
          <button
            onClick={() => this.setState({ hasError: false })}
            style={{
              padding: '6px 16px',
              border: 'none',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.1)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
