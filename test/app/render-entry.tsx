// Entry point for render.test.ts: it is bundled by esbuild and imported, because Node's type stripping does not handle JSX.
// Each scene renders one part of the design system to static markup from the dev fixtures (no store, no browser).
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DocView } from "../../src/app/doc/DocView.tsx";
import { SankeyChart } from "../../src/app/charts/SankeyChart.tsx";
import { StackedBars } from "../../src/app/charts/StackedBars.tsx";
import * as fx from "../../src/app/dev/fixtures.ts";
import { FundHeaderView } from "../../src/app/shell/FundHeader.tsx";
import { FundRailView } from "../../src/app/shell/FundRail.tsx";
import { HeaderView } from "../../src/app/shell/Header.tsx";
import {
  Banner,
  Button,
  Checkbox,
  Dialog,
  DownloadButton,
  EmptyState,
  ExceptionChip,
  Field,
  Kpi,
  KpiStrip,
  MarketBadge,
  MoneyInput,
  NumberInput,
  Panel,
  Segmented,
  Select,
  StatusChip,
  TableScroll,
  Tabs,
  TextArea,
  TextInput,
} from "../../src/app/ui/index.ts";

const noop = (): void => undefined;
const html = (node: ReactElement): string => renderToStaticMarkup(node);
const railHref = (id: string): string => `#/?fund=${id}`;

export const scenes = {
  header: () =>
    html(
      <HeaderView
        routePath="/analytics"
        fundId="harbourline"
        users={fx.FIXTURE_USERS}
        userId="l-brennan"
        jurisdiction="SG"
        onUserChange={noop}
        onJurisdictionChange={noop}
      />,
    ),
  rail: () => html(<FundRailView groups={fx.FIXTURE_FUND_GROUPS} selectedId="southbank" hrefFor={railHref} />),
  railManage: () => html(<FundRailView groups={fx.FIXTURE_FUND_GROUPS} selectedId="southbank" hrefFor={railHref} canManageFunds />),
  railEmptyManage: () => html(<FundRailView groups={[]} selectedId={null} hrefFor={() => "#/"} canManageFunds />),
  railOpen: () => html(<FundRailView groups={fx.FIXTURE_FUND_GROUPS} selectedId="kurrajong" hrefFor={railHref} defaultOpen />),
  railQuiet: () => html(<FundRailView groups={fx.FIXTURE_FUND_GROUPS} selectedId="wattle" hrefFor={railHref} />),
  railNoSelection: () => html(<FundRailView groups={fx.FIXTURE_FUND_GROUPS} selectedId={null} hrefFor={railHref} />),
  railEmpty: () => html(<FundRailView groups={[]} selectedId={null} hrefFor={() => "#/"} />),
  railEmptyCustom: () => html(<FundRailView groups={[]} selectedId={null} hrefFor={() => "#/"} emptyMessage="Nothing here." />),
  fundHeaderReview: () =>
    html(
      <FundHeaderView
        fund={fx.FIXTURE_AU_FUND}
        status="In review"
        due={{ label: "AMMA due", value: "30 Sep 2026" }}
        governanceLabel="Tax agent reviews and lodges"
        chain={fx.FIXTURE_CHAIN_PENDING}
        openQueries={2}
        actions={fx.FIXTURE_ACTIONS_REVIEW}
      />,
    ),
  fundHeaderSigned: () =>
    html(
      <FundHeaderView
        fund={fx.FIXTURE_SG_FUND}
        status="Signed off"
        due={null}
        governanceLabel="No tax agent"
        chain={fx.FIXTURE_CHAIN_DONE}
        openQueries={0}
        actions={fx.FIXTURE_ACTIONS_SIGNED}
      />,
    ),
  doc: () => html(<DocView doc={fx.FIXTURE_DOC} headingLevel={3} />),
  docWide: () => html(<DocView doc={fx.FIXTURE_DOC_WIDE} headingLevel={3} />),
  sankey: () => html(<SankeyChart model={fx.FIXTURE_SANKEY} />),
  sankeyEmpty: () => html(<SankeyChart model={fx.FIXTURE_SANKEY_EMPTY} />),
  bars: () =>
    html(
      <StackedBars
        rows={fx.FIXTURE_LEAKAGE}
        scale="max"
        segmentColors={fx.LEAKAGE_COLORS}
        formatValue={(v) => `${v.toFixed(1)}%`}
        formatTick={(v) => `${v}%`}
        summary="Southbank loses the most."
      />,
    ),
  barsEmpty: () => html(<StackedBars rows={[]} scale="max" summary="No funds." emptyMessage="No funds to compare." />),
  fields: () =>
    html(
      <div>
        <Field label="Holder name" hint="As on the register">
          <TextInput value="" onValueChange={noop} />
        </Field>
        <Field label="Registry name" error="Enter the registry name" required>
          <TextInput value="" onValueChange={noop} />
        </Field>
        <Field label="Cash distribution" hint="Type 1,250,000">
          <MoneyInput value={125_000_050} currency="AUD" onCommit={noop} />
        </Field>
        <Field label="Required amount">
          <MoneyInput value={null} currency="SGD" onCommit={noop} allowEmpty={false} />
        </Field>
        <Field label="Units on issue">
          <NumberInput value={412_000_000} onCommit={noop} integer min={0} />
        </Field>
        <Field label="Withholding rate">
          <NumberInput value={15} onCommit={noop} decimals={2} suffix="%" />
        </Field>
        <Field label="Working as">
          <Select value="b" onValueChange={noop} options={[{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }]} />
        </Field>
        <Field label="Query">
          <TextArea rows={3} defaultValue="Please confirm." />
        </Field>
        <Checkbox label="Send a copy" checked onCheckedChange={noop} />
        <Segmented legend="Size" options={[{ value: "a", label: "Fund" }, { value: "b", label: "Holder" }]} value="b" onChange={noop} />
      </div>,
    ),
  buttons: () =>
    html(
      <div>
        <Button>Plain</Button>
        <Button disabled aria-describedby="why">
          Unavailable
        </Button>
        <Button loading>Saving</Button>
        <DownloadButton onDownload={noop} label="Download CSV" />
      </div>,
    ),
  badges: () =>
    html(
      <div>
        <MarketBadge market="AU" />
        <MarketBadge market="SG" />
        <StatusChip status="Preparing" labelled />
        <StatusChip status="In review" />
        <ExceptionChip count={3} />
        <ExceptionChip count={0} />
      </div>,
    ),
  surfaces: () =>
    html(
      <div>
        <Banner tone="error" title="Could not save">
          Out of range.
        </Banner>
        <Banner tone="info">Locked.</Banner>
        <KpiStrip label="Summary">
          <Kpi label="Cash" value="A$1" sub="per unit" />
          <Kpi label="Exceptions" value="2" tone="bad" />
        </KpiStrip>
        <EmptyState title="Nothing yet" headingLevel={3}>
          Add the first item.
        </EmptyState>
        <Panel title="Panel title" level={3} actions={<span>Actions</span>}>
          Body
        </Panel>
        <TableScroll label="Holders">
          <table>
            <caption>Holders</caption>
            <thead>
              <tr>
                <th scope="col">Holder</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Acme</td>
              </tr>
            </tbody>
          </table>
        </TableScroll>
      </div>,
    ),
  dialogClosed: () =>
    html(
      <Dialog open={false} onClose={noop} title="Approve distribution" description="This signs off the fund.">
        Body
      </Dialog>,
    ),
  dialogOpen: () =>
    html(
      <Dialog
        open
        onClose={noop}
        title="Approve distribution"
        description="This signs off the fund."
        size="sm"
        footer={
          <>
            <Button data-autofocus>Cancel</Button>
            <Button variant="primary">Approve</Button>
          </>
        }
      >
        <TextInput aria-label="Reason" value="" onValueChange={noop} />
      </Dialog>,
    ),
  dialogAlert: () =>
    html(
      <Dialog open role="alertdialog" dismissible={false} onClose={noop} title="Discard changes?">
        <p>Nothing is saved.</p>
      </Dialog>,
    ),
  tabs: () =>
    html(
      <Tabs
        label="Review"
        value="statements"
        onValueChange={noop}
        tabs={[
          { id: "withholding", label: "Withholding" },
          { id: "statements", label: "Statements", badge: "3" },
        ]}
      >
        <Tabs.Panel id="withholding">Withholding content</Tabs.Panel>
        <Tabs.Panel id="statements">Statements content</Tabs.Panel>
      </Tabs>,
    ),
};

export type SceneName = keyof typeof scenes;
