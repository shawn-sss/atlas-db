import React from "react";
import AppBrand from "../ui/AppBrand";
import DocumentSidebar from "../documents/document-sidebar";
import DocumentPreviewHeader from "./DocumentPreviewHeader";

export default function WorkspaceLayout({
  appTitleText,
  bootstrapInfo = {},
  isOwner,
  onNukeWorkspace,
  onOpenSettings,
  onLogout,
  sidebarProps,
  editorComponent: Editor,
  editorProps,
  previewContent,
}) {
  const {
    showEditor,
    editorDualPane,
    selectedDoc,
    editorSharedProps,
    onEnterDualPane,
    onExitDualPane,
    onShowAbout,
    onStartEditing,
    onOpenReader,
  } = editorProps;

  return (
    <div className="workspace-shell">
      <header className="workspace-header">
        <div className="workspace-header-brand">
          <AppBrand compact iconSrc={bootstrapInfo.appIcon} />
          <div className="topbar-title">{appTitleText}</div>
        </div>
        <div className="workspace-header-actions">
          {isOwner && (
            <button
              className="btn btn-danger"
              onClick={onNukeWorkspace}
              title="Delete database and content files"
              aria-label="Nuke all"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
              >
                <path
                  d="M12 2.5c-2.6 2.2-2.2 4.6-1.1 6.2.8 1.1 1.1 2 .7 3.3-1-.7-1.8-1.6-2.4-2.7-1.9 2.2-3 4.3-3 6.5 0 3.2 2.7 5.7 5.8 5.7s5.8-2.5 5.8-5.7c0-3.1-1.6-5.9-5.8-9.3z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          <button className="btn btn-ghost" onClick={onOpenSettings}>
            Settings
          </button>
          <button className="btn btn-ghost" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>
      <div className="workspace-body">
        <DocumentSidebar {...sidebarProps} />
        <main className="doc-main">
          <div className="doc-content">
            <div className="doc-content-view">
              {showEditor && !editorDualPane ? (
                <div className="doc-editor-panel">
                  <React.Suspense
                    fallback={<div className="muted">Loading editor...</div>}
                  >
                    <Editor
                      {...editorSharedProps}
                      isDualPane={editorDualPane}
                      onEnterDualPane={onEnterDualPane}
                      onExitDualPane={onExitDualPane}
                    />
                  </React.Suspense>
                </div>
              ) : (
                <div className="doc-preview-panel">
                  {!showEditor && selectedDoc && (
                    <DocumentPreviewHeader
                      selectedDoc={selectedDoc}
                      onShowAbout={onShowAbout}
                      onEdit={onStartEditing}
                      onOpenReader={onOpenReader}
                    />
                  )}
                  {previewContent}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
