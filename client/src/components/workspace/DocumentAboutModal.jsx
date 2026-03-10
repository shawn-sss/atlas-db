import React from "react";
import ModalShell from "../ui/modals";
import { formatTimestamp } from "../../utils/formatters";

const ABOUT_INFO_FIELDS = [
  { label: "Title", key: "title" },
  {
    label: "URL",
    key: "url",
    render: (value) => <code>{value}</code>,
  },
  { label: "Status", key: "status" },
  { label: "Created by", key: "createdBy" },
  { label: "Created", key: "createdAt" },
  { label: "Last modified", key: "updatedAt" },
];

const MAX_VISIBLE_HISTORY_ENTRIES = 6;

export default function DocumentAboutModal({
  show,
  selectedDoc,
  info,
  onClose,
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
}) {
  if (!show || !selectedDoc || !info) {
    return null;
  }

  return (
    <ModalShell
      title="About this document"
      onClose={onClose}
      className="modal-about"
    >
      <div className="stack">
        <div className="about-info-grid">
          {ABOUT_INFO_FIELDS.map(({ label, key, render }) => {
            const value = info[key];
            return (
              <div key={key} className="about-info-row">
                <div className="about-info-label">{label}</div>
                <div className="about-info-value">
                  {render ? render(value) : value}
                </div>
              </div>
            );
          })}
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
          {!historyLoading && historyEntries.length === 0 && !historyError && (
            <div className="muted">No saved revisions yet.</div>
          )}
          {historyEntries.length > 0 && (
            <div className="doc-history-list about-history-list">
              {historyEntries
                .slice(0, MAX_VISIBLE_HISTORY_ENTRIES)
                .map((entry) => (
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
                        onClick={() => onHistoryDiff?.(entry)}
                        disabled={
                          historyDiffLoading && historyDiffEntryId === entry.id
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
                          onClick={() => onHistoryRollback?.(entry)}
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
  );
}
