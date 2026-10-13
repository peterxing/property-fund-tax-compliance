import { cls } from "../../ui/index.ts";
import type { GainCell } from "./model.ts";
import "./cost-base.css";

/** An unrealised gain or loss. A loss also says "loss" in words, so it never rests on the minus sign or the colour alone. */
export function Gain({ cell }: { cell: GainCell }) {
  return (
    <span className={cls("cb-gain", cell.loss && "cb-gain--loss")}>
      <span>{cell.amount}</span>
      {cell.loss ? <span className="cb-gain__kind">loss</span> : null}
    </span>
  );
}
