import React from "react";
import NewActionModal from "../ui/modals/new-action-modal";
import FolderPromptModal from "../ui/modals/folder-prompt-modal";
import FolderPickerModal from "../ui/modals/folder-picker-modal";
import SettingsModal from "../ui/modals/settings-modal";
import ErrorToast from "../ui/modals/error-toast";
import ReaderView from "../documents/document-reader";
import DocumentAboutModal from "./DocumentAboutModal";
import HistoryDiffModal from "./HistoryDiffModal";
export default function WorkspaceModals({
  newModal = {},
  folderPrompt = {},
  parentPicker = {},
  aboutModal = {},
  readerModal = {},
  editorOverlay = {},
  settings = {},
  error = {},
  historyDiff = {}
}) {
  const {
    show: overlayShow,
    component: Editor,
    props: overlayProps = {}
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
    canRestoreHistory
  } = aboutModal;
  const {
    show: showReader,
    selectedDoc: readerSelected,
    html: readerHtml,
    info: readerInfo,
    onClose: closeReader
  } = readerModal;
  const {
    show: showNewModal,
    onClose: closeNewModal,
    onDocument,
    onFolderSelect
  } = newModal;
  const {
    show: showParentPicker,
    tree: parentPickerTree = [],
    state: parentPickerState = {},
    onClose: closeParentPicker,
    onConfirm: confirmParentPicker
  } = parentPicker;
  const {
    show: showFolderPrompt,
    folderName,
    onFolderNameChange,
    onClose: closeFolderPrompt,
    onSave: saveFolder,
    busy: folderBusy,
    error: folderError,
    parentSlug
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
    onAppTitleChange
  } = settings;
  const {
    message,
    onClose: closeError
  } = error;
  const {
    show: showHistoryDiff,
    data,
    loading,
    error: historyErrorMessage,
    onClose: closeHistoryDiff
  } = historyDiff;
  return <>
      {showNewModal && <NewActionModal onClose={closeNewModal} onDocument={onDocument} onFolderSelect={onFolderSelect} />}
      {showParentPicker && <FolderPickerModal tree={parentPickerTree} title={parentPickerState.title} subtitle={parentPickerState.subtitle} confirmLabel={parentPickerState.confirmLabel} initialSlug={parentPickerState.initialSelection} blockedSlug={parentPickerState.blockedSlug} onClose={closeParentPicker} onConfirm={confirmParentPicker} />}
      {showFolderPrompt && <FolderPromptModal folderName={folderName} onFolderNameChange={onFolderNameChange} onClose={closeFolderPrompt} onSave={saveFolder} busy={folderBusy} error={folderError} parentSlug={parentSlug} />}
      <DocumentAboutModal show={showAbout} selectedDoc={selectedDoc} info={info} onClose={closeAbout} historyEntries={historyEntries} historyLoading={historyLoading} historyError={historyError} historyRestoreError={historyRestoreError} historyRestoreId={historyRestoreId} historyDiffLoading={historyDiffLoading} historyDiffEntryId={historyDiffEntryId} onHistoryDiff={onHistoryDiff} onHistoryRollback={onHistoryRollback} canRestoreHistory={canRestoreHistory} />
      {showReader && readerSelected && <ReaderView show={showReader} onClose={closeReader} html={readerHtml} selectedDoc={readerSelected} info={readerInfo} />}
      {overlayShow && Editor && <div className="editor-fullscreen-overlay">
          <React.Suspense fallback={<div className="editor-overlay-placeholder" aria-hidden="true" />}>
            <Editor {...overlayProps} />
          </React.Suspense>
        </div>}
      {showSettings && <SettingsModal user={user} startPageSlug={startPageSlug} bootstrap={bootstrap} initialCategory={initialCategory} onCategoryChange={onCategoryChange} onClose={closeSettings} onSetStartPage={onSetStartPage} onNuke={onNuke} onAppIconChange={onAppIconChange} onAppTitleChange={onAppTitleChange} />}
      {message && <ErrorToast onClose={closeError}>{message}</ErrorToast>}
      <HistoryDiffModal show={showHistoryDiff} data={data} loading={loading} error={historyErrorMessage} onClose={closeHistoryDiff} />
    </>;
}
