import { ROLE_LABEL, can, lodgmentRole } from "../../../domain/index.ts";
import type { AuFund, AuInvestorView, ISODate } from "../../../domain/types.ts";
import { useCtx, useWorkflow } from "../../state.tsx";
import { Icon, Panel, Tag, cls } from "../../ui/index.ts";
import { Lodgment } from "./Lodgment.tsx";
import { LODGMENT_GOVERNANCE, aiirCard, lodgmentSection } from "./model.ts";
import "./investor-reporting.css";

export interface AiirPanelProps {
  fund: AuFund;
  aiir: AuInvestorView["aiir"];
  today: ISODate;
}

/** The annual investment income report: what still has to happen before it can go to the ATO, when it is due, and the lodgment record. */
export function AiirPanel({ fund, aiir, today }: AiirPanelProps) {
  const { user } = useCtx();
  const workflow = useWorkflow(fund.id);
  const card = aiirCard(aiir, fund.status);
  const section = lodgmentSection({
    lodgment: aiir.lodgment,
    status: fund.status,
    mayLodge: can(user, "lodge", fund, fund.governance),
    canLodge: workflow.can.lodge,
    ready: aiir.ready,
    lodgerRole: ROLE_LABEL[lodgmentRole(fund.governance)],
    governance: LODGMENT_GOVERNANCE[fund.governance],
  });

  return (
    <Panel
      title="Annual investment income report"
      actions={
        <>
          <span className="sr-only">Status: </span>
          <Tag tone={card.chip.tone}>{card.chip.text}</Tag>
        </>
      }
    >
      <ul className="ir-items" aria-label="What has to be done before the report is lodged">
        {card.items.map((item) => (
          <li key={item.id} className={cls("ir-item", item.done && "ir-item--done")}>
            <Icon name={item.done ? "circle-check" : "circle"} size={16} className="ir-item__icon" />
            <span className="ir-item__text">
              <strong>{item.label}</strong>
              <span className="ir-item__detail">{item.detail}</span>
            </span>
            <Tag tone={item.done ? "good" : "warn"}>{item.state}</Tag>
          </li>
        ))}
      </ul>
      <dl className="ir-dues">
        <div>
          <dt>AIIR due</dt> <dd>{card.aiirDue}</dd>
        </div>
        <div>
          <dt>Withholding report due</dt> <dd>{card.withholdingReportDue}</dd>
        </div>
      </dl>
      <p className="ir-note">{card.note}</p>
      <Lodgment fund={fund} section={section} today={today} />
    </Panel>
  );
}
