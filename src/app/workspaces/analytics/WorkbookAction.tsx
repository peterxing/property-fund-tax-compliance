import { workbookModel } from "../../../domain/index.ts";
import { downloadXlsx } from "../../exports/index.ts";
import { useAppData, useCtx, useUi } from "../../state.tsx";
import { DownloadButton, Icon } from "../../ui/index.ts";

/** The page's top-right action: the portfolio as an Excel workbook for Power BI, with the two things worth knowing about using it. */
export function WorkbookAction() {
  const data = useAppData();
  const ctx = useCtx();
  const { jurisdiction } = useUi();
  return (
    <div className="portfolio__actions--stack analytics-workbook">
      <DownloadButton variant="primary" icon={<Icon name="file-text" />} onDownload={() => downloadXlsx(workbookModel(data, ctx, jurisdiction))}>
        Download Power BI workbook
      </DownloadButton>
      <p className="portfolio__note">Fund-level and holder-level tables for Power BI. Opens in Excel too.</p>
      <p className="portfolio__note">
        In Power BI Desktop, use Get data → Excel workbook. A report that refreshes on its own needs the data in a shared source such as SharePoint or Dataverse.
      </p>
    </div>
  );
}
