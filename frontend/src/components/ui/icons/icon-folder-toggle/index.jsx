import React from "react";
import IconFolder from "../icon-folder";
import IconStar from "../icon-star";
import IconPin from "../icon-pin";

export default function IconFolderToggle({ collapsed, isPinned, isStart }) {
  return (
    <span className="doc-tree-folder-icon" aria-hidden>
      <IconFolder size={16} />
      <span
        className={`doc-tree-folder-caret${
          collapsed ? " doc-tree-folder-caret-collapsed" : ""
        }`}
      >
        <svg width="8" height="8" viewBox="0 0 24 24">
          <path
            d="M7 10l5 5 5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {isStart ? (
        <span className="doc-tree-folder-badge">
          <IconStar size={10} />
        </span>
      ) : isPinned ? (
        <span className="doc-tree-folder-badge">
          <IconPin size={10} />
        </span>
      ) : null}
    </span>
  );
}
