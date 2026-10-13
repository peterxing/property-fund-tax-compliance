import { lazy, Suspense, useEffect, useRef } from "react";
import { GALLERY_PATH, useRoute } from "./router.ts";
import { StoreProvider } from "./state.tsx";
import { ErrorBoundary } from "./shell/ErrorBoundary.tsx";
import { Footer } from "./shell/Footer.tsx";
import { Header } from "./shell/Header.tsx";
import { LiveRegionProvider, useAnnounce } from "./ui/LiveRegion.tsx";
import { Spinner } from "./ui/Spinner.tsx";
import { workspaceFor } from "./workspaces/index.ts";

// The design gallery exists only in dev builds: with __DEV__ false the branch (and the module it imports) is removed from the bundle.
const Gallery = __DEV__ ? lazy(() => import("./dev/Gallery.tsx")) : null;

function focusMain(): void {
  const main = document.getElementById("main");
  if (main) main.focus();
}

/** Header, the workspace for the current route, footer. A crash in a workspace leaves the header usable. */
function Shell() {
  const route = useRoute();
  const workspace = workspaceFor(route.path);
  const Workspace = workspace.component;
  const announce = useAnnounce();
  const lastPath = useRef(route.path);

  // On a change of workspace (not on first load, not when only the fund or tab changes) start from the top of the new page.
  useEffect(() => {
    if (lastPath.current === route.path) return;
    lastPath.current = route.path;
    window.scrollTo(0, 0);
    document.getElementById("main")?.focus({ preventScroll: true });
    announce(workspace.label);
  }, [route.path, workspace.label, announce]);

  return (
    <div className="app">
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          // A plain "#main" link would replace the route in the hash.
          event.preventDefault();
          focusMain();
        }}
      >
        Skip to fund workspace
      </a>
      <Header />
      <ErrorBoundary scope="workspace" resetKeys={[route.path]}>
        <Workspace />
      </ErrorBoundary>
      <Footer />
    </div>
  );
}

function Screens() {
  const route = useRoute();
  if (Gallery && route.path === GALLERY_PATH) {
    return (
      <Suspense fallback={<Spinner label="Loading the design gallery" />}>
        <Gallery />
      </Suspense>
    );
  }
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

export function App() {
  return (
    <ErrorBoundary scope="app">
      <LiveRegionProvider>
        <Screens />
      </LiveRegionProvider>
    </ErrorBoundary>
  );
}
