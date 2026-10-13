import { createContext, useCallback, useContext, useId, useMemo, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cls } from "./cls.ts";

export interface TabDef {
  id: string;
  label: ReactNode;
  /** Small count or note shown after the label ("2"). Include it in `label` as text if screen readers need it. */
  badge?: ReactNode;
}

interface TabsContextValue {
  value: string;
  baseId: string;
}
const TabsContext = createContext<TabsContextValue | null>(null);

interface TabsBaseProps {
  tabs: readonly TabDef[];
  value: string;
  /** Accessible name of the tab list. */
  label: string;
  /** Contents: <Tabs.Panel id="...">. Only the active panel is rendered. */
  children?: ReactNode;
  className?: string;
}

/** Controlled: pass the change handler as `onValueChange` or, equivalently, `onChange`. */
export type TabsProps = TabsBaseProps &
  ({ onValueChange(id: string): void; onChange?: undefined } | { onChange(id: string): void; onValueChange?: undefined });

/**
 * Tabs with automatic activation: Left/Right (wrapping), Home and End move focus and select; only the selected tab is in the tab order.
 * The tab list is rendered from `tabs`; <Tabs.Panel id> renders its children only while its tab is selected.
 */
export function Tabs({ tabs, value, onValueChange: onValueChangeProp, onChange, label, children, className }: TabsProps) {
  const baseId = useId();
  const onValueChange = (onValueChangeProp ?? onChange) as (id: string) => void;
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const context = useMemo(() => ({ value, baseId }), [value, baseId]);

  const move = useCallback(
    (index: number) => {
      const target = tabs[(index + tabs.length) % tabs.length];
      if (!target) return;
      onValueChange(target.id);
      buttons.current.get(target.id)?.focus();
    },
    [tabs, onValueChange],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = tabs.findIndex((t) => t.id === value);
    switch (event.key) {
      case "ArrowRight":
        move(current + 1);
        break;
      case "ArrowLeft":
        move(current - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(tabs.length - 1);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <div className={cls("tabs", className)}>
      <div className="tabs__list" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((tab) => {
          const selected = tab.id === value;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                if (el) buttons.current.set(tab.id, el);
                else buttons.current.delete(tab.id);
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              className="tabs__tab"
              aria-selected={selected}
              aria-controls={selected ? `${baseId}-panel-${tab.id}` : undefined}
              tabIndex={selected ? 0 : -1}
              onClick={() => onValueChange(tab.id)}
            >
              {tab.label}
              {tab.badge !== undefined && tab.badge !== null ? <span className="tabs__badge">{tab.badge}</span> : null}
            </button>
          );
        })}
      </div>
      <TabsContext.Provider value={context}>{children}</TabsContext.Provider>
    </div>
  );
}

export interface TabPanelProps {
  id: string;
  children: ReactNode;
  className?: string;
}

function TabPanel({ id, children, className }: TabPanelProps) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("<Tabs.Panel> must be inside <Tabs>.");
  if (ctx.value !== id) return null;
  return (
    <div role="tabpanel" id={`${ctx.baseId}-panel-${id}`} aria-labelledby={`${ctx.baseId}-tab-${id}`} tabIndex={0} className={cls("tabs__panel", className)}>
      {children}
    </div>
  );
}

Tabs.Panel = TabPanel;
