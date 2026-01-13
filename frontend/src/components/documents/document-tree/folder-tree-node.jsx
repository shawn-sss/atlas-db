import React from "react";
import FolderToggleIcon from "../../ui/icons/icon-folder-toggle";
import DocumentTreeItem from "./document-tree-item";
import { treeIndent } from "./helpers";
import { containsSlugInTree } from "../../../utils/tree";
import { useFloatingMenu } from "../../../hooks/useFloatingMenu";
import { DocumentTreeMenuPopup, DocumentTreeMenuItems } from "./menu";

const FolderTreeNode = React.memo(
  ({
    node,
    level,
    onSelect,
    activeSlug,
    onSetStartPage,
    onRemoveStartPage,
    onTogglePin,
    onToggleHome,
    onSetStatus,
    onDelete,
    canDelete,
    onMove,
    collapsedFolders,
    onToggleFolderCollapse,
    renderNode,
  }) => {
    const showFolderToggle = true;
    const collapsed = showFolderToggle && collapsedFolders?.[node.slug];
    const directChildren = node.children || [];
    const groupActive = activeSlug
      ? containsSlugInTree(node, activeSlug)
      : false;
    const folderIsSelected = activeSlug === node.slug;
    const folderClasses = [
      "doc-tree-item",
      "doc-tree-folder-header",
      groupActive && "doc-tree-folder-header-active",
      folderIsSelected && "active",
      folderIsSelected && "doc-tree-folder-header-selected",
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
    const handleFolderHeaderKeyDown = (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        if (onSelect) {
          onSelect(node.slug);
        }
      }
    };
    const handleFolderSelect = () => {
      if (onSelect) {
        onSelect(node.slug);
      }
    };
    const handleTogglePin = wrapAction(() =>
      onTogglePin?.(node.slug, !node.is_pinned)
    );
    const handleToggleHome = wrapAction(() =>
      onToggleHome?.(node.slug, !node.is_home)
    );
    const handleToggleUnlisted = wrapAction(() => {
      const current = (node.status || "").toLowerCase();
      const nextStatus = current === "unlisted" ? "published" : "unlisted";
      onSetStatus?.(node.slug, nextStatus);
    });
    const handleDelete = wrapAction(() => onDelete?.(node.slug));
    const handleSetStart = wrapAction(() => onSetStartPage?.(node.slug));
    const handleMove = wrapAction(() => onMove?.(node));
    const headerPadding = treeIndent(level);
    return (
      <li>
        <div
          className={folderClasses}
          style={{ paddingLeft: headerPadding, position: "relative" }}
          role="button"
          tabIndex={0}
          onClick={handleFolderSelect}
          onKeyDown={handleFolderHeaderKeyDown}
          onMouseLeave={closeMenu}
        >
          <div className="doc-tree-item-content">
            <span className="doc-tree-icon">
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
            </span>
            <span className="doc-tree-title-text">
              {node.title || node.slug}
            </span>
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
                onToggleUnlisted={handleToggleUnlisted}
                onTogglePin={handleTogglePin}
                onDelete={handleDelete}
                onMove={handleMove}
              />
            </DocumentTreeMenuPopup>
          </div>
        </div>
        {!collapsed && (
          <ul
            className={`doc-tree-children${
              groupActive ? " doc-tree-children-group-active" : ""
            }`}
          >
            {directChildren.length > 0 ? (
              <>
                {directChildren.map((child) =>
                  child.is_folder ? (
                    renderNode(child, level + 1)
                  ) : (
                    <DocumentTreeItem
                      key={child.slug}
                      node={child}
                      level={level + 1}
                      onSelect={onSelect}
                      activeSlug={activeSlug}
                      onSetStartPage={onSetStartPage}
                      onRemoveStartPage={onRemoveStartPage}
                      onTogglePin={onTogglePin}
                      onToggleHome={onToggleHome}
                      onSetStatus={onSetStatus}
                      onDelete={onDelete}
                      canDelete={canDelete}
                      collapsedFolders={collapsedFolders}
                      onToggleFolderCollapse={onToggleFolderCollapse}
                    />
                  )
                )}
              </>
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

FolderTreeNode.displayName = "FolderTreeNode";

export default FolderTreeNode;
