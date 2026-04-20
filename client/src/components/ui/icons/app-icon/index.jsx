import React from "react";
const DEFAULT_ICON_SRC = "/brand/icon_512x512.png";
export const APP_ICON_SIZES = Object.freeze({
  compact: 32,
  brand: 72,
  preview: 112,
  default: 56
});
export default function AppIcon({
  size = APP_ICON_SIZES.default,
  src,
  alt
}) {
  const iconSrc = src || DEFAULT_ICON_SRC;
  const isCustom = Boolean(src);
  return <div className={`app-icon${isCustom ? " app-icon-custom" : ""}`} style={{
    width: size,
    height: size
  }}>
      <img className="app-icon-image" src={iconSrc} alt={alt || "Workspace icon"} />
      {!isCustom && <span className="app-icon-glow" aria-hidden="true" />}
    </div>;
}
