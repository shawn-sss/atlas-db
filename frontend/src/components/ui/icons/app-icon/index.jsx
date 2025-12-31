import React from "react";

export default function AppIcon({ size = 56, src, alt }) {
  return (
    <div
      className={`app-icon${src ? " app-icon-custom" : ""}`}
      style={{ width: size, height: size }}
    >
      {src ? (
        <img
          className="app-icon-image"
          src={src}
          alt={alt || "Workspace icon"}
        />
      ) : (
        <span className="app-icon-glow" aria-hidden="true" />
      )}
    </div>
  );
}
