import React from "react";

const DEFAULT_ICON_SRC = "/brand/icon_512x512.png";

export default function AppIcon({ size = 56, src, alt }) {
  const iconSrc = src || DEFAULT_ICON_SRC;
  const isCustom = Boolean(src);

  return (
    <div
      className={`app-icon${isCustom ? " app-icon-custom" : ""}`}
      style={{ width: size, height: size }}
    >
      <img
        className="app-icon-image"
        src={iconSrc}
        alt={alt || "Workspace icon"}
      />
      {!isCustom && <span className="app-icon-glow" aria-hidden="true" />}
    </div>
  );
}
