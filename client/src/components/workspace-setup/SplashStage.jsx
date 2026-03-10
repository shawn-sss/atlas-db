import React from "react";
import AppBrand from "../ui/AppBrand";

const SplashStage = ({ brandTitle, brandIcon, onStageChange }) => (
  <div className="start-body splash-body">
    <div className="splash-card">
      <div className="splash-hero">
        <AppBrand
          title={brandTitle}
          subtitle="Shared knowledge base"
          iconSrc={brandIcon}
        />
        <div className="splash-title">{brandTitle}</div>
        <div className="splash-subtitle">
          <div>Few details and {brandTitle} will be ready.</div>
          <div className="splash-subtitle-bottom">
            We&apos;ll guide you through the essentials.
          </div>
        </div>
      </div>
      <div className="start-actions-row splash-actions">
        <button className="btn" onClick={() => onStageChange("welcome")}>
          Start setup
        </button>
      </div>
    </div>
  </div>
);

SplashStage.displayName = "SplashStage";

export default React.memo(SplashStage);
