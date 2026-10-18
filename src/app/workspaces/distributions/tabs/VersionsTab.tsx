import { useMemo, useState } from "react";
import { getFund } from "../../../../domain/selectors.ts";
import { dateTimeLabel, money } from "../../../../domain/format.ts";
import { maySaveVersion } from "../../../../domain/governance/reducer.ts";
import { inputHash, lastSignOffVersion, versionDiff } from "../../../../domain/governance/versions.ts";
import type { CalcVersion } from "../../../../domain/governance/types.ts";
import { useAppData, useCtx, useDispatch } from "../../../state.tsx";
import { Banner, Button, Dialog, EmptyState, Field, Select, TableScroll, TextInput, useAnnounce } from "../../../ui/index.ts";

export function VersionsTab({ fundId }: { fundId: string }) {
  const data = useAppData();
  const ctx = useCtx();
  const dispatch = useDispatch();
  const announce = useAnnounce();
  const fund = getFund(data, fundId);
  const versions = useMemo(() => data.versions.filter((v) => v.fundId === fundId).sort((a, b) => b.at.localeCompare(a.at)), [data.versions, fundId]);
  const signOff = lastSignOffVersion(data, fundId);
  const stale = fund.status === "Signed off" && signOff !== null && signOff.inputHash !== inputHash(data, fundId);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [right, setRight] = useState<string>("current");
  const [open, setOpen] = useState(false);
  const maySave = maySaveVersion(ctx.user, fund);
  const saveButton = maySave ? <Button variant="secondary" onClick={() => setOpen(true)}>Save version</Button> : null;
  const selectedLeft = compareId ? (versions.find((v) => v.id === compareId) ?? null) : null;
  const selectedRight = right === "current" ? "current" : (versions.find((v) => v.id === right) ?? "current");
  const diff = selectedLeft ? versionDiff(data, selectedLeft, selectedRight, ctx.now) : null;
  const save = (label: string): boolean => {
    const result = dispatch({ type: "gov-save-version", fundId, label });
    if (!result.ok) return false;
    announce(`Calculation version saved: ${label.trim()}.`);
    return true;
  };

  if (versions.length === 0) {
    return (
      <div className="rv-stack">
        <div className="rv-versions-toolbar">
          <p className="rv-summary">No saved versions.</p>
          {saveButton}
        </div>
        <EmptyState title="No saved versions yet">Submit, sign off, reopen, or save a manual version to capture the calculation state.</EmptyState>
        <SaveVersionDialog open={open} onClose={() => setOpen(false)} onSave={save} />
      </div>
    );
  }

  const options = versions.map((v) => ({ value: v.id, label: `${v.label} · ${dateTimeLabel(v.at)}` }));
  return (
    <div className="rv-stack">
      {stale ? <Banner tone="warn">Changed since sign-off. Current inputs no longer match the last sign-off version.</Banner> : null}
      <div className="rv-versions-toolbar">
        <p className="rv-summary">{versions.length} saved {versions.length === 1 ? "version" : "versions"}.</p>
        {saveButton}
      </div>
      {selectedLeft ? (
        <div className="rv-toolbar">
        <Field label="Compare from"><Select value={selectedLeft.id} options={options} onValueChange={setCompareId} /></Field>
        <Field label="Compare to"><Select value={right} options={[{ value: "current", label: "Current inputs" }, ...options]} onValueChange={setRight} /></Field>
      </div>
      ) : null}
      <TableScroll label="Calculation versions">
        <table className="dt dt--dense rv-versions">
          <caption>Calculation versions</caption>
          <thead><tr><th scope="col">Label</th><th scope="col">Trigger</th><th scope="col">By</th><th scope="col">At</th><th scope="col">Hash</th><th scope="col">Reason</th><th scope="col">Action</th></tr></thead>
          <tbody>
            {versions.map((version) => (
              <tr key={version.id}>
                <th scope="row">{version.label}</th>
                <td>{version.trigger}</td>
                <td>{version.by}</td>
                <td>{dateTimeLabel(version.at)}</td>
                <td><code>{version.inputHash.slice(0, 8)}</code></td>
                <td>{version.reason ?? "–"}</td>
                <td><Button size="sm" variant="secondary" onClick={() => { setCompareId(version.id); setRight("current"); }}>Compare with current</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {diff && selectedLeft ? (
        <TableScroll label="Version comparison">
          <table className="dt dt--dense rv-versions">
            <caption>Version comparison. Comparing {selectedLeft.label} with {selectedRight === "current" ? "current inputs" : selectedRight.label}. Hashes {diff.hashEqual ? "match" : "differ"}.</caption>
            <thead><tr><th scope="col">Line</th><th scope="col" className="num">Then</th><th scope="col" className="num">Now</th><th scope="col" className="num">Change</th></tr></thead>
            <tbody>
              {diff.lines.map((line) => (
                <tr key={line.ref}>
                  <th scope="row">{line.label}</th>
                  <td className="num">{line.then === null ? "–" : money(line.then, fund.currency, 2)}</td>
                  <td className="num">{line.now === null ? "–" : money(line.now, fund.currency, 2)}</td>
                  <td className="num">{money(line.change, fund.currency, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      ) : null}
      <SaveVersionDialog open={open} onClose={() => setOpen(false)} onSave={save} />
    </div>
  );
}

function SaveVersionDialog({ open, onClose, onSave }: { open: boolean; onClose(): void; onSave(label: string): boolean }) {
  const [label, setLabel] = useState("");
  const save = (): void => {
    if (!onSave(label)) return;
    setLabel("");
    onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} title="Save calculation version" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save version</Button></>}>
      <Field label="Label"><TextInput value={label} onChange={(event) => setLabel(event.currentTarget.value)} /></Field>
    </Dialog>
  );
}
