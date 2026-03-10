import React from "react";
import WorkspaceModals from "./components/workspace/Modals";
import useWorkspaceSession from "./hooks/useWorkspaceSession.jsx";

export default function App() {
  const {
    editing,
    mainContent,
    newModalProps,
    folderPromptProps,
    parentPickerProps,
    aboutModalProps,
    readerModalProps,
    editorOverlayProps,
    settingsProps,
    errorProps,
    historyDiffProps,
  } = useWorkspaceSession();

  return (
    <div className={`app-shell ${editing ? "editing" : ""}`}>
      {mainContent}
      <WorkspaceModals
        newModal={newModalProps}
        parentPicker={parentPickerProps}
        folderPrompt={folderPromptProps}
        aboutModal={aboutModalProps}
        readerModal={readerModalProps}
        editorOverlay={editorOverlayProps}
        settings={settingsProps}
        error={errorProps}
        historyDiff={historyDiffProps}
      />
    </div>
  );
}
