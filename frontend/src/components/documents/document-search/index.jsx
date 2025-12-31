import React from "react";

export default function DocumentSearch({
  documentQuery,
  onQueryChange,
  filteredLinks,
  onInsert,
  documentInsertMode,
  onClose,
}) {
  return (
    <div className="document-search">
      <div className="document-search-header">
        <div className="muted">Insert document link</div>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <input
        className="input"
        placeholder="Search pages or articles"
        value={documentQuery}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      <div className="document-search-body">
        {Array.isArray(filteredLinks) && filteredLinks.length === 0 && (
          <div className="muted">No matches</div>
        )}
        {(Array.isArray(filteredLinks) ? filteredLinks : []).map((l) => (
          <button
            key={l.slug}
            className="document-search-row"
            type="button"
            onClick={() => onInsert(l.slug, documentInsertMode === "embed")}
          >
            <div>
              <div className="list-title">{l.title || l.slug}</div>
              <div className="list-sub">{l.slug}</div>
            </div>
            <div className="chip" style={{ fontSize: 12 }}>
              {l.type}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
