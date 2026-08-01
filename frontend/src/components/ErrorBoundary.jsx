import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
    if (window.Sentry) {
      window.Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-surface p-6">
          <div className="max-w-md w-full text-center space-y-4">
            <h1 className="text-2xl font-bold text-primary">Something went wrong</h1>
            <p className="text-secondary">
              An unexpected error occurred. Please try again or refresh the page.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 rounded-lg bg-accent text-white font-medium hover:opacity-90 transition"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg border border-border text-secondary font-medium hover:bg-muted transition"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
