import { useState } from "react";
import { useStore } from "../../state.tsx";
import { Button, Dialog, Icon, Panel, useAnnounce } from "../../ui/index.ts";
import { RESET_DESCRIPTION, RESET_DONE, RESET_TITLE, STORAGE_NOTE } from "./accessModel.ts";
import "./access.css";

/** Where the demo's data lives and how to start over: Reset demo data restores the original demonstration data after a confirmation. */
export function ResetPanel() {
  const store = useStore();
  const announce = useAnnounce();
  const [confirming, setConfirming] = useState(false);

  const reset = (): void => {
    store.reset();
    setConfirming(false);
    announce(RESET_DONE);
  };

  return (
    <Panel title="Demo data">
      <div className="access-reset">
        <p className="access-note">{STORAGE_NOTE}</p>
        <div>
          <Button variant="danger" icon={<Icon name="undo" />} onClick={() => setConfirming(true)}>
            Reset demo data
          </Button>
        </div>
      </div>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        role="alertdialog"
        size="sm"
        title={RESET_TITLE}
        description={RESET_DESCRIPTION}
        footer={
          <>
            <Button variant="secondary" data-autofocus onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={reset}>
              Reset demo data
            </Button>
          </>
        }
      />
    </Panel>
  );
}
