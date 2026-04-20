import React from "react";
import IconDoc from "../../ui/icons/icon-doc";
import IconPinnedDoc from "../../ui/icons/icon-pinned-doc";
import IconStartDoc from "../../ui/icons/icon-start-doc";
import { treeIndent } from "./helpers";
import { useFloatingMenu } from "../../../hooks/useFloatingMenu";
import { DocumentTreeMenuPopup, DocumentTreeMenuItems } from "./menu";
const DocumentTreeItem = React.memo(function DocumentTreeItem({
  node,
  onSelect,
  activeSlug,
  level,
  onSetStartPage,
  onRemoveStartPage,
  onTogglePin,
  onToggleHome,
  onSetStatus,
  onDelete,
  canDelete,
  onMove,
  isLinked,
  originLabel
}) {
  const isActive = activeSlug === node.slug;
  const itemClasses = ["doc-tree-item", isActive && "active", isLinked && "doc-tree-item-linked"].filter(Boolean).join(" ");
  const {
    menuOpen,
    menuStyle,
    menuBtnRef,
    menuRef,
    toggleMenu,
    wrapAction
  } = useFloatingMenu();
  const handleSetStart = wrapAction(() => onSetStartPage?.(node.slug));
  const handleRemoveStart = wrapAction(() => onRemoveStartPage?.());
  const handleTogglePin = wrapAction(() => onTogglePin?.(node.slug, !node.is_pinned));
  const handleToggleHome = wrapAction(() => onToggleHome?.(node.slug, !node.is_home));
  const handleToggleUnlisted = wrapAction(() => {
    const current = (node.status || "").toLowerCase();
    const nextStatus = current === "unlisted" ? "published" : "unlisted";
    onSetStatus?.(node.slug, nextStatus);
  });
  const handleDelete = wrapAction(() => onDelete?.(node.slug));
  const handleMove = wrapAction(() => onMove?.(node));
  const handleRowClick = event => {
    event?.stopPropagation();
    onSelect?.(node.slug);
  };
  const handleRowKeyDown = event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleRowClick(event);
    }
  };
  return <li>
      <div className={itemClasses} style={{
      paddingLeft: treeIndent(level),
      position: "relative"
    }} onClick={handleRowClick} onKeyDown={handleRowKeyDown} role="button" tabIndex={0}>
        <div className="doc-tree-item-content">
          <span className="doc-tree-icon">
            <span className="doc-tree-icon-inner">
              {node.is_start_page ? <IconStartDoc size={14} /> : node.is_pinned ? <IconPinnedDoc size={14} /> : <IconDoc size={14} />}
            </span>
          </span>
          <span className="doc-tree-title-text">{node.title || node.slug}</span>
          {originLabel && <span className="doc-tree-origin">{originLabel}</span>}
        </div>

        <div className="doc-tree-actions">
          <button ref={menuBtnRef} className="doc-tree-menu-btn" onClick={toggleMenu} aria-haspopup="true" aria-expanded={menuOpen} title="More actions">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
              <circle cx="12" cy="5" r="1.5" fill="currentColor" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" />
              <circle cx="12" cy="19" r="1.5" fill="currentColor" />
            </svg>
          </button>
          <DocumentTreeMenuPopup menuOpen={menuOpen} menuStyle={menuStyle} menuRef={menuRef}>
            <DocumentTreeMenuItems node={node} canDelete={canDelete} onSetStartPage={handleSetStart} onToggleHome={handleToggleHome} onToggleUnlisted={handleToggleUnlisted} onTogglePin={handleTogglePin} onDelete={handleDelete} onMove={handleMove} onRemoveStartPage={node.is_start_page ? handleRemoveStart : undefined} />
          </DocumentTreeMenuPopup>
        </div>
      </div>
    </li>;
});
DocumentTreeItem.displayName = "DocumentTreeItem";
export default DocumentTreeItem;
