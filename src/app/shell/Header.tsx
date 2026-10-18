import { useId, useRef, useState } from "react";
import type { FundId, JurisdictionFilter, User } from "../../domain/types.ts";
import { APP_NAME, JURISDICTION_OPTIONS, WORKSPACE_ICON, personaLabel } from "../labels.ts";
import { ROUTES, buildHash, useRoute, type RouteDef, type RoutePath } from "../router.ts";
import { useUi } from "../state.tsx";
import { Icon } from "../ui/icons.tsx";
import { Segmented } from "../ui/Segmented.tsx";
import { Select } from "../ui/Select.tsx";
import { useJurisdictionControl, usePersonaControl } from "./useShellControls.ts";

/** Where a nav link goes: fund workspaces carry the selected fund, portfolio workspaces do not. */
export function navHref(def: Pick<RouteDef, "path" | "scope">, fundId: FundId | null): string {
  return buildHash({ path: def.path, params: def.scope === "fund" && fundId ? { fund: fundId } : {} });
}

export interface JurisdictionToggleProps {
  value: JurisdictionFilter;
  onChange(filter: JurisdictionFilter): void;
}

/** All / Australia / Singapore: filters the fund rail and every portfolio view. */
export function JurisdictionToggle({ value, onChange }: JurisdictionToggleProps) {
  return <Segmented legend="Jurisdiction" options={JURISDICTION_OPTIONS} value={value} onChange={onChange} />;
}

const NAV_GROUPS = [
  { key: "fund", label: "Fund", routes: ROUTES.filter((route) => route.scope === "fund") },
  { key: "portfolio", label: "Portfolio", routes: ROUTES.filter((route) => route.scope === "portfolio") },
] as const;

export interface HeaderViewProps {
  routePath: RoutePath;
  /** Selected fund, appended to the fund-workspace links. */
  fundId: FundId | null;
  users: ReadonlyArray<Pick<User, "id" | "name" | "title">>;
  userId: string;
  jurisdiction: JurisdictionFilter;
  onUserChange(userId: string): void;
  onJurisdictionChange(filter: JurisdictionFilter): void;
  /** Dev gallery only: starts the compact workspace menu open. */
  defaultNavOpen?: boolean;
}

/** The app header: title, workspace navigation, persona switcher and jurisdiction filter. Props only, so the gallery can render it from fixtures. */
export function HeaderView({ routePath, fundId, users, userId, jurisdiction, onUserChange, onJurisdictionChange, defaultNavOpen = false }: HeaderViewProps) {
  const selectId = useId();
  const navId = useId();
  const navButtonRef = useRef<HTMLButtonElement>(null);
  const [navOpen, setNavOpen] = useState(defaultNavOpen);

  const closeNav = (returnFocus = false): void => {
    setNavOpen(false);
    if (returnFocus) navButtonRef.current?.focus();
  };

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <h1 className="app-title">{APP_NAME}</h1>
        <nav
          className={navOpen ? "app-nav app-nav--open" : "app-nav"}
          aria-label="Workspaces"
          onKeyDown={(event) => {
            if (event.key === "Escape" && navOpen) closeNav(true);
          }}
        >
          <button
            ref={navButtonRef}
            type="button"
            className="app-nav__toggle"
            aria-expanded={navOpen}
            aria-controls={navId}
            onClick={() => setNavOpen((value) => !value)}
          >
            <span>Workspaces</span>
            <Icon name="chevron-down" />
          </button>
          <div id={navId} className="app-nav__panel">
            {NAV_GROUPS.map((group) => {
              const active = group.routes.some((def) => def.path === routePath);
              return (
                <div key={group.key} className={active ? "app-nav__group app-nav__group--active" : "app-nav__group"}>
                  <p className="app-nav__group-label">{group.label}</p>
                  <ul role="list" className="app-nav__list">
                    {group.routes.map((def) => (
                      <li key={def.path}>
                        <a
                          className="app-nav__link"
                          href={navHref(def, fundId)}
                          aria-current={routePath === def.path ? "page" : undefined}
                          onClick={() => closeNav(false)}
                        >
                          <Icon name={WORKSPACE_ICON[def.id]} />
                          <span>{def.label}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </nav>
        <div className="app-controls">
          <div className="app-control">
            <label htmlFor={selectId} className="app-control__label">
              Working as
            </label>
            <Select
              id={selectId}
              wrapperClassName="app-control__select"
              value={userId}
              options={users.map((user) => ({ value: user.id, label: personaLabel(user) }))}
              onValueChange={onUserChange}
            />
          </div>
          <JurisdictionToggle value={jurisdiction} onChange={onJurisdictionChange} />
        </div>
      </div>
    </header>
  );
}

/** HeaderView bound to the router and the store; announces what changed when the persona or jurisdiction switches. */
export function Header() {
  const route = useRoute();
  const { selectedFundId } = useUi();
  const persona = usePersonaControl();
  const jurisdiction = useJurisdictionControl();
  return (
    <HeaderView
      routePath={route.path}
      fundId={selectedFundId}
      users={persona.users}
      userId={persona.userId}
      jurisdiction={jurisdiction.value}
      onUserChange={persona.onChange}
      onJurisdictionChange={jurisdiction.onChange}
    />
  );
}
