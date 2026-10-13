import { APP_NAME, buildLabel } from "../labels.ts";

export const DEMO_NOTICE =
  "Demonstration only. Figures use fictional funds and the rules in the Rules tab; no tax adviser has reviewed them. Not tax advice.";

export function Footer() {
  const build = buildLabel(typeof __BUILD_INFO__ === "undefined" ? null : __BUILD_INFO__);
  return (
    <footer className="app-footer">
      <p>{DEMO_NOTICE}</p>
      <p className="app-footer__build">
        {APP_NAME}
        {build ? ` · ${build}` : ""}
      </p>
    </footer>
  );
}
