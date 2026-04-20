import React from "react";
import ModalShell from "../ui/modals";
import { buildHistoryDiffSummary, getHistoryDiffMarker } from "../../utils/historyDiff";
import { formatTimestamp } from "../../utils/formatters";
export default function HistoryDiffModal({
  show,
  data,
  loading,
  error,
  onClose
}) {
  const diffSummary = React.useMemo(() => buildHistoryDiffSummary(data?.segments || []), [data?.segments]);
  if (!show) {
    return null;
  }
  return <ModalShell title="History diff" onClose={onClose} className="history-diff-modal" maxWidth={680}>
      <div className="stack">
        {loading ? <div className="muted">Loading diff...</div> : error ? <div className="muted">{error}</div> : <>
            <div className="history-diff-status">
              <div className="history-diff-meta">
                <div>
                  {data?.saved_at ? `Saved at ${formatTimestamp(data.saved_at)}` : "Saved revision"}
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
                  <span className="history-diff-header-label">Original</span>
                  <span className="history-diff-header-label">Updated</span>
                </span>
                <span className="history-diff-header-marker" aria-hidden="true">
                  {" "}
                </span>
                <span className="history-diff-header-label">Line</span>
              </div>
              {diffSummary.rows.map(row => <div key={row.key} className={`history-diff-line history-diff-${row.type}`}>
                  <span className="history-diff-gutter">
                    <span className="history-diff-line-num">
                      {row.oldLine ?? ""}
                    </span>
                    <span className="history-diff-line-num">
                      {row.newLine ?? ""}
                    </span>
                  </span>
                  <span className="history-diff-marker">
                    {getHistoryDiffMarker(row.type)}
                  </span>
                  <span className="history-diff-text">
                    {row.parts.map((part, partIndex) => <span key={`${row.key}-part-${partIndex}`} className={`history-diff-fragment history-diff-fragment-${part.type}`}>
                        {part.text === "" ? " " : part.text}
                      </span>)}
                  </span>
                </div>)}
            </div>
          </>}
      </div>
    </ModalShell>;
}
