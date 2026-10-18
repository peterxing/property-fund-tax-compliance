import { useEffect, useMemo, useState } from "react";
import { dateLabel } from "../../domain/format.ts";
import { downloadCsv } from "../exports/index.ts";
import { useRouteParam, useSetRouteParams } from "../router.ts";
import { PortfolioFrame } from "../shell/PortfolioFrame.tsx";
import { useUi } from "../state.tsx";
import { Banner, Checkbox, DownloadButton, Field, Kpi, KpiStrip, MoneyInput, NumberInput, Panel, Select, TableScroll, TextInput, buttonClass } from "../ui/index.ts";
import {
  CALCULATORS,
  calculatorById,
  calculatorCsv,
  calculatorHash,
  defaultValues,
  rulesForResult,
  type CalculatorDefinition,
  type CalculatorField,
  type CalculatorMarket,
  type CalculatorValues,
  type FieldValue,
} from "./calculators/model.ts";
import "./calculators/calculators.css";

function marketLabel(market: CalculatorMarket): string {
  return market === "AU" ? "Australia" : "Singapore";
}

function setValue(values: CalculatorValues, key: string, value: FieldValue): CalculatorValues {
  return { ...values, [key]: value };
}

function fieldValue(values: CalculatorValues, field: CalculatorField): FieldValue {
  return values[field.key] ?? field.defaultValue;
}

function CalculatorCards({
  calculators,
  selected,
  onSelect,
}: {
  calculators: readonly CalculatorDefinition[];
  selected: string;
  onSelect(definition: CalculatorDefinition): void;
}) {
  return (
    <div className="calc-list" aria-label="Available calculators">
      {calculators.map((calculator) => (
        <button
          type="button"
          key={calculator.id}
          className="calc-card"
          aria-current={calculator.id === selected ? "page" : undefined}
          onClick={() => onSelect(calculator)}
        >
          <span className="calc-card__market">{marketLabel(calculator.market)}</span>
          <span className="calc-card__name">{calculator.name}</span>
          <span className="calc-card__purpose">{calculator.purpose}</span>
        </button>
      ))}
    </div>
  );
}

function CalculatorFieldControl({
  field,
  values,
  onChange,
}: {
  field: CalculatorField;
  values: CalculatorValues;
  onChange(values: CalculatorValues): void;
}) {
  const value = fieldValue(values, field);
  const commit = (next: FieldValue | null) => onChange(setValue(values, field.key, next ?? field.defaultValue));
  if (field.kind === "checkbox") {
    return (
      <div className="field">
        <Checkbox checked={value === true} label={field.label} onCheckedChange={(next) => commit(next)} />
        {field.hint ? <p className="field__hint">{field.hint}</p> : null}
      </div>
    );
  }
  return (
    <Field label={field.label} hint={field.hint}>
      {field.kind === "money" ? (
        <MoneyInput
          value={Number(value)}
          currency={field.currency ?? "AUD"}
          min={field.min}
          max={field.max}
          commitOn="change"
          onCommit={(next) => commit(next)}
        />
      ) : field.kind === "number" ? (
        <NumberInput
          value={Number(value)}
          min={field.min}
          max={field.max}
          integer={field.step === 1}
          decimals={field.step === 1 ? 0 : 2}
          suffix={field.label.includes("(%)") ? "%" : undefined}
          commitOn="change"
          onCommit={(next) => commit(next)}
        />
      ) : field.kind === "select" ? (
        <Select value={String(value)} options={field.options} onValueChange={(next) => commit(next)} />
      ) : (
        <TextInput type={field.kind === "date" ? "date" : "text"} value={String(value)} onValueChange={(next) => commit(next)} />
      )}
    </Field>
  );
}

function ResultPanel({ definition, values }: { definition: CalculatorDefinition; values: CalculatorValues }) {
  const result = useMemo(() => definition.compute(values), [definition, values]);
  if (!result.ok) {
    return (
      <Panel title="Result">
        <Banner tone="warn" title="Inputs need review">
          {result.message}
        </Banner>
      </Panel>
    );
  }
  return (
    <Panel
      title="Result"
      actions={<DownloadButton label="Download CSV" onDownload={() => downloadCsv(calculatorCsv(definition, result))} />}
    >
      <p className="calc-summary">{result.summary}</p>
      <KpiStrip label={`${definition.name} summary`}>
        <Kpi label={result.headlineLabel} value={result.headlineValue} sub={definition.name} />
      </KpiStrip>
      <TableScroll label={`${definition.name} result lines`}>
        <table className="dt dt--dense">
          <thead>
            <tr>
              <th scope="col">Line</th>
              <th scope="col" className="num">Value</th>
              <th scope="col">Basis / note</th>
            </tr>
          </thead>
          <tbody>
            {result.lines.map((row) => (
              <tr key={`${row.label}-${row.value}`}>
                <th scope="row">{row.label}</th>
                <td className="num">{row.value}</td>
                <td>{row.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {result.schedule && result.schedule.length > 0 ? (
        <>
          <h3 className="calc-subtitle">Schedule</h3>
          <TableScroll label={`${definition.name} schedule`}>
            <table className="dt dt--dense">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col" className="num">Amount</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {result.schedule.map((row) => (
                  <tr key={`${row.label}-${row.value}-${row.note ?? ""}`}>
                    <th scope="row">{row.label}</th>
                    <td className="num">{row.value}</td>
                    <td>{row.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </>
      ) : null}
      {result.findings.length > 0 ? (
        <>
          <h3 className="calc-subtitle">Findings</h3>
          <ul className="calc-findings">
            {result.findings.map((finding) => (
              <li key={`${finding.id}-${finding.message}`}>
                <strong>{finding.severity}</strong> {finding.id}: {finding.message}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="calc-disclaimer">Indicative only: worked from the rules cited below; no tax adviser has reviewed them.</p>
    </Panel>
  );
}

function RulesPanel({ definition, values }: { definition: CalculatorDefinition; values: CalculatorValues }) {
  const result = useMemo(() => definition.compute(values), [definition, values]);
  const rules = rulesForResult(definition, result);
  return (
    <Panel title="Basis">
      <TableScroll label={`${definition.name} basis rules`}>
        <table className="dt dt--dense">
          <thead>
            <tr>
              <th scope="col">Rule</th>
              <th scope="col">Title</th>
              <th scope="col">Effective</th>
              <th scope="col">Primary sources</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <th scope="row">
                  <span className="dt__title">{rule.title}</span>
                  <span className="dt__sub">{rule.id}</span>
                </th>
                <td>{rule.title}</td>
                <td>{[rule.effectiveFrom, rule.effectiveTo].filter((date): date is string => Boolean(date)).map((date) => (/^\d{4}-\d{2}-\d{2}$/.test(date) ? dateLabel(date) : date)).join(" to ") || "Current"}</td>
                <td>
                  {rule.sources.map((source) => (
                    <a key={`${rule.id}-${source.url}`} href={source.url} target="_blank" rel="noopener noreferrer">
                      {source.publisher ?? source.title ?? source.url}
                    </a>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
    </Panel>
  );
}

/** Stand-alone tax calculators that call the engine directly and do not write to app state. */
export default function Calculators() {
  const routeCalc = useRouteParam("calc");
  const setRouteParams = useSetRouteParams();
  const { jurisdiction } = useUi();
  const [market, setMarket] = useState<CalculatorMarket>(jurisdiction === "SG" ? "SG" : "AU");
  const definition = calculatorById(routeCalc || (jurisdiction === "SG" ? "sg-stamp-duty" : "au-transfer-duty"));
  const [valuesByCalculator, setValuesByCalculator] = useState<Record<string, CalculatorValues>>(() => ({
    [definition.id]: defaultValues(definition),
  }));
  const [query, setQuery] = useState("");

  useEffect(() => {
    setValuesByCalculator((current) => current[definition.id] ? current : { ...current, [definition.id]: defaultValues(definition) });
    setMarket(definition.market);
  }, [definition]);

  const calculators = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return CALCULATORS.filter((calculator) => calculator.market === market)
      .filter((calculator) => !needle || `${calculator.name} ${calculator.purpose}`.toLowerCase().includes(needle));
  }, [market, query]);

  const values = valuesByCalculator[definition.id] ?? defaultValues(definition);
  const selectCalculator = (calculator: CalculatorDefinition) => {
    setRouteParams({ calc: calculator.id }, { replace: false });
  };
  const selectMarket = (next: CalculatorMarket) => {
    setMarket(next);
    if (definition.market !== next) {
      const first = CALCULATORS.find((calculator) => calculator.market === next);
      if (first) selectCalculator(first);
    }
  };

  return (
    <PortfolioFrame workspace="Calculators" title="Tax calculators">
      <Panel>
        <div className="calc-toolbar">
          <Field label="Market">
            <Select
              value={market}
              options={[{ value: "AU", label: "Australia" }, { value: "SG", label: "Singapore" }]}
              onValueChange={(next) => selectMarket(next as CalculatorMarket)}
            />
          </Field>
          <Field label="Search calculators">
            <TextInput value={query} placeholder="Search duty, GST, CGT..." onValueChange={setQuery} />
          </Field>
        </div>
        <CalculatorCards calculators={calculators} selected={definition.id} onSelect={selectCalculator} />
      </Panel>

      <Panel
        title={definition.name}
        actions={<a className={buttonClass({ variant: "secondary" })} href={calculatorHash(definition.id)}>Open deep link</a>}
      >
        <p className="calc-purpose">{definition.purpose}</p>
        <form className="calc-form" onSubmit={(event) => event.preventDefault()}>
          {definition.fields.map((field) => (
            <CalculatorFieldControl
              key={field.key}
              field={field}
              values={values}
              onChange={(next) => setValuesByCalculator((current) => ({ ...current, [definition.id]: next }))}
            />
          ))}
        </form>
      </Panel>

      <ResultPanel definition={definition} values={values} />
      <RulesPanel definition={definition} values={values} />
    </PortfolioFrame>
  );
}
