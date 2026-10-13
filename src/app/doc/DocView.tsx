import { useId, type ElementType } from "react";
import type { DocBlock, DocModel } from "../../domain/types.ts";
import { TableScroll } from "../ui/TableScroll.tsx";
import { cls } from "../ui/cls.ts";
import { clampLevel, sectionLevels } from "./docLevels.ts";

export interface DocViewProps {
  doc: DocModel;
  /** Level of the document title (default 4, for a document shown inside a panel under an h3). Block headings nest below it, up to h6. */
  headingLevel?: 2 | 3 | 4 | 5;
  className?: string;
}

const asHeading = (n: number): ElementType => `h${clampLevel(n)}`;

type TableBlock = Extract<DocBlock, { kind: "table" }>;

/** One row of cells: the first column is the row header when it holds a label. */
function Cells({ columns, row, rowHeader }: { columns: TableBlock["columns"]; row: Record<string, string>; rowHeader: boolean }) {
  return (
    <>
      {columns.map((column, c) => {
        const text = row[column.key] ?? "";
        const className = column.align === "right" ? "num" : undefined;
        return c === 0 && rowHeader && text ? (
          <th key={column.key} scope="row" className={className}>
            {text}
          </th>
        ) : (
          <td key={column.key} className={className}>
            {text}
          </td>
        );
      })}
    </>
  );
}

function Table({ block, headingId, titleTag: Title }: { block: TableBlock; headingId: string; titleTag: ElementType }) {
  const { columns, rows, totalRow } = block;
  const rowHeader = columns.length > 0 && columns[0]!.align !== "right";
  return (
    <div className="doc__block">
      {block.title ? (
        <Title id={headingId} className="doc__block-title">
          {block.title}
        </Title>
      ) : null}
      <TableScroll label={block.title ?? "Table"}>
        <table className="doc__table" aria-labelledby={block.title ? headingId : undefined}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className={column.align === "right" ? "num" : undefined}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                <Cells columns={columns} row={row} rowHeader={rowHeader} />
              </tr>
            ))}
          </tbody>
          {totalRow ? (
            <tfoot>
              <tr>
                <Cells columns={columns} row={totalRow} rowHeader={rowHeader} />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </TableScroll>
    </div>
  );
}

/**
 * A DocModel shown on the page like a printed statement: title, subtitle and meta, then heading / paragraph / key-value / table / list
 * blocks and footnotes. The same model is what the PDF export renders, so what you see is what downloads.
 */
export function DocView({ doc, headingLevel = 4, className }: DocViewProps) {
  const uid = useId();
  const titleId = `${uid}-title`;
  const Title = asHeading(headingLevel);
  const levels = sectionLevels(doc.blocks, headingLevel);
  return (
    <article className={cls("doc", className)} aria-labelledby={titleId}>
      <header className="doc__head">
        <Title id={titleId} className="doc__title">
          {doc.title}
        </Title>
        {doc.subtitle ? <p className="doc__subtitle">{doc.subtitle}</p> : null}
        {doc.meta && doc.meta.length > 0 ? (
          <dl className="doc__meta">
            {doc.meta.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </header>
      <div className="doc__body">
        {doc.blocks.map((block, index) => {
          const key = `${uid}-${index}`;
          const level = levels[index]!;
          switch (block.kind) {
            case "heading": {
              const Heading = asHeading(level);
              return (
                <Heading key={key} className={cls("doc__heading", (block.level ?? 2) === 3 && "doc__heading--minor")}>
                  {block.text}
                </Heading>
              );
            }
            case "paragraph":
              return (
                <p key={key} className={cls("doc__p", block.tone === "muted" && "doc__p--muted", block.tone === "note" && "doc__p--note")}>
                  {block.text}
                </p>
              );
            case "kv": {
              const Heading = asHeading(level + 1);
              return (
                <div key={key} className="doc__block">
                  {block.title ? (
                    <Heading id={`${key}-title`} className="doc__block-title">
                      {block.title}
                    </Heading>
                  ) : null}
                  <dl className="doc__kv" aria-labelledby={block.title ? `${key}-title` : undefined}>
                    {block.rows.map((row, r) => (
                      <div key={r} className={cls("doc__kv-row", row.emphasis && "doc__kv-row--emphasis")}>
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            }
            case "table":
              return <Table key={key} block={block} headingId={`${key}-title`} titleTag={asHeading(level + 1)} />;
            case "list":
              return (
                <ul key={key} className="doc__list">
                  {block.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              );
          }
        })}
      </div>
      {doc.footnotes && doc.footnotes.length > 0 ? (
        <footer className="doc__footnotes">
          <p className="doc__footnotes-title">Notes</p>
          <ol>
            {doc.footnotes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ol>
        </footer>
      ) : null}
    </article>
  );
}
