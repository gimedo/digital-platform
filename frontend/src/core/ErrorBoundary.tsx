import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode; title?: string; onRetry?: () => void };
type State = { error: Error | null };

/** Aísla fallas: si una página explota, solo esa página muestra el error; el menú y el resto siguen funcionando. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  retry = () => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page-error">
        <div className="page-error-ico">!</div>
        <h2>{this.props.title ?? 'Esta página tuvo un error'}</h2>
        <p>El resto de la plataforma sigue funcionando. Podés usar el menú o reintentar.</p>
        <code>{this.state.error.message}</code>
        <div>
          <button className="btn dark" onClick={this.retry}>Reintentar</button>
        </div>
      </div>
    );
  }
}
