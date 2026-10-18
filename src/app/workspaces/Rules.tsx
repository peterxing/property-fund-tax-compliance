import { useMemo, useState } from "react";
import { rulesRegister, type RulesFilters } from "../../domain/portfolio/index.ts";
import { useRouteParam, useSetRouteParams } from "../router.ts";
import { PortfolioFrame } from "../shell/PortfolioFrame.tsx";
import { Button, Panel, Select, Tag, TextInput } from "../ui/index.ts";
import { CONFIDENCE_LABEL, CONFIDENCE_TONE, effectiveLabel, ruleParam } from "./rules/model.ts";
import "./calendar/calendar.css";
import "./rules/rules.css";

export default function Rules() {
  const id = useRouteParam("id");
  const setRouteParams = useSetRouteParams();
  const [filters, setFilters] = useState<RulesFilters>({});
  const [visibleCount, setVisibleCount] = useState(50);
  const register = useMemo(() => rulesRegister(filters), [filters]);
  const selected = register.lookup(id) ?? register.filteredRows[0] ?? register.rows[0];
  const visibleRules = register.filteredRows.slice(0, visibleCount);

  return (
    <PortfolioFrame workspace="Rules & sources" title="Rules & sources">
      <Panel title="Search and filters">
        <div className="portfolio-filters" aria-label="Rules filters">
          <label>
            Search
            <TextInput value={filters.search ?? ""} onValueChange={(search) => setFilters({ ...filters, search })} placeholder="Rule, summary or source" />
          </label>
          <label>
            Market
            <Select value={filters.market ?? "all"} onValueChange={(market) => setFilters({ ...filters, market: market as RulesFilters["market"] })}>
              <option value="all">All markets</option>
              <option value="AU">Australia</option>
              <option value="SG">Singapore</option>
            </Select>
          </label>
          <label>
            Domain
            <Select value={filters.domain ?? "all"} onValueChange={(domain) => setFilters({ ...filters, domain })}>
              <option value="all">All domains</option>
              {register.domains.map((domain) => (
                <option key={domain.id} value={domain.id}>
                  {domain.label}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Confidence
            <Select value={filters.confidence ?? "all"} onValueChange={(confidence) => setFilters({ ...filters, confidence: confidence as RulesFilters["confidence"] })}>
              <option value="all">All grades</option>
              {register.confidences.map((confidence) => (
                <option key={confidence} value={confidence}>
                  {CONFIDENCE_LABEL[confidence]}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Effective on
            <TextInput type="date" value={filters.effectiveOn ?? ""} onValueChange={(effectiveOn) => setFilters({ ...filters, effectiveOn })} />
          </label>
        </div>
      </Panel>
      <div className="rules-layout">
        <Panel title={`${register.filteredRows.length} rules`} level={3}>
          <ul className="rules-list">
            {visibleRules.map((row) => (
              <li key={row.registryKey}>
                <a
                  className="rules-card"
                  href={`#/rules?id=${encodeURIComponent(ruleParam(row))}`}
                  aria-current={selected?.registryKey === row.registryKey ? "true" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    setRouteParams({ id: ruleParam(row) }, { replace: false });
                  }}
                >
                  <span className="rules-card__title">{row.title}</span>
                  <span className="rules-card__id">{row.id}</span>
                  <span className="rules-card__meta">
                    {row.market} · {row.domainLabel} · {effectiveLabel(row)}
                  </span>
                  <Tag tone={CONFIDENCE_TONE[row.confidence]}>{CONFIDENCE_LABEL[row.confidence]}</Tag>
                </a>
              </li>
            ))}
          </ul>
          {visibleRules.length < register.filteredRows.length ? (
            <div className="rules-more">
              <Button size="sm" variant="secondary" onClick={() => setVisibleCount((count) => count + 50)}>
                Show more ({register.filteredRows.length - visibleRules.length})
              </Button>
            </div>
          ) : null}
        </Panel>
        <Panel title="Rule detail" level={3}>
          {selected ? (
            <article className="rules-detail">
              <header>
                <h3>{selected.title}</h3>
                <p className="rules-detail__meta">
                  {selected.market} · {selected.domainLabel} · {selected.id} · {effectiveLabel(selected)}
                </p>
                <Tag tone={CONFIDENCE_TONE[selected.confidence]}>{CONFIDENCE_LABEL[selected.confidence]}</Tag>
              </header>
              <p>{selected.summary}</p>
              {selected.notes ? <p className="rules-detail__meta">{selected.notes}</p> : null}
              <section aria-labelledby="rule-sources-title">
                <h4 id="rule-sources-title">Sources</h4>
                <ol className="rules-sources">
                  {selected.sources.map((source) => (
                    <li key={`${source.title}|${source.url}`} className="rules-source">
                      {source.publisher ? `${source.publisher}: ` : ""}
                      <a href={source.url}>{source.title}</a> · retrieved {source.retrieved}
                      <br />
                      <span>{source.url}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </article>
          ) : (
            <p className="access-note">No rules match the selected filters.</p>
          )}
        </Panel>
      </div>
      <Panel title="Confidence grades and caveat">
        <ul className="rules-confidence">
          <li>
            <strong>VERIFIED</strong> — read from a primary source on the retrieved date.
          </li>
          <li>
            <strong>VERIFIED_SECONDARY</strong> — corroborated by a reputable secondary source only.
          </li>
          <li>
            <strong>ASSUMPTION</strong> — modelling assumption or simplification for tax-professional review.
          </li>
        </ul>
        <p className="access-note">{register.caveat}</p>
      </Panel>
    </PortfolioFrame>
  );
}
