import { useId, useMemo, useRef, useState, type Ref } from "react";
import type { AppData, Cents, Currency } from "../../../../domain/types.ts";
import { fundCalc, getFund } from "../../../../domain/selectors.ts";
import { useAppData, useCtx, useDispatch, useFundCalc, useWorkflow } from "../../../state.tsx";
import { Button, Field, Icon, MoneyInput, NumberInput, TableScroll, Tag, useAnnounce } from "../../../ui/index.ts";
import {
  AUTHORITY,
  NIL,
  reconModel,
  registerStatusFor,
  remittedSavedMessage,
  unitsOnIssueSavedMessage,
  unitsSavedMessage,
  withholdingTable,
  type HolderRow,
  type ReconModel,
} from "./tabModel.ts";

const COLUMNS = 8;

/** An amount of nothing is a dash on screen and "Nil" to a screen reader. */
function Amount({ text }: { text: string }) {
  if (text !== NIL) return <>{text}</>;
  return (
    <>
      <span aria-hidden="true">{NIL}</span>
      <span className="sr-only">Nil</span>
    </>
  );
}

function Components({ row }: { row: HolderRow }) {
  if (row.components.length === 0) return <p className="rv-muted">No distribution components are allocated to this holder.</p>;
  return (
    <table className="dt dt--dense rv-components">
      <caption className="sr-only">Components for {row.name}</caption>
      <thead>
        <tr>
          <th scope="col">Component</th>
          <th scope="col" className="num">
            Amount
          </th>
          <th scope="col" className="num">
            Rate
          </th>
          <th scope="col" className="num">
            Withheld
          </th>
        </tr>
      </thead>
      <tbody>
        {row.components.map((c) => (
          <tr key={c.key}>
            <th scope="row">{c.label}</th>
            <td className="num">{c.amount}</td>
            <td className="num">{c.rate}</td>
            <td className="num">
              <Amount text={c.withheld} />
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colSpan={3}>
            Total withheld
          </th>
          <td className="num">
            <Amount text={row.withheld} />
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

interface HolderRowsProps {
  row: HolderRow;
  open: boolean;
  detailId: string;
  editable: boolean;
  onToggle(holderId: string): void;
  onStatement(holderId: string): void;
  onUnits(row: HolderRow, units: number | null): void;
}

function HolderRows({ row, open, detailId, editable, onToggle, onStatement, onUnits }: HolderRowsProps) {
  return (
    <>
      <tr>
        <td className="rv-toggle-cell">
          <button
            type="button"
            className="rv-toggle"
            aria-expanded={open}
            aria-controls={open ? detailId : undefined}
            aria-label={`Components for ${row.name}`}
            onClick={() => onToggle(row.id)}
          >
            <Icon name={open ? "chevron-down" : "chevron-right"} />
          </button>
        </td>
        <th scope="row">
          <span className="dt__title">{row.name}</span>
          <span className="dt__sub">{row.country}</span>
        </th>
        <td>
          <span className="rv-status">{row.status}</span>
          <span className="dt__sub">{row.rates}</span>
        </td>
        <td className="num">
          {editable ? (
            <NumberInput
              className="rv-cell-input"
              integer
              min={0}
              value={row.units}
              aria-label={`Units held by ${row.name}`}
              onCommit={(units) => onUnits(row, units)}
            />
          ) : (
            row.unitsText
          )}
        </td>
        <td className="num">
          <Amount text={row.cash} />
        </td>
        <td className="num">
          <Amount text={row.withheld} />
        </td>
        <td className="num">
          <Amount text={row.net} />
        </td>
        <td className="rv-action">
          <Button size="sm" variant="secondary" aria-label={`Statement for ${row.name}`} onClick={() => onStatement(row.id)}>
            Statement
          </Button>
        </td>
      </tr>
      {open ? (
        <tr id={detailId} className="rv-detail">
          <td colSpan={COLUMNS}>
            <div className="rv-detail__inner">
              <Components row={row} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

interface ReconProps {
  recon: ReconModel;
  authority: string;
  editable: boolean;
  remitted: Cents | null;
  currency: Currency;
  remittedRef: Ref<HTMLInputElement>;
  onRemitted(remitted: Cents | null): void;
  onClear(): void;
}

function Reconciliation({ recon, authority, editable, remitted, currency, remittedRef, onRemitted, onClear }: ReconProps) {
  const headingId = useId();
  return (
    <section className="rv-recon" aria-labelledby={headingId}>
      <h4 id={headingId} className="rv-heading">
        Withholding reconciliation
      </h4>
      <dl className="rv-recon__list">
        <div className="rv-recon__row">
          <dt>{recon.computedLabel}</dt>
          <dd>{recon.computed}</dd>
        </div>
        <div className="rv-recon__row">
          <dt>{recon.remittedLabel}</dt>
          <dd>{recon.remitted ?? "Not yet remitted"}</dd>
        </div>
        <div className="rv-recon__row">
          <dt>Result</dt>
          <dd>
            <Tag tone={recon.tone}>{recon.headline}</Tag>
          </dd>
        </div>
      </dl>
      {editable ? (
        <div className="rv-remitted">
          <Field label="Withholding remitted" hint={`The amount paid to ${authority}. Leave it empty while nothing has been paid.`}>
            <div className="rv-remitted__control">
              <MoneyInput
                ref={remittedRef}
                className="rv-remitted__input"
                value={remitted}
                currency={currency}
                allowEmpty
                min={0}
                placeholder="Not yet remitted"
                onCommit={onRemitted}
              />
              {remitted !== null ? (
                <Button variant="ghost" size="sm" aria-label="Mark as not remitted" onClick={onClear}>
                  Not remitted
                </Button>
              ) : null}
            </div>
          </Field>
        </div>
      ) : null}
    </section>
  );
}

export interface WithholdingTabProps {
  fundId: string;
  /** Opens the Statements tab on one holder. */
  onOpenStatement(holderId: string): void;
}

export function WithholdingTab({ fundId, onOpenStatement }: WithholdingTabProps) {
  const data = useAppData();
  const { now } = useCtx();
  const calc = useFundCalc(fundId);
  const workflow = useWorkflow(fundId);
  const dispatch = useDispatch();
  const announce = useAnnounce();
  const idBase = useId();
  const remittedRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  const fund = getFund(data, fundId);
  const table = useMemo(() => withholdingTable(fund, calc), [fund, calc]);
  const recon = useMemo(() => reconModel(fund, calc), [fund, calc]);
  const editable = workflow.can.edit;

  const toggle = (holderId: string): void =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(holderId)) next.add(holderId);
      return next;
    });

  const registerAfter = (next: AppData) => registerStatusFor(getFund(next, fundId), fundCalc(next, fundId, now));

  const saveUnits = (row: HolderRow, units: number | null): void => {
    if (units === null) return;
    const result = dispatch({ type: "update-holder-units", fundId, holderId: row.id, units });
    if (result.ok) announce(unitsSavedMessage(row.name, registerAfter(result.data)));
  };

  const saveUnitsOnIssue = (units: number | null): void => {
    if (units === null) return;
    const result = dispatch({ type: "update-units-on-issue", fundId, units });
    if (result.ok) announce(unitsOnIssueSavedMessage(registerAfter(result.data)));
  };

  const saveRemitted = (remitted: Cents | null): void => {
    const result = dispatch({ type: "update-remitted", fundId, remitted });
    if (!result.ok) return;
    const after = reconModel(getFund(result.data, fundId), fundCalc(result.data, fundId, now));
    announce(remittedSavedMessage(after.headline));
  };

  const clearRemitted = (): void => {
    saveRemitted(null);
    remittedRef.current?.focus();
  };

  return (
    <div className="rv-stack">
      {editable ? (
        <p className="rv-note">Edit the units held, the units on issue and the amount remitted here. Changes save when you press Enter or leave the box; Esc cancels.</p>
      ) : workflow.lockedReason ? (
        <p className="rv-note rv-note--lock">
          <Icon name="lock" />
          <span>{workflow.lockedReason}</span>
        </p>
      ) : null}

      <TableScroll label="Withholding by unitholder" className="rv-table-scroll">
        <table className="dt dt--dense rv-withholding">
          <caption className="sr-only">Withholding by unitholder</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Components</span>
              </th>
              <th scope="col">Holder</th>
              <th scope="col">Tax status</th>
              <th scope="col" className="num">
                Units
              </th>
              <th scope="col" className="num">
                Gross cash
              </th>
              <th scope="col" className="num">
                Withheld
              </th>
              <th scope="col" className="num">
                Net cash
              </th>
              <th scope="col">
                <span className="sr-only">Statement</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <HolderRows
                key={row.id}
                row={row}
                open={expanded.has(row.id)}
                detailId={`${idBase}-components-${row.id}`}
                editable={editable}
                onToggle={toggle}
                onStatement={onOpenStatement}
                onUnits={saveUnits}
              />
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3}>
                Register total
              </th>
              <td className="num">{table.totals.units}</td>
              <td className="num">
                <Amount text={table.totals.cash} />
              </td>
              <td className="num">
                <Amount text={table.totals.withheld} />
              </td>
              <td className="num">
                <Amount text={table.totals.net} />
              </td>
              <td />
            </tr>
            <tr>
              <th scope="row" colSpan={3}>
                Units on issue
              </th>
              <td className="num">
                {editable ? (
                  <NumberInput className="rv-cell-input" integer min={1} value={table.unitsOnIssue} aria-label="Units on issue" onCommit={saveUnitsOnIssue} />
                ) : (
                  table.unitsOnIssueText
                )}
              </td>
              <td colSpan={4}>
                <span className={table.register.balanced ? "rv-register" : "rv-register rv-register--warn"}>
                  <Icon name={table.register.balanced ? "circle-check" : "alert-triangle"} />
                  <span>{table.register.text}</span>
                </span>
              </td>
            </tr>
          </tfoot>
        </table>
      </TableScroll>

      <Reconciliation
        recon={recon}
        authority={AUTHORITY[fund.market]}
        editable={editable}
        remitted={fund.whtRemitted}
        currency={fund.currency}
        remittedRef={remittedRef}
        onRemitted={saveRemitted}
        onClear={clearRemitted}
      />
    </div>
  );
}
