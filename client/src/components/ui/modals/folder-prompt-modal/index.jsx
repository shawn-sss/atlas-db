import React from "react";
import ModalShell from "..";

export default function FolderPromptModal({
  folderName,
  onFolderNameChange,
  onClose,
  onSave,
  busy,
  error,
  parentSlug,
}) {
  return (
    <ModalShell
      eyebrow="New folder"
      title="Name the folder"
      subtitle="This will create an empty folder document with placeholder content."
      onClose={onClose}
      closeLabel="Back"
      className="modal-folder-prompt"
    >
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        {typeof parentSlug !== "undefined" && (
          <div className="folder-prompt-parent">
            <span>Location</span>
            <strong>{parentSlug ? `/${parentSlug}` : "Root"}</strong>
          </div>
        )}
        <label className="field">
          <span>Folder name</span>
          <input
            className="input"
            autoFocus
            value={folderName}
            onChange={(e) => onFolderNameChange(e.target.value)}
            placeholder="e.g., Engineering Team"
          />
        </label>
        {error && <div className="muted folder-prompt-error">{error}</div>}
        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Back
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Creating folder..." : "Create folder"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
