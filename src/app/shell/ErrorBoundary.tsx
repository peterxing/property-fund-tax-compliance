import { Component, type ErrorInfo, type ReactNode } from "react";
import { STORAGE_KEY } from "../../domain/index.ts";
import { peekStore } from "../state.tsx";
import { Button } from "../ui/Button.tsx";
import { Icon } from "../ui/icons.tsx";

export interface ErrorBoundaryProps {
  /**
   * "app" replaces everything; "workspace" is used under the header so the nav and persona switcher stay usable; "panel" is an inline
   * card (no <main>) for a section inside a page, so the fund rail and header survive a crash in one tab.
   */
  scope: "app" | "workspace" | "panel";
  /** When any of these change (the route path, say) a shown error is cleared and the children are tried again. */
  resetKeys?: readonly unknown[];
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function keysChanged(a: readonly unknown[] = [], b: readonly unknown[] = []): boolean {
  return a.length !== b.length || a.some((value, index) => !Object.is(value, b[index]));
}

/**
 * Catches render errors and shows a calm, actionable message instead of a blank page. "Try again" re-renders; "Reset demo data" restores the
 * seeded sample funds (the demo data lives only in this browser, so a corrupted state is the likeliest cause of a crash).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (typeof __DEV__ !== "undefined" && __DEV__) console.error(error, info.componentStack);
  }

  override componentDidUpdate(previous: ErrorBoundaryProps): void {
    if (this.state.error && keysChanged(previous.resetKeys, this.props.resetKeys)) this.setState({ error: null });
  }

  private tryAgain = (): void => {
    this.setState({ error: null });
  };

  private resetData = (): void => {
    try {
      const store = peekStore();
      if (store) {
        store.reset();
        this.setState({ error: null });
        return;
      }
    } catch {
      // fall through to clearing the saved state and reloading
    }
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage unavailable: nothing to clear
    }
    window.location.reload();
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { scope } = this.props;
    const Heading = scope === "app" ? "h1" : scope === "workspace" ? "h2" : "h3";
    const what = scope === "app" ? "The app" : scope === "workspace" ? "This workspace" : "This section";
    const card = (
      <div className={`error-card error-card--${scope}`} role="alert">
        <Icon name="alert-circle" size={24} className="error-card__icon" />
        <Heading className="error-card__title">Something went wrong</Heading>
        <p className="error-card__text">
          {what} hit an unexpected error. Your demo data lives only in this browser, so resetting it restores the original sample funds if a saved
          change is the cause.
        </p>
        {error.message ? <p className="error-card__detail">{error.message}</p> : null}
        <div className="error-card__actions">
          <Button variant="primary" onClick={this.tryAgain}>
            Try again
          </Button>
          <Button variant="secondary" onClick={this.resetData}>
            Reset demo data
          </Button>
        </div>
      </div>
    );
    if (scope === "panel") return card;
    return (
      <main id="main" tabIndex={-1} className={`error-page error-page--${scope}`}>
        {card}
      </main>
    );
  }
}
