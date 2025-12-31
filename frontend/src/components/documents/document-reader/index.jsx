import React, { useEffect } from "react";
import ModalShell from "../../ui/modals";

export default function ReaderView({
  show = false,
  onClose = () => {},
  html = "",
  selectedDoc = null,
  info = null,
}) {
  useEffect(() => {
    if (!show) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, onClose]);

  if (!show) return null;

  const metadata = [
    { label: "By", value: info?.createdBy },
    { label: "Last updated", value: info?.updatedAt },
    { label: "Status", value: info?.status },
  ].filter((item) => Boolean(item.value));

  return (
    <ModalShell
      title={selectedDoc?.title || "Reader"}
      onClose={onClose}
      className="modal-reader"
      backdropClassName="modal-reader-backdrop"
      hideClose
    >
      <div className="reader-shell" role="document">
        <button
          className="btn btn-ghost reader-close-btn"
          type="button"
          onClick={onClose}
        >
          Close
        </button>
        <div className="reader-mode-chip">READER MODE</div>
        <div className="reader-header">
          <div className="reader-header-content">
            {selectedDoc?.title && (
              <h2 className="reader-title">{selectedDoc.title}</h2>
            )}
            {metadata.length > 0 && (
              <div className="reader-meta-chips">
                {metadata.map((item) => (
                  <div className="reader-meta-chip" key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="reader-body">
          <article
            className="reader-article"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </ModalShell>
  );
}
