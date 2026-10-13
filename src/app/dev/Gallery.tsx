import { useState, type ReactNode } from "react";
import { SankeyChart } from "../charts/SankeyChart.tsx";
import { StackedBars } from "../charts/StackedBars.tsx";
import { DocView } from "../doc/DocView.tsx";
import { ErrorBoundary } from "../shell/ErrorBoundary.tsx";
import { Footer } from "../shell/Footer.tsx";
import { FundHeaderView } from "../shell/FundHeader.tsx";
import { FundRailView } from "../shell/FundRail.tsx";
import { HeaderView } from "../shell/Header.tsx";
import { PlaceholderPanel } from "../shell/PlaceholderPanel.tsx";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";
import {
  Banner,
  Button,
  Checkbox,
  Dialog,
  DownloadButton,
  EmptyState,
  ExceptionChip,
  Field,
  ICON_NAMES,
  Icon,
  Kpi,
  KpiStrip,
  MarketBadge,
  MoneyInput,
  NumberInput,
  Panel,
  Segmented,
  Select,
  Spinner,
  StatusChip,
  TableScroll,
  Tabs,
  Tag,
  TextArea,
  TextInput,
  useAnnounce,
  useNotify,
} from "../ui/index.ts";
import type { JurisdictionFilter } from "../../domain/types.ts";
import { money } from "../../domain/format.ts";
import { JURISDICTION_OPTIONS } from "../labels.ts";
import { GALLERY_CSS } from "./galleryStyles.ts";
import * as fx from "./fixtures.ts";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="gallery__section" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className="gallery__h2">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Sample({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "gallery__sample gallery__sample--wide" : "gallery__sample"}>
      <h3 className="gallery__h3">{title}</h3>
      {children}
    </div>
  );
}

const SWATCHES = [
  "--background",
  "--card",
  "--foreground",
  "--muted-foreground",
  "--primary",
  "--accent",
  "--accent-foreground",
  "--border",
  "--control-border",
  "--danger",
  "--market-au",
  "--market-sg",
  "--status-review",
  "--viz-gross",
  "--viz-net",
  "--viz-withheld",
  "--viz-unallocated",
  "--viz-node",
] as const;

function Tokens() {
  return (
    <Section id="tokens" title="Colour and type">
      <div className="gallery__swatches">
        {SWATCHES.map((name) => (
          <div key={name} className="gallery__swatch">
            <span className="gallery__chip" style={{ background: `var(${name})` }} />
            <code>{name}</code>
          </div>
        ))}
      </div>
      <div className="gallery__type">
        <p style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>Harbourline Office Trust (28/600)</p>
        <p style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Review and sign off in bulk (20/600)</p>
        <p style={{ margin: 0 }}>Body copy at 16px: the quick brown fox jumps over the lazy dog.</p>
        <p className="label-caps" style={{ margin: 0 }}>
          Label caps 11px
        </p>
        <p className="muted" style={{ margin: 0 }}>
          Muted text: secondary information.
        </p>
        <p className="tnum" style={{ margin: 0 }}>
          Tabular digits: 1111 0000 8888 · A$1,234,567.89 · A$7,654,321.00
        </p>
        <p style={{ margin: 0, fontVariantNumeric: "normal" }}>Proportional digits: 1111 0000 8888 · A$1,234,567.89 · A$7,654,321.00</p>
        <p style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: 0 }}>
          {ICON_NAMES.map((name) => (
            <span key={name} title={name} style={{ display: "inline-flex" }}>
              <Icon name={name} size={20} />
            </span>
          ))}
        </p>
      </div>
    </Section>
  );
}

function Buttons() {
  const [loading, setLoading] = useState(false);
  return (
    <Section id="buttons" title="Buttons">
      <div className="gallery__row">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="primary" icon={<Icon name="send" />}>
          With icon
        </Button>
        <Button variant="secondary" size="sm">
          Small
        </Button>
      </div>
      <div className="gallery__row">
        <Button variant="primary" disabled>
          Primary disabled
        </Button>
        <Button variant="secondary" disabled>
          Secondary disabled
        </Button>
        <Button
          variant="primary"
          loading={loading}
          onClick={() => {
            setLoading(true);
            window.setTimeout(() => setLoading(false), 1500);
          }}
        >
          {loading ? "Saving" : "Click to load"}
        </Button>
        <Spinner label="Loading" />
      </div>
      <div className="gallery__row">
        <DownloadButton onDownload={() => new Promise((resolve) => window.setTimeout(resolve, 900))}>Download PDF</DownloadButton>
        <DownloadButton
          onDownload={() => new Promise((_, reject) => window.setTimeout(() => reject(new Error("The file could not be built.")), 600))}
        >
          Download that fails
        </DownloadButton>
      </div>
    </Section>
  );
}

function Chips() {
  return (
    <Section id="chips" title="Badges, chips and tags">
      <div className="gallery__row">
        <MarketBadge market="AU" />
        <MarketBadge market="SG" />
        <StatusChip status="Preparing" />
        <StatusChip status="In review" />
        <StatusChip status="Signed off" />
        <ExceptionChip count={1} />
        <ExceptionChip count={3} />
        <ExceptionChip count={0} />
      </div>
      <div className="gallery__row">
        <Tag>Neutral</Tag>
        <Tag tone="good">Reconciled</Tag>
        <Tag tone="warn">Under-remitted</Tag>
        <Tag tone="bad">Overdue</Tag>
        <Tag tone="info">Info</Tag>
      </div>
    </Section>
  );
}

function Banners() {
  return (
    <Section id="banners" title="Banners">
      <div className="gallery__stack">
        <Banner tone="info" title="In review">
          This fund is locked. Return it to the preparer to edit.
        </Banner>
        <Banner tone="warn" title="2 open exceptions" actions={<Button size="sm">Show checks</Button>}>
          Resolve the exceptions before submitting.
        </Banner>
        <Banner tone="error" title="Could not save">
          The trial balance does not agree with the distribution.
        </Banner>
        <Banner tone="success">Signed off by A. Moreno on 4 Sep 2026.</Banner>
      </div>
    </Section>
  );
}

function Surfaces() {
  const [tab, setTab] = useState("withholding");
  return (
    <Section id="surfaces" title="KPIs, panels, empty states and tabs">
      <KpiStrip label="Distribution summary">
        <Kpi label="Cash distribution" value="A$92,446,000" sub="A$0.2244 per unit" />
        <Kpi label="Tax withheld" value="A$2,504,486" sub="2.7% of the distribution" tone="warn" />
        <Kpi label="Exceptions" value="2" sub="Resolve before submitting" tone="bad" />
        <Kpi label="Cost base" value="A$1,200,000" tone="good" sub="Decrease" />
      </KpiStrip>
      <div className="gallery__grid">
        <Panel title="Distribution by tax character" actions="Higher of the two views">
          <p style={{ margin: 0 }}>Panel body copy sits here, padded and on the card colour.</p>
        </Panel>
        <Panel title="In review" actions={<span className="gallery__actions"><Icon name="lock" size={14} /> In review — return to preparer to edit</span>}>
          <EmptyState title="Nothing to show yet" icon="info" action={<Button size="sm">Add the first item</Button>}>
            Empty states explain what will appear and what to do next.
          </EmptyState>
        </Panel>
      </div>
      <Tabs
        label="Review"
        value={tab}
        onValueChange={setTab}
        tabs={[
          { id: "withholding", label: "Withholding" },
          { id: "statements", label: "Statements" },
          { id: "checks", label: "Checks", badge: 2 },
          { id: "queries", label: "Queries", badge: 1 },
        ]}
      >
        <Tabs.Panel id="withholding">Withholding tab content.</Tabs.Panel>
        <Tabs.Panel id="statements">Statements tab content.</Tabs.Panel>
        <Tabs.Panel id="checks">Checks tab content.</Tabs.Panel>
        <Tabs.Panel id="queries">Queries tab content.</Tabs.Panel>
      </Tabs>
    </Section>
  );
}

function Forms() {
  const [amount, setAmount] = useState<number | null>(125_000_000);
  const [units, setUnits] = useState<number | null>(412_000_000);
  const [rate, setRate] = useState<number | null>(15);
  const [name, setName] = useState("Sakuragawa Life Assurance");
  const [persona, setPersona] = useState("a-moreno");
  const [filter, setFilter] = useState<JurisdictionFilter>("all");
  const [checked, setChecked] = useState(true);
  return (
    <Section id="forms" title="Form controls">
      <div className="gallery__grid">
        <Field label="Holder name" hint="As on the register">
          <TextInput value={name} onValueChange={setName} />
        </Field>
        <Field label="Holder name" error="Enter the holder's name" required>
          <TextInput value="" onValueChange={() => undefined} />
        </Field>
        <Field label="Cash distribution" hint="Type 1,250,000 or A$1,250,000.50">
          <MoneyInput value={amount} currency="AUD" onCommit={setAmount} />
        </Field>
        <Field label="Cash distribution (SGD, required)">
          <MoneyInput value={null} currency="SGD" onCommit={() => undefined} allowEmpty={false} />
        </Field>
        <Field label="Units on issue">
          <NumberInput value={units} onCommit={setUnits} integer min={0} />
        </Field>
        <Field label="Withholding rate">
          <NumberInput value={rate} onCommit={setRate} decimals={2} suffix="%" min={0} max={100} />
        </Field>
        <Field label="Working as">
          <Select
            value={persona}
            onValueChange={setPersona}
            options={fx.FIXTURE_USERS.map((u) => ({ value: u.id, label: `${u.name} — ${u.title}` }))}
          />
        </Field>
        <Field label="Query">
          <TextArea rows={3} defaultValue="Please confirm the NCMI split." />
        </Field>
      </div>
      <div className="gallery__row">
        <Segmented legend="Jurisdiction" options={JURISDICTION_OPTIONS} value={filter} onChange={(value) => setFilter(value)} />
        <Segmented legend="Size" size="sm" options={[{ value: "a", label: "Fund" }, { value: "b", label: "Holder" }, { value: "c", label: "Off", disabled: true }]} value="a" onChange={() => undefined} />
        <Checkbox label="Show completed" checked={checked} onCheckedChange={setChecked} />
        <Checkbox label="Indeterminate" checked={false} indeterminate onCheckedChange={() => undefined} />
        <Checkbox label="Disabled" checked={false} disabled onCheckedChange={() => undefined} />
        <span className="muted num">Committed: {amount === null ? "none" : money(amount, "AUD", 2)}</span>
      </div>
    </Section>
  );
}

function Tables() {
  return (
    <Section id="tables" title="Tables">
      <Panel title="Tax leakage" padded={false}>
        <TableScroll label="Distribution by fund">
          <table className="dt dt--hover" aria-label="Distribution by fund">
            <thead>
              <tr>
                <th scope="col">Fund</th>
                <th scope="col" className="num">
                  Distribution
                </th>
                <th scope="col" className="num">
                  Final withholding
                </th>
                <th scope="col" className="num">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {fx.FIXTURE_TABLE.map((row) => (
                <tr key={row.fund}>
                  <th scope="row">
                    <span className="dt__title">{row.fund}</span>
                    <span className="dt__sub">{row.detail}</span>
                  </th>
                  <td className="num">{row.distribution}</td>
                  <td className="num">{row.withheld}</td>
                  <td className="num">{row.leakage}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="total">
                <th scope="row">Total</th>
                <td className="num">A$269,346,000</td>
                <td className="num">A$9,139,231</td>
                <td className="num">3.4%</td>
              </tr>
            </tfoot>
          </table>
        </TableScroll>
      </Panel>
    </Section>
  );
}

function Overlays() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [value, setValue] = useState<number | null>(null);
  const [error, setError] = useState<string | undefined>();
  const notify = useNotify();
  const announce = useAnnounce();
  return (
    <Section id="overlays" title="Dialogs, toasts and announcements">
      <div className="gallery__row">
        <Button onClick={() => setOpen(true)}>Open a form dialog</Button>
        <Button variant="danger" onClick={() => setConfirm(true)}>
          Open a confirmation
        </Button>
        <Button variant="secondary" onClick={() => notify({ tone: "success", message: "Harbourline Office Trust signed off." })}>
          Success toast
        </Button>
        <Button variant="secondary" onClick={() => notify({ tone: "error", message: "Could not save: the amount is out of range." })}>
          Error toast
        </Button>
        <Button variant="ghost" onClick={() => announce("Showing Australian funds. 5 funds visible.")}>
          Announce politely
        </Button>
      </div>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Record the remitted amount"
        description="Enter what was paid to the ATO for this period."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (value === null) setError("Enter the amount remitted");
                else {
                  setError(undefined);
                  setOpen(false);
                }
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <Field label="Amount remitted" error={error} required>
          <MoneyInput value={value} currency="AUD" onCommit={setValue} data-autofocus />
        </Field>
      </Dialog>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Reset the demo data?"
        size="sm"
        role="alertdialog"
        description="This restores the original sample funds and removes your changes."
        footer={
          <>
            <Button variant="secondary" data-autofocus onClick={() => setConfirm(false)}>
              Keep my changes
            </Button>
            <Button variant="danger" onClick={() => setConfirm(false)}>
              Reset
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>You cannot undo this.</p>
      </Dialog>
    </Section>
  );
}

function ShellViews() {
  const [userId, setUserId] = useState("a-moreno");
  const [jurisdiction, setJurisdiction] = useState<JurisdictionFilter>("all");
  const [selected, setSelected] = useState("harbourline");
  return (
    <Section id="shell" title="Shell: header, fund rail, fund header, footer">
      <p className="muted" style={{ margin: 0 }}>
        Below 900px the fund rail folds into one button that shows the selected fund and opens the list; narrow the window to see it.
      </p>
      <div className="gallery__frame">
        <HeaderView
          routePath="/analytics"
          fundId={selected}
          users={fx.FIXTURE_USERS}
          userId={userId}
          jurisdiction={jurisdiction}
          onUserChange={setUserId}
          onJurisdictionChange={setJurisdiction}
        />
      </div>
      <div className="gallery__split">
        <div className="gallery__frame">
          <FundRailView groups={fx.FIXTURE_FUND_GROUPS} selectedId={selected} hrefFor={(id) => `#/_gallery?fund=${id}`} onSelect={setSelected} />
        </div>
        <div className="gallery__stack gallery__stack--divided">
          <FundHeaderView
            fund={fx.FIXTURE_AU_FUND}
            status="In review"
            due={{ label: "AMMA due", value: "30 Sep 2026" }}
            governanceLabel="Tax agent reviews and lodges"
            chain={fx.FIXTURE_CHAIN_PENDING}
            openQueries={1}
            actions={fx.FIXTURE_ACTIONS_REVIEW}
          />
          <FundHeaderView
            fund={fx.FIXTURE_SG_FUND}
            status="Preparing"
            due={{ label: "Form UT", value: "YA2027 · due 15 Apr 2027" }}
            governanceLabel="No tax agent"
            chain={[fx.FIXTURE_CHAIN_PENDING[0]!, fx.FIXTURE_CHAIN_PENDING[2]!]}
            openQueries={0}
            actions={fx.FIXTURE_ACTIONS_PREPARING}
          />
          <FundHeaderView
            fund={fx.FIXTURE_AU_FUND}
            status="Signed off"
            due={{ label: "AMMA due", value: "30 Sep 2026" }}
            governanceLabel="Tax agent reviews and lodges"
            chain={fx.FIXTURE_CHAIN_DONE}
            openQueries={0}
            actions={fx.FIXTURE_ACTIONS_SIGNED}
          />
        </div>
      </div>
      <div className="gallery__frame">
        <PlaceholderPanel workspace="Trial balance" />
      </div>
      <div className="gallery__frame">
        <Footer />
      </div>
    </Section>
  );
}

function Bomb({ armed }: { armed: boolean }) {
  if (armed) throw new Error("A sample render error from the gallery.");
  return <p style={{ margin: 0 }}>This section renders normally.</p>;
}

const SANKEY_WIDTHS = [360, 480, 620, 700, 900, 1100] as const;

function Charts() {
  const [armed, setArmed] = useState(false);
  const [token, setToken] = useState(0);
  return (
    <Section id="charts" title="Charts">
      <Panel title="Distribution by tax character">
        <SankeyChart model={fx.FIXTURE_SANKEY} />
      </Panel>
      <div className="gallery__grid">
        <Panel title="A tiny source stays visible">
          <SankeyChart model={fx.FIXTURE_SANKEY_TINY} />
        </Panel>
        <Panel title="Nothing to chart">
          <SankeyChart model={fx.FIXTURE_SANKEY_EMPTY} />
        </Panel>
      </div>
      <Panel title="Long labels at every chart width">
        <div className="gallery__widths">
          {SANKEY_WIDTHS.map((w) => (
            <figure key={w} className="gallery__width" style={{ width: w }}>
              <figcaption>{w}px</figcaption>
              <SankeyChart model={fx.FIXTURE_SANKEY_LONG} />
            </figure>
          ))}
        </div>
      </Panel>
      <Panel title="Tax leakage — % of each distribution">
        <StackedBars
          rows={fx.FIXTURE_LEAKAGE}
          scale="max"
          segmentColors={fx.LEAKAGE_COLORS}
          formatValue={(v) => `${v.toFixed(1)}%`}
          formatTick={(v) => `${v}%`}
          summary="Southbank Industrial Partners Fund loses the most, 8.2% of its distribution, mostly final withholding."
        />
      </Panel>
      <Panel title="Distribution mix — share of each distribution">
        <StackedBars
          rows={fx.FIXTURE_MIX}
          scale={100}
          segmentColors={fx.MIX_COLORS}
          formatValue={(v) => `${v.toFixed(1)}%`}
          formatTick={(v) => `${v}%`}
          summary="Share of each distribution that goes to residents, to foreign investors net, to the ATO and to units not on the register."
        />
      </Panel>
      <Sample title="Error boundary (panel)">
        <div className="gallery__row">
          <Button variant="danger" onClick={() => setArmed(true)}>
            Throw an error
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setArmed(false);
              setToken((n) => n + 1);
            }}
          >
            Reset the sample
          </Button>
        </div>
        <ErrorBoundary scope="panel" resetKeys={[token]}>
          <Bomb armed={armed} />
        </ErrorBoundary>
      </Sample>
    </Section>
  );
}

function Documents() {
  return (
    <Section id="doc" title="Document view">
      <DocView doc={fx.FIXTURE_DOC} headingLevel={3} />
      <Sample title="Wide statement: the table scrolls inside the document, the page does not widen">
        <DocView doc={fx.FIXTURE_DOC_WIDE} headingLevel={4} />
      </Sample>
    </Section>
  );
}

const CONTENTS = [
  ["tokens", "Colour and type"],
  ["buttons", "Buttons"],
  ["chips", "Chips"],
  ["banners", "Banners"],
  ["surfaces", "Panels and tabs"],
  ["forms", "Forms"],
  ["tables", "Tables"],
  ["overlays", "Dialogs"],
  ["shell", "Shell"],
  ["charts", "Charts"],
  ["doc", "Document"],
] as const;

export default function Gallery() {
  useDocumentTitle("Design gallery");
  return (
    <>
      <style>{GALLERY_CSS}</style>
      <main id="main" tabIndex={-1} className="gallery">
        <header className="gallery__head">
          <h1 className="gallery__h1">Design gallery</h1>
          <p className="muted" style={{ margin: 0 }}>
            Every primitive and shell view, from fixtures. Development builds only.
          </p>
          <nav aria-label="Gallery sections">
            <ul role="list" className="gallery__toc">
              {CONTENTS.map(([id, label]) => (
                <li key={id}>
                  <Button size="sm" variant="ghost" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "auto" })}>
                    {label}
                  </Button>
                </li>
              ))}
            </ul>
          </nav>
        </header>
        <Tokens />
        <Buttons />
        <Chips />
        <Banners />
        <Surfaces />
        <Forms />
        <Tables />
        <Overlays />
        <ShellViews />
        <Charts />
        <Documents />
      </main>
    </>
  );
}
