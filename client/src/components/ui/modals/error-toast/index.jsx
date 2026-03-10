import React, { useEffect } from "react";

export default function ErrorToast({ children, onClose }) {
  useEffect(() => {
    if (!onClose) return;
    const t = setTimeout(() => onClose(), 5000);
    return () => clearTimeout(t);
  }, [onClose, children]);

  return (
    <div className="error-toast" role="status" aria-live="polite">
      <div className="error-toast-body">{children}</div>
      {onClose && (
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          Dismiss
        </button>
      )}
    </div>
  );
}
