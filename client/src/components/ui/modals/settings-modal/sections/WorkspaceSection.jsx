import React from "react";
import WorkspaceOwnerControls from "../../../../workspace/WorkspaceOwnerControls";

export default function WorkspaceSection({
  bootstrap,
  appIcon,
  onAppIconChange,
  onAppTitleChange,
}) {
  return (
    <div className="stack">
      <WorkspaceOwnerControls
        bootstrap={bootstrap}
        appIcon={appIcon}
        onAppIconChange={onAppIconChange}
        onAppTitleChange={onAppTitleChange}
      />
    </div>
  );
}
