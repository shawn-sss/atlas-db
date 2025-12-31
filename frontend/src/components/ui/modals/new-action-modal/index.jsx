import React from "react";
import ModalShell from "..";
import IconDoc from "../../icons/icon-doc";
import IconFolder from "../../icons/icon-folder";

export default function NewActionModal({
  onClose,
  onDocument,
  onFolderSelect,
}) {
  return (
    <ModalShell
      eyebrow="Create"
      title="What would you like to build?"
      subtitle="Start a document or an empty folder and add content afterward."
      onClose={onClose}
      className="modal-new-action"
    >
      <div className="new-action-options">
        <button
          type="button"
          className="new-action-option"
          onClick={onDocument}
        >
          <div className="new-action-icon">
            <IconDoc size={30} />
          </div>
          <div>
            <div className="new-action-option-title">New Document</div>
            <div className="muted new-action-option-subtext">
              Open the editor to craft text, links, and metadata.
            </div>
          </div>
        </button>
        <button
          type="button"
          className="new-action-option"
          onClick={onFolderSelect}
        >
          <div className="new-action-icon">
            <IconFolder size={30} />
          </div>
          <div>
            <div className="new-action-option-title">New Folder</div>
            <div className="muted new-action-option-subtext">
              Create a blank folder (folder mode will be toggled on).
            </div>
          </div>
        </button>
      </div>
    </ModalShell>
  );
}
