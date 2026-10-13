import type { ReturnView } from "../../../domain/types.ts";
import { DocView } from "../../doc/DocView.tsx";
import { downloadPdf } from "../../exports/index.ts";
import { DownloadButton, Panel } from "../../ui/index.ts";

/** The working papers behind the return: the same document the PDF export prints. */
export function PapersPanel({ view }: { view: ReturnView }) {
  return (
    <Panel title="Working papers" actions={<DownloadButton size="sm" label="Download PDF" onDownload={() => downloadPdf(view.papers)} />}>
      <DocView doc={view.papers} headingLevel={4} />
    </Panel>
  );
}
