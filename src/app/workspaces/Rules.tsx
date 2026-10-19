import { useMemo, useState } from "react";
import { rulesRegister, type RulesFilters } from "../../domain/portfolio/index.ts";
import { useRouteParam, useSetRouteParams } from "../router.ts";
import { PortfolioFrame } from "../shell/PortfolioFrame.tsx";
import { useAppData, useCtx, useVisibleFunds } from "../state.tsx";
import { downloadCsv } from "../exports/index.ts";
import { Button, DownloadButton, Panel, Select, TableScroll, Tabs, Tag, TextInput } from "../ui/index.ts";
import { CONFIDENCE_LABEL, CONFIDENCE_TONE, REVIEWER_DOCS_URL, effectiveLabel, fundSettingsView, ruleParam } from "./rules/model.ts";
import "./calendar/calendar.css";
import "./rules/rules.css";

export default function Rules() {
  const id = useRouteParam("id");
  const tabParam = useRouteParam("tab");
  const activeTab = tabParam === "funds" ? "funds" : "rules";
  const setRouteParams = useSetRouteParams();
  const data = useAppData();
  const ctx = useCtx();
  const funds = useVisibleFunds();
  const [filters, setFilters] = useState<RulesFilters>({});
  const [visibleCount, setVisibleCount] = useState(50);
  const register = useMemo(() => rulesRegister(filters), [filters]);
  const selected = register.lookup(id) ?? register.filteredRows[0] ?? register.rows[0];
  const visibleRules = register.filteredRows.slice(0, visibleCount);
  const settings = useMemo(() => fundSettingsView(data, funds, ctx), [data, funds, ctx]);

  return (
    <PortfolioFrame workspace="Rules & sources" title="Rules & sources">
      <Tabs
        tabs={[
          { id: "rules", label: "Rules" },
          { id: "funds", label: "Fund settings", badge: settings.rows.length },
        ]}
        value={activeTab}
        label="Rules and sources tabs"
        onValueChange={(tab) => setRouteParams({ tab: tab === "rules" ? null : tab })}
      >
        <Tabs.Panel id="rules">
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
            <p className="access-note">
              For reviewers: each calculation is documented with its legal basis, method and rounding, rates by effective date and worked examples on these demo funds, in the{" "}
              <a href={REVIEWER_DOCS_URL} target="_blank" rel="noopener noreferrer">tax rules documentation</a> (opens GitHub).
            </p>
          </Panel>
        </Tabs.Panel>
        <Tabs.Panel id="funds">
          <Panel title="Fund settings" padded={false}>
            <div className="rules-settings__bar">
              <p className="access-note">Read-only view of the fund settings that drive calculations. Use the links in each row to change them in the owning workspace.</p>
              <DownloadButton onDownload={() => downloadCsv(settings.csv)} label="Download CSV" startedMessage="Fund settings CSV download started." />
            </div>
            <TableScroll label="Fund settings">
              <table className="dt dt--dense rules-settings">
                <caption>Settings by visible fund</caption>
                <thead>
                  <tr>
                    <th scope="col">Fund</th>
                    <th scope="col">Market</th>
                    <th scope="col">Status</th>
                    <th scope="col">Governance</th>
                    <th scope="col">Distribution or payout</th>
                    <th scope="col">Expense allocation</th>
                    <th scope="col" className="num">Unmapped accounts</th>
                    <th scope="col" className="num">Manual adjustments</th>
                    <th scope="col">Withholding</th>
                    <th scope="col">Land tax trust treatment</th>
                    <th scope="col">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.rows.map((row) => (
                    <tr key={row.fundId}>
                      <th scope="row">{row.fund}</th>
                      <td>{row.market}</td>
                      <td>{row.status}</td>
                      <td>{row.governance}</td>
                      <td>{row.distributionPolicy}</td>
                      <td>{row.expenseAllocation}</td>
                      <td className="num">{row.unmappedAccounts}</td>
                      <td className="num">{row.manualAdjustments}</td>
                      <td>{row.withholding}</td>
                      <td>{row.landTaxTrustTreatment}</td>
                      <td className="rules-settings__links">
                        <a href={row.links.distribution}>Distribution</a>
                        <a href={row.links.trialBalance}>Trial balance</a>
                        <a href={row.links.propertyTaxes}>Property taxes</a>
                        <a href={row.links.access}>Access</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </Panel>
        </Tabs.Panel>
      </Tabs>
    </PortfolioFrame>
  );
}
