import "@fontsource-variable/geist/index.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./shell/shell.css";
import "./doc/doc.css";
import "./charts/charts.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

const container = document.getElementById("root");
if (!container) throw new Error("The page has no #root element to mount the app in.");
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
