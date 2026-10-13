import { memo, useCallback, useMemo, useRef, useState } from "react";
import { UNMAPPED_CATEGORY } from "../../../domain/types.ts";
import type { Currency, Fund, TbRowView, TbView } from "../../../domain/types.ts";
import { integer } from "../../../domain/format.ts";
import { useDispatch } from "../../state.tsx";
import { Button, EmptyState, Field, Icon, NumberInput, Panel, Select, TableScroll, cls, useAnnounce } from "../../ui/index.ts";
import {
  DEFAULT_THRESHOLD,
  SORT_OPTIONS,
  categoryOptions,
  changeFlag,
  changePctText,
  flagLabel,
  moneyExact,
  selectedCategory,
  sortRows,
  tbTotals,
  unmappedCount,
  type CategoryOption,
  type SortMode,
} from "./model.ts";
import "./trial-balance.css";

export interface MappingPanelProps {
  fund: Fund;
  view: TbView;
  canEdit: boolean;
}

/** Every account with the tax category it is mapped to (changeable while the fund is being prepared), this year against last, and the movements worth a second look. */
export function MappingPanel({ fund, view, canEdit }: MappingPanelProps) {
  const dispatch = useDispatch();
  const announce = useAnnounce();
  const [sort, setSort] = useState<SortMode>("account");
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);

  const options = useMemo(() => categoryOptions(view.categories), [view.categories]);
  const rows = useMemo(() => sortRows(view.rows, sort), [view.rows, sort]);
  const totals = useMemo(() => tbTotals(view.rows), [view.rows]);
  const unmapped = useMemo(() => unmappedCount(view), [view]);
  const tableRef = useRef<HTMLDivElement>(null);

  const fundId = fund.id;
  const changeCategory = useCallback(
    (row: TbRowView, category: string): void => {
      const result = dispatch({ type: "update-tb-category", fundId, rowId: row.id, category });
      if (result.ok) announce(`${row.account} ${row.name}: tax category set to ${options.find((o) => o.value === category)?.label ?? category}.`);
    },
    [dispatch, announce, fundId, options],
  );

  // The table scrolls in its own box, so an account that needs a category can be out of sight: take the user to it.
  const showUnmapped = (): void => {
    const row = tableRef.current?.querySelector<HTMLElement>("tr.tb-row--unmapped");
    if (!row) return;
    const select = row.querySelector<HTMLSelectElement>("select");
    if (select) select.focus();
    else row.scrollIntoView({ block: "nearest" });
  };

  return (
    <Panel title="Accounts and tax mapping" padded={false} actions={`${integer(view.rows.length)} ${view.rows.length === 1 ? "account" : "accounts"}`}>
      <div className="tb-toolbar">
        <Field label="Sort">
          <Select value={sort} options={SORT_OPTIONS} onValueChange={(value) => setSort(value === "change" ? "change" : "account")} />
        </Field>
        <Field label="Highlight changes over (%)">
          <NumberInput value={threshold} min={0} max={1000} decimals={1} suffix="%" onCommit={(value) => (value === null ? undefined : setThreshold(value))} />
        </Field>
        {unmapped > 0 ? (
          <Button className="tb-toolbar__jump" variant="ghost" size="sm" icon={<Icon name="alert-triangle" size={14} />} onClick={showUnmapped}>
            {unmapped === 1 ? "Go to the account that needs a tax category" : "Go to the first account that needs a tax category"}
          </Button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <div className="tb-empty">
          <EmptyState title="No accounts yet" icon="table">
            Import a trial balance to see its accounts and map them to tax categories.
          </EmptyState>
        </div>
      ) : (
        <div ref={tableRef}>
          <TableScroll label="Accounts and tax mapping" className="tb-map-scroll">
            <table className="dt dt--dense dt--hover tb-table tb-map">
              <caption className="sr-only">Accounts and tax mapping, with this period&rsquo;s balances against the prior period&rsquo;s</caption>
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Tax category</th>
                  <th scope="col" className="num">
                    Current
                  </th>
                  <th scope="col" className="num">
                    Prior
                  </th>
                  <th scope="col" className="num">
                    Change
                  </th>
                  <th scope="col" className="num">
                    Change %
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <MappingRow key={row.id} row={row} options={options} currency={fund.currency} threshold={threshold} canEdit={canEdit} onCategory={changeCategory} />
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={2}>
                    Total (debits less credits)
                  </th>
                  <td className="num">{moneyExact(totals.current, fund.currency)}</td>
                  <td className="num">{moneyExact(totals.prior, fund.currency)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </TableScroll>
        </div>
      )}
      <p className="tb-note">Debits are positive and credits negative.</p>
    </Panel>
  );
}

interface MappingRowProps {
  row: TbRowView;
  options: readonly CategoryOption[];
  currency: Currency;
  threshold: number;
  canEdit: boolean;
  onCategory(row: TbRowView, category: string): void;
}

const MappingRow = memo(function MappingRow({ row, options, currency, threshold, canEdit, onCategory }: MappingRowProps) {
  const selected = selectedCategory(row.category, options);
  const flag = changeFlag(row, threshold);
  const flagText = flagLabel(flag, threshold);
  return (
    <tr className={cls(flag !== null && "tb-row--flag", selected === UNMAPPED_CATEGORY && "tb-row--unmapped")}>
      <th scope="row" className="tb-account">
        <span className="tb-account__no">{row.account}</span>
        {row.name}
      </th>
      <td className="tb-category">
        {canEdit ? (
          <Select aria-label={`Tax category for ${row.account} ${row.name}`} value={selected} options={options} onValueChange={(value) => onCategory(row, value)} />
        ) : (
          <span className="dt__title">{options.find((o) => o.value === selected)?.label ?? row.categoryLabel}</span>
        )}
        <span className="dt__sub">{row.treatment}</span>
      </td>
      <td className="num">{moneyExact(row.current, currency)}</td>
      <td className="num">{moneyExact(row.prior, currency)}</td>
      <td className="num">{moneyExact(row.change, currency)}</td>
      <td className="num">
        <span className="tb-pct">
          <span>{changePctText(row.changePct)}</span>
          {flagText ? (
            <span className="tb-flag">
              <Icon name="alert-triangle" size={12} />
              {flagText}
            </span>
          ) : null}
        </span>
      </td>
    </tr>
  );
});
