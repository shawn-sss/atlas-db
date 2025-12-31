import React from "react";

export default function ModalShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  onClose,
  closeLabel = "X",
  closeAriaLabel = "Close dialog",
  hideClose = false,
  className = "",
  backdropClassName = "",
  maxWidth,
  headerActions,
}) {
  const style = maxWidth ? { maxWidth } : undefined;
  const label = title || eyebrow || subtitle || "Dialog";
  return (
    <div
      className={`modal-backdrop ${backdropClassName}`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`modal modal-shell ${className}`}
        style={style}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="surface-shell-header">
          <div>
            {eyebrow && <div className="content-eyebrow">{eyebrow}</div>}
            {title && (
              <h3 className="content-title" style={{ margin: 0 }}>
                {title}
              </h3>
            )}
            {subtitle && (
              <div className="surface-shell-subtitle">{subtitle}</div>
            )}
          </div>
          <div className="surface-shell-header-actions">
            {headerActions}
            {!hideClose && onClose && (
              <button
                className="btn btn-ghost"
                type="button"
                onClick={onClose}
                aria-label={closeAriaLabel}
              >
                {closeLabel}
              </button>
            )}
          </div>
        </div>
        <div className="surface-shell-body">{children}</div>
        {footer && <div className="surface-shell-footer">{footer}</div>}
      </div>
    </div>
  );
}
