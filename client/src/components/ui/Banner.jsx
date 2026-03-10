import React from "react";

export default function Banner({ tone = "info", children, onClose }) {
  return (
    <div className={`banner banner-${tone}`} role="status">
      <div className="banner-body">{children}</div>
      {onClose && (
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          Dismiss
        </button>
      )}
    </div>
  );
}
