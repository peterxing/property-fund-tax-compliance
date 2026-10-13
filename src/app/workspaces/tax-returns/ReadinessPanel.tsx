import type { Fund, ISODate, ReturnView } from "../../../domain/types.ts";
import { Icon, Panel, Tag } from "../../ui/index.ts";
import { Lodgment } from "./Lodgment.tsx";
import { readinessChip, readinessItems, type LodgmentSection } from "./model.ts";
import "./tax-returns.css";

export interface ReadinessPanelProps {
  fund: Fund;
  view: ReturnView;
  section: LodgmentSection;
  today: ISODate;
}

/** The return's readiness checklist, with the lodgment record under it. */
export function ReadinessPanel({ fund, view, section, today }: ReadinessPanelProps) {
  const chip = readinessChip(view, fund.status);
  const items = readinessItems(view.items);
  return (
    <Panel
      title={view.title}
      actions={
        <>
          <span className={`tag tag--${chip.tone} ret-chip`}>
            <Icon name={chip.tone === "good" ? "circle-check" : "alert-triangle"} size={14} />
            {chip.text}
          </span>
          <span className="ret-due">{view.dueLabel}</span>
        </>
      }
    >
      <ul className="ret-items" aria-label="Readiness checks">
        {items.map((item) => (
          <li key={item.id} className={item.done ? "ret-item ret-item--done" : "ret-item"}>
            <Icon className="ret-item__icon" name={item.done ? "circle-check" : "circle"} size={16} />
            <span>
              <span className="ret-item__label">{item.label}</span>
              <span className="ret-item__detail">{item.detail}</span>
            </span>
            <Tag tone={item.done ? "good" : "warn"}>{item.state}</Tag>
          </li>
        ))}
      </ul>
      <Lodgment fund={fund} view={view} section={section} today={today} />
    </Panel>
  );
}
