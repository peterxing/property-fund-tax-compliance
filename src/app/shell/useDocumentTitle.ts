import { useEffect } from "react";
import { documentTitle } from "../labels.ts";

/** Sets document.title to "<parts…> · Property Fund Tax Compliance" (empty parts are skipped) so each workspace and fund has a distinct title. */
export function useDocumentTitle(...parts: Array<string | null | undefined>): void {
  const title = documentTitle(parts);
  useEffect(() => {
    document.title = title;
  }, [title]);
}
