import { useId } from "react";
import { Icon, cls } from "../../ui/index.ts";
import type { NoticeListItem } from "./model.ts";
import "./investor-reporting.css";

export interface NoticePickerProps {
  items: readonly NoticeListItem[];
  selectedId: string | null;
  onSelect(id: string): void;
}

/** The fund's notices as a group of radio cards: the arrow keys move between them, and the chosen one is the notice shown below. */
export function NoticePicker({ items, selectedId, onSelect }: NoticePickerProps) {
  const uid = useId();
  return (
    <fieldset className="ir-picker">
      <legend className="sr-only">Choose a fund payment notice</legend>
      <div className="ir-picker__grid">
        {items.map((item, index) => {
          const selected = item.id === selectedId;
          const base = `${uid}-${index}`;
          return (
            <label key={item.id} className={cls("ir-notice", selected && "ir-notice--selected")}>
              <input
                type="radio"
                name={`${uid}-notice`}
                value={item.id}
                checked={selected}
                className="ir-notice__input"
                aria-labelledby={`${base}-label`}
                aria-describedby={`${base}-paid ${base}-status`}
                onChange={() => onSelect(item.id)}
              />
              <span className="ir-notice__text">
                <span id={`${base}-label`} className="ir-notice__label">
                  {item.label}
                </span>
                <span id={`${base}-paid`} className="ir-notice__paid">
                  {item.paid}
                </span>
                <span id={`${base}-status`} className="ir-notice__status">
                  {item.published ? <Icon name="lock" size={12} /> : null}
                  {item.status}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
