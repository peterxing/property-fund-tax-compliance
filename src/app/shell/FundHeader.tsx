import { useId, useRef, type Ref } from "react";
import type { ActionId, Fund, WorkflowStatus } from "../../domain/types.ts";
import { integer } from "../../domain/format.ts";
import {
  WORKFLOW_ICON,
  approvalChain,
  dueFact,
  queryLabel,
  regimeLine,
  workflowAction,
  workflowDoneMessage,
  type ChainStep,
  type Fact,
} from "../labels.ts";
import { buildHash } from "../router.ts";
import { useAnnounce } from "../ui/LiveRegion.tsx";
import { useDispatch, useFundCalc, useWorkflow } from "../state.tsx";
import { MarketBadge, StatusChip } from "../ui/Badge.tsx";
import { Button } from "../ui/Button.tsx";
import { cls } from "../ui/cls.ts";
import { Icon } from "../ui/icons.tsx";

export interface WorkflowButton {
  action: ActionId;
  label: string;
  enabled: boolean;
  /** Why a disabled button is unavailable; shown under the button. */
  reason?: string;
}

export interface FundHeaderViewProps {
  fund: Pick<Fund, "id" | "name" | "market" | "regime" | "sector" | "listed" | "periodLabel" | "unitsOnIssue">;
  status: WorkflowStatus;
  /** AMMA due / Form UT fact (null until the calculation is available). */
  due: Fact | null;
  /** "Tax agent reviews and lodges" (shown uppercase). */
  governanceLabel: string;
  chain: readonly ChainStep[];
  openQueries: number;
  actions: readonly WorkflowButton[];
  onAction?(action: ActionId): void;
  headingRef?: Ref<HTMLHeadingElement>;
}

/** The block that heads every fund workspace. Props only, so the gallery can render it from fixtures. */
export function FundHeaderView({ fund, status, due, governanceLabel, chain, openQueries, actions, onAction, headingRef }: FundHeaderViewProps) {
  const uid = useId();
  const facts: Fact[] = [
    { label: "Regime", value: regimeLine(fund) },
    { label: "Period", value: fund.periodLabel },
    { label: "Units on issue", value: integer(fund.unitsOnIssue) },
  ];
  if (due) facts.push(due);
  return (
    <header className="fund-header">
      <div className="fund-header__top">
        <div className="fund-header__head">
          <div className="fund-header__badges">
            <MarketBadge market={fund.market} />
            <StatusChip status={status} labelled />
          </div>
          <h2 ref={headingRef} tabIndex={-1} className="fund-header__name">
            {fund.name}
          </h2>
        </div>
        {actions.length > 0 ? (
          <div className="fund-actions" role="group" aria-label="Workflow actions">
            {actions.map((item) => {
              const reasonId = !item.enabled && item.reason ? `${uid}-${item.action}-reason` : undefined;
              const icon = WORKFLOW_ICON[item.action];
              return (
                <div key={item.action} className="fund-action">
                  <Button
                    variant={item.action === "submit" || item.action === "sign-off" ? "primary" : "secondary"}
                    disabled={!item.enabled}
                    aria-describedby={reasonId}
                    icon={icon ? <Icon name={icon} /> : undefined}
                    onClick={() => onAction?.(item.action)}
                  >
                    {item.label}
                  </Button>
                  {reasonId ? (
                    <p id={reasonId} className="fund-action__reason">
                      {item.reason}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      <dl className="fund-facts">
        {facts.map((fact) => (
          <div key={fact.label} className="fund-fact">
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
      <div className="fund-chain">
        <p className="fund-chain__label">{governanceLabel}</p>
        <ul role="list" className="fund-chain__steps" aria-label="Approvals">
          {chain.map((step) => (
            <li key={step.key} className={cls("fund-chain__step", step.done && "fund-chain__step--done")}>
              <Icon name={step.done ? "circle-check" : "circle"} size={16} />
              <strong>{step.label}</strong>{" "}
              <span>
                {step.state}
                {step.detail ? ` ${step.detail}` : ""}
              </span>
            </li>
          ))}
          {openQueries > 0 ? (
            <li className="fund-chain__queries">
              <a href={buildHash({ path: "/", params: { fund: fund.id, tab: "queries" } })}>{queryLabel(openQueries)}</a>
            </li>
          ) : null}
        </ul>
      </div>
    </header>
  );
}

/** FundHeaderView bound to the store: facts from the fund and its calculation, buttons from the workflow view, actions dispatched as the current user. */
export function FundHeader({ fund }: { fund: Fund }) {
  const calc = useFundCalc(fund.id);
  const workflow = useWorkflow(fund.id);
  const dispatch = useDispatch();
  const announce = useAnnounce();
  const headingRef = useRef<HTMLHeadingElement>(null);

  const onAction = (actionId: ActionId): void => {
    const action = workflowAction(actionId, fund.id);
    if (!action) return;
    const result = dispatch(action);
    if (!result.ok) return;
    announce(workflowDoneMessage(actionId, fund.name));
    // The button that was pressed may disappear or change; if focus fell back to the page, put it on the fund heading.
    window.setTimeout(() => {
      const active = document.activeElement;
      if (!active || active === document.body || !active.isConnected) headingRef.current?.focus();
    }, 0);
  };

  return (
    <FundHeaderView
      fund={fund}
      status={workflow.status}
      due={dueFact(fund, calc)}
      governanceLabel={workflow.governance.label}
      chain={approvalChain(workflow)}
      openQueries={workflow.openQueries}
      actions={workflow.available}
      onAction={onAction}
      headingRef={headingRef}
    />
  );
}
