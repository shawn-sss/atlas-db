import React from "react";
import AppIcon from "./icons/app-icon";
import { DEFAULT_APP_TITLE } from "../../constants/defaults";

export default function AppBrand({
  compact = false,
  title = DEFAULT_APP_TITLE,
  subtitle = "Document knowledge base",
  iconSrc,
}) {
  return (
    <div className={`brand${compact ? " brand-compact" : ""}`}>
      <AppIcon size={compact ? 38 : 58} src={iconSrc} alt={`${title} icon`} />
      {!compact && (
        <div className="brand-text">
          <div className="brand-title">{title}</div>
          <div className="brand-sub">{subtitle}</div>
        </div>
      )}
    </div>
  );
}
