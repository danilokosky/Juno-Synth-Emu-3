import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-amber-500/60 rounded-lg p-5 max-w-md w-full shadow-2xl text-center space-y-3">
            <h3 className="text-amber-400 font-mono font-bold text-lg">Hera Synthesizer</h3>
            <p className="text-zinc-300 text-xs font-mono">
              O sintetizador se recuperou de um erro inesperado.
            </p>
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-mono font-bold text-xs rounded cursor-pointer transition-colors"
            >
              Recarregar Painel
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
