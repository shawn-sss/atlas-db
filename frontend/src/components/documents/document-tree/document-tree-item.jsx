import React from "react";
import FolderToggleIcon from "../../ui/icons/icon-folder-toggle";
import IconDoc from "../../ui/icons/icon-doc";
import IconPinnedDoc from "../../ui/icons/icon-pinned-doc";
import IconStartDoc from "../../ui/icons/icon-start-doc";
import { treeIndent } from "./helpers";
import { normalizeStatus } from "../../../utils/formatters";
import { useFloatingMenu } from "../../../hooks/useFloatingMenu";
import { DocumentTreeMenuPopup, DocumentTreeMenuItems } from "./menu";

const DocumentTreeItem = React.memo(
  ({
    node,
    onSelect,
    activeSlug,
    level,
    onSetStartPage,
    onRemoveStartPage,
    onTogglePin,
    onToggleHome,
    onDelete,
    canDelete,
    onMove,
    collapsedFolders = {},
    onToggleFolderCollapse,
    isLinked,
    originLabel,
  }) => {
    const isActive = activeSlug === node.slug;
    const isFolder = !!node.is_folder;
    const hasChildren = node.children && node.children.length > 0;
    const showFolderToggle = isFolder;
    const collapsed =
      showFolderToggle && collapsedFolders && collapsedFolders[node.slug];
    const isParentOpen = showFolderToggle && hasChildren && !collapsed;
    const itemClasses = [
      "doc-tree-item",
      isActive && "active",
      isLinked && "doc-tree-item-linked",
      isParentOpen && "doc-tree-item-parent-open",
    ]
      .filter(Boolean)
      .join(" ");
    const {
      menuOpen,
      menuStyle,
      menuBtnRef,
      toggleMenu,
      wrapAction,
      closeMenu,
    } = useFloatingMenu();
    const handleFolderToggle = (ev) => {
      ev.stopPropagation();
      if (onToggleFolderCollapse) {
        onToggleFolderCollapse(node.slug);
      }
    };
    const handleSetStart = wrapAction(() => onSetStartPage?.(node.slug));
    const handleRemoveStart = wrapAction(() => onRemoveStartPage?.());
    const handleTogglePin = wrapAction(() =>
      onTogglePin?.(node.slug, !node.is_pinned)
    );
    const handleToggleHome = wrapAction(() =>
      onToggleHome?.(node.slug, !node.is_home)
    );
    const handleDelete = wrapAction(() => onDelete?.(node.slug));
    const handleMove = wrapAction(() => onMove?.(node));
    const handleRowClick = (ev) => {
      if (ev) {
        ev.stopPropagation();
      }
      if (onSelect) {
        onSelect(node.slug);
      }
    };
    const handleRowKeyDown = (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        handleRowClick(ev);
      }
    };
    const normalizedStatus = normalizeStatus((node.status || "").toLowerCase());
    const showStatusDot = normalizedStatus === "unlisted";
    return (
      <li>
        <div
          className={itemClasses}
          style={{ paddingLeft: treeIndent(level), position: "relative" }}
          onClick={handleRowClick}
          onKeyDown={handleRowKeyDown}
          onMouseLeave={closeMenu}
          role="button"
          tabIndex={0}
        >
          <div className="doc-tree-item-content">
            <span className="doc-tree-icon">
              {showFolderToggle ? (
                <button
                  type="button"
                  className={`doc-tree-folder-toggle${
                    collapsed ? " doc-tree-folder-toggle-collapsed" : ""
                  }`}
                  onClick={handleFolderToggle}
                  aria-pressed={!collapsed}
                  aria-label={
                    collapsed
                      ? "Expand folder section"
                      : "Collapse folder section"
                  }
                >
                  <FolderToggleIcon
                    collapsed={collapsed}
                    isPinned={node.is_pinned}
                    isStart={node.is_start_page}
                  />
                </button>
              ) : (
                <span className="doc-tree-icon-inner">
                  {node.is_start_page ? (
                    <IconStartDoc size={14} />
                  ) : node.is_pinned ? (
                    <IconPinnedDoc size={14} />
                  ) : (
                    <IconDoc size={14} />
                  )}
                </span>
              )}
            </span>
            <span className="doc-tree-title-text">
              {node.title || node.slug}
              {showStatusDot && (
                <span
                  className={`doc-tree-status-dot doc-tree-status-dot-${normalizedStatus}`}
                  aria-label={normalizedStatus}
                />
              )}
            </span>
            {originLabel && (
              <span className="doc-tree-origin">{originLabel}</span>
            )}
          </div>

          <div className="doc-tree-actions">
            <button
              ref={menuBtnRef}
              className="doc-tree-menu-btn"
              onClick={toggleMenu}
              aria-haspopup="true"
              aria-expanded={menuOpen}
              title="More actions"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden
              >
                <circle cx="12" cy="5" r="1.5" fill="currentColor" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                <circle cx="12" cy="19" r="1.5" fill="currentColor" />
              </svg>
            </button>
            <DocumentTreeMenuPopup menuOpen={menuOpen} menuStyle={menuStyle}>
              <DocumentTreeMenuItems
                node={node}
                canDelete={canDelete}
                onSetStartPage={handleSetStart}
                onToggleHome={handleToggleHome}
                onTogglePin={handleTogglePin}
                onDelete={handleDelete}
                onMove={handleMove}
                onRemoveStartPage={
                  node.is_start_page ? handleRemoveStart : undefined
                }
              />
            </DocumentTreeMenuPopup>
          </div>
        </div>

        {isFolder && !collapsed && (
          <ul className="doc-tree-children">
            {node.children && node.children.length > 0 ? (
              node.children.map((child) => (
                <DocumentTreeItem
                  key={child.slug}
                  node={child}
                  onSelect={onSelect}
                  activeSlug={activeSlug}
                  level={level + 1}
                  onSetStartPage={onSetStartPage}
                  onRemoveStartPage={onRemoveStartPage}
                  onTogglePin={onTogglePin}
                  onToggleHome={onToggleHome}
                  onDelete={onDelete}
                  canDelete={canDelete}
                  collapsedFolders={collapsedFolders}
                  onToggleFolderCollapse={onToggleFolderCollapse}
                />
              ))
            ) : (
              <li
                className="doc-tree-empty-note"
                style={{ paddingLeft: treeIndent(level + 1) }}
              >
                <div className="muted">No items in this folder.</div>
              </li>
            )}
          </ul>
        )}
      </li>
    );
  },
  (a, b) =>
    a.node === b.node &&
    a.activeSlug === b.activeSlug &&
    a.collapsedFolders === b.collapsedFolders
);

DocumentTreeItem.displayName = "DocumentTreeItem";

export default DocumentTreeItem;
