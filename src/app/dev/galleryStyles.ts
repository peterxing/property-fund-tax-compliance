// Styles for the design gallery. esbuild does not load the CSS of a lazily imported chunk, so the gallery injects these itself (a .css import
// would also leak into the production stylesheet). Development builds only.
export const GALLERY_CSS = `/* Design gallery (development builds only). */

.gallery {
  max-width: 1280px;
  margin: 0 auto;
  padding: var(--space-5) var(--page-pad) var(--space-7);
}
.gallery__head {
  display: grid;
  gap: var(--space-2);
  margin-bottom: var(--space-5);
}
.gallery__h1 {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
}
.gallery__toc {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.gallery__section {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}
.gallery__h2 {
  margin: 0;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
  font-size: 18px;
  font-weight: 600;
}
.gallery__h3 {
  margin: 0 0 var(--space-2);
  color: var(--muted-foreground);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.gallery__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}
.gallery__stack {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
}
.gallery__stack--divided > * + * {
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
}
.gallery__sample .gallery__row + * {
  margin-top: var(--space-3);
}
.gallery__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--space-4);
  align-items: start;
}
.gallery__split {
  display: grid;
  grid-template-columns: minmax(0, 300px) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
}
@media (max-width: 899.98px) {
  .gallery__split {
    grid-template-columns: minmax(0, 1fr);
  }
}
.gallery__frame {
  min-width: 0;
  border: 1px dashed var(--control-border);
  border-radius: 6px;
  overflow: hidden;
}
.gallery__frame .fund-rail {
  position: static;
  max-height: none;
  border: 0;
}
.gallery__swatches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: var(--space-2) var(--space-4);
}
.gallery__swatch {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 12px;
}
.gallery__chip {
  width: 36px;
  height: 24px;
  border: 1px solid var(--border);
  border-radius: 4px;
}
.gallery__type {
  display: grid;
  gap: var(--space-2);
}
.gallery__actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.gallery__widths {
  display: grid;
  justify-items: start;
  gap: var(--space-4);
  overflow-x: auto;
  padding: 1px;
}
.gallery__width {
  margin: 0;
  max-width: none;
  outline: 1px dashed var(--control-border);
}
.gallery__width figcaption {
  padding: 2px 6px;
  font-size: 11px;
  color: var(--muted-foreground);
  border-bottom: 1px dashed var(--control-border);
}
`;
