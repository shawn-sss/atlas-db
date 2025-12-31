import React from "react";
import AppBrand from "../../ui/AppBrand";

export default function AuthCanvas({
  title,
  description,
  brandTitle,
  brandSubtitle,
  brandIcon,
  children,
}) {
  return (
    <div className="start-shell">
      <div className="start-inner">
        <div className="start-topbar">
          <div className="start-brand-header"></div>
        </div>

        <div className="start-body">
          <div className="start-main">
            <div className="start-auth-panel">
              {(title || description) && (
                <div className="auth-hero">
                  <div className="auth-hero-brand">
                    <AppBrand
                      title={brandTitle}
                      subtitle={brandSubtitle}
                      iconSrc={brandIcon}
                    />
                  </div>
                  {title && <div className="auth-hero-title">{title}</div>}
                  {description && (
                    <div className="auth-hero-sub">{description}</div>
                  )}
                </div>
              )}
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
