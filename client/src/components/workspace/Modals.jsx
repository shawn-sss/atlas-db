import React from "react";
import ModalShell from "../ui/modals";
import NewActionModal from "../ui/modals/new-action-modal";
import FolderPromptModal from "../ui/modals/folder-prompt-modal";
import FolderPickerModal from "../ui/modals/folder-picker-modal";
import SettingsModal from "../ui/modals/settings-modal";
import ErrorToast from "../ui/modals/error-toast";
import ReaderView from "../documents/document-reader";
import { formatTimestamp } from "../../utils/formatters";

export default function WorkspaceModals({
  newModal = {},
  folderPrompt = {},
  parentPicker = {},
  aboutModal = {},
  readerModal = {},
  editorOverlay = {},
  settings = {},
  error = {},
  historyDiff = {},
}) {
  const {
    show: overlayShow,
    component: Editor,
    props: overlayProps = {},
  } = editorOverlay;

  const {
    show: showAbout,
    selectedDoc,
    info,
    onClose: closeAbout,
    historyEntries = [],
    historyLoading,
    historyError,
    historyRestoreError,
    historyRestoreId,
    historyDiffLoading,
    historyDiffEntryId,
    onHistoryDiff,
    onHistoryRollback,
    canRestoreHistory,
  } = aboutModal;

  const {
    show: showReader,
    selectedDoc: readerSelected,
    html: readerHtml,
    info: readerInfo,
    onClose: closeReader,
  } = readerModal;

  const {
    show: showNewModal,
    onClose: closeNewModal,
    onDocument,
    onFolderSelect,
  } = newModal;

  const {
    show: showParentPicker,
    tree: parentPickerTree = [],
    state: parentPickerState = {},
    onClose: closeParentPicker,
    onConfirm: confirmParentPicker,
  } = parentPicker;

  const {
    show: showFolderPrompt,
    folderName,
    onFolderNameChange,
    onClose: closeFolderPrompt,
    onSave: saveFolder,
    busy: folderBusy,
    error: folderError,
    parentSlug,
  } = folderPrompt;

  const {
    show: showSettings,
    user,
    startPageSlug,
    bootstrap,
    initialCategory,
    onCategoryChange,
    onClose: closeSettings,
    onSetStartPage,
    onNuke,
    onAppIconChange,
    onAppTitleChange,
  } = settings;

  const { message, onClose: closeError } = error;

  const {
    show: showHistoryDiff,
    data,
    loading,
    error: historyErrorMessage,
    onClose: closeHistoryDiff,
  } = historyDiff;

  const diffSummary = React.useMemo(() => {
    const segments = data?.segments || [];
    const rows = [];
    let oldLine = 1;
    let newLine = 1;
    let added = 0;
    let removed = 0;
    let current = {
      parts: [],
      hasOld: false,
      hasNew: false,
    };

    const pushLine = () => {
      if (current.parts.length === 0) {
        return;
      }
      const hasInsert = current.parts.some((part) => part.type === "insert");
      const hasDelete = current.parts.some((part) => part.type === "delete");
      let lineType = "equal";
      if (hasInsert && hasDelete) {
        lineType = "change";
      } else if (hasInsert) {
        lineType = "insert";
      } else if (hasDelete) {
        lineType = "delete";
      }

      rows.push({
        key: `${rows.length}-${oldLine}-${newLine}`,
        type: lineType,
        oldLine: current.hasOld ? oldLine : null,
        newLine: current.hasNew ? newLine : null,
        parts: current.parts,
      });

      if (current.hasOld) {
        oldLine += 1;
      }
      if (current.hasNew) {
        newLine += 1;
      }
      if (lineType === "insert") {
        added += 1;
      } else if (lineType === "delete") {
        removed += 1;
      } else if (lineType === "change") {
        added += 1;
        removed += 1;
      }

      current = { parts: [], hasOld: false, hasNew: false };
    };

    segments.forEach((segment, segmentIndex) => {
      const text = segment?.text ?? "";
      if (text.length === 0) {
        return;
      }
      const lines = text.split("\n");
      lines.forEach((line, lineIndex) => {
        const isLast = lineIndex === lines.length - 1;
        const isNewline = !isLast;
        const shouldAddBlank = line === "" && isNewline;
        if (line !== "" || shouldAddBlank) {
          current.parts.push({
            type: segment.type,
            text: line,
          });
          if (segment.type === "equal" || segment.type === "delete") {
            current.hasOld = true;
          }
          if (segment.type === "equal" || segment.type === "insert") {
            current.hasNew = true;
          }
        }
        if (isNewline) {
          pushLine();
        }
      });
    });

    if (current.parts.length > 0) {
      pushLine();
    }

    return { rows, added, removed };
  }, [data]);

  return (
    <>
      {showNewModal && (
        <NewActionModal
          onClose={closeNewModal}
          onDocument={onDocument}
          onFolderSelect={onFolderSelect}
        />
      )}
      {showParentPicker && (
        <FolderPickerModal
          tree={parentPickerTree}
          title={parentPickerState.title}
          subtitle={parentPickerState.subtitle}
          confirmLabel={parentPickerState.confirmLabel}
          initialSlug={parentPickerState.initialSelection}
          blockedSlug={parentPickerState.blockedSlug}
          onClose={closeParentPicker}
          onConfirm={confirmParentPicker}
        />
      )}
      {showFolderPrompt && (
        <FolderPromptModal
          folderName={folderName}
          onFolderNameChange={onFolderNameChange}
          onClose={closeFolderPrompt}
          onSave={saveFolder}
          busy={folderBusy}
          error={folderError}
          parentSlug={parentSlug}
        />
      )}
      {showAbout && selectedDoc && info && (
        <ModalShell
          title="About this document"
          onClose={closeAbout}
          className="modal-about"
        >
          <div className="stack">
            <div className="about-info-grid">
              <div className="about-info-row">
                <div className="about-info-label">Title</div>
                <div className="about-info-value">{info.title}</div>
              </div>
              <div className="about-info-row">
                <div className="about-info-label">URL</div>
                <div className="about-info-value">
                  <code>{info.url}</code>
                </div>
              </div>
              <div className="about-info-row">
                <div className="about-info-label">Status</div>
                <div className="about-info-value">{info.status}</div>
              </div>
              <div className="about-info-row">
                <div className="about-info-label">Created by</div>
                <div className="about-info-value">{info.createdBy}</div>
              </div>
              <div className="about-info-row">
                <div className="about-info-label">Created</div>
                <div className="about-info-value">{info.createdAt}</div>
              </div>
              <div className="about-info-row">
                <div className="about-info-label">Last modified</div>
                <div className="about-info-value">{info.updatedAt}</div>
              </div>
            </div>
            <div className="about-history">
              <div className="doc-related-card-header about-history-header">
                <span>History</span>
                <span className="muted">Saved revisions</span>
                {historyLoading && <span className="muted">Refreshing...</span>}
              </div>
              {historyError && <div className="muted">{historyError}</div>}
              {historyRestoreError && (
                <div className="muted">{historyRestoreError}</div>
              )}
              {!historyLoading &&
                historyEntries.length === 0 &&
                !historyError && (
                  <div className="muted">No saved revisions yet.</div>
                )}
              {historyEntries.length > 0 && (
                <div className="doc-history-list about-history-list">
                  {historyEntries.slice(0, 6).map((entry) => (
                    <div key={entry.id} className="doc-history-row">
                      <div>
                        <div className="doc-history-title">
                          {entry.note || `Version ${entry.id}`}
                        </div>
                        <div className="doc-history-meta">
                          {formatTimestamp(entry.saved_at)}
                        </div>
                      </div>
                      <div className="doc-history-actions">
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          onClick={() => onHistoryDiff && onHistoryDiff(entry)}
                          disabled={
                            historyDiffLoading &&
                            historyDiffEntryId === entry.id
                          }
                        >
                          {historyDiffEntryId === entry.id
                            ? "Diffing..."
                            : "Diff"}
                        </button>
                        {canRestoreHistory && (
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            onClick={() =>
                              onHistoryRollback && onHistoryRollback(entry)
                            }
                            disabled={historyRestoreId === entry.id}
                          >
                            {historyRestoreId === entry.id
                              ? "Restoring..."
                              : "Rollback"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ModalShell>
      )}
      {showReader && readerSelected && (
        <ReaderView
          show={showReader}
          onClose={closeReader}
          html={readerHtml}
          selectedDoc={readerSelected}
          info={readerInfo}
        />
      )}
      {overlayShow && Editor && (
        <div className="editor-fullscreen-overlay">
          <React.Suspense
            fallback={<div className="muted">Loading editor...</div>}
          >
            <Editor {...overlayProps} />
          </React.Suspense>
        </div>
      )}
      {showSettings && (
        <SettingsModal
          user={user}
          startPageSlug={startPageSlug}
          bootstrap={bootstrap}
          initialCategory={initialCategory}
          onCategoryChange={onCategoryChange}
          onClose={closeSettings}
          onSetStartPage={onSetStartPage}
          onNuke={onNuke}
          onAppIconChange={onAppIconChange}
          onAppTitleChange={onAppTitleChange}
        />
      )}
      {message && <ErrorToast onClose={closeError}>{message}</ErrorToast>}
      {showHistoryDiff && (
        <ModalShell
          title="History diff"
          onClose={closeHistoryDiff}
          className="history-diff-modal"
          maxWidth={680}
        >
          <div className="stack">
            {loading ? (
              <div className="muted">Loading diff...</div>
            ) : historyErrorMessage ? (
              <div className="muted">{historyErrorMessage}</div>
            ) : (
              <>
                <div className="history-diff-status">
                  <div className="history-diff-meta">
                    <div>
                      {data?.saved_at
                        ? `Saved at ${new Date(
                            data.saved_at
                          ).toLocaleString()}`
                        : "Saved revision"}
                    </div>
                    {data?.note && <div className="muted">{data.note}</div>}
                  </div>
                  <div className="history-diff-counts">
                    <span className="history-diff-count history-diff-insert">
                      +{diffSummary.added}
                    </span>
                    <span className="history-diff-count history-diff-delete">
                      -{diffSummary.removed}
                    </span>
                  </div>
                </div>
                <div className="history-diff-lines">
                  <div className="history-diff-header">
                    <span className="history-diff-header-gutter">
                      <span className="history-diff-header-label">
                        Original
                      </span>
                      <span className="history-diff-header-label">
                        Updated
                      </span>
                    </span>
                    <span
                      className="history-diff-header-marker"
                      aria-hidden="true"
                    >
                      {" "}
                    </span>
                    <span className="history-diff-header-label">Line</span>
                  </div>
                  {diffSummary.rows.map((row) => (
                    <div
                      key={row.key}
                      className={`history-diff-line history-diff-${row.type}`}
                    >
                      <span className="history-diff-gutter">
                        <span className="history-diff-line-num">
                          {row.oldLine ?? ""}
                        </span>
                        <span className="history-diff-line-num">
                          {row.newLine ?? ""}
                        </span>
                      </span>
                      <span className="history-diff-marker">
                        {row.type === "insert"
                          ? "+"
                          : row.type === "delete"
                          ? "-"
                          : row.type === "change"
                          ? "~"
                          : " "}
                      </span>
                      <span className="history-diff-text">
                        {row.parts.map((part, partIndex) => (
                          <span
                            key={`${row.key}-part-${partIndex}`}
                            className={`history-diff-fragment history-diff-fragment-${part.type}`}
                          >
                            {part.text === "" ? " " : part.text}
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </ModalShell>
      )}
    </>
  );
}
