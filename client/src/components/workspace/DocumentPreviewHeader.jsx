import React from "react";

export default function DocumentPreviewHeader({
  selectedDoc,
  onShowAbout,
  onEdit,
  onOpenReader,
}) {
  return (
    <div className="doc-preview-header">
      <div>
        <h2 className="doc-preview-title">
          {selectedDoc?.title || selectedDoc?.slug}
        </h2>
      </div>
      <div className="doc-preview-header-actions">
        <button className="btn btn-ghost" type="button" onClick={onOpenReader}>
          Reader
        </button>
        <button className="btn btn-ghost" type="button" onClick={onShowAbout}>
          About
        </button>
        <button className="btn" type="button" onClick={onEdit}>
          Edit
        </button>
      </div>
    </div>
  );
}
