import React from "react";
const buildMenuStyle = (menuOpen, menuStyle) => {
  const baseStyle = {
    display: menuOpen ? undefined : "none"
  };
  if (!menuStyle) return baseStyle;
  return {
    ...baseStyle,
    position: "fixed",
    left: `${menuStyle.left}px`,
    right: "auto",
    top: `${menuStyle.top}px`,
    transform: "none",
    zIndex: 9999,
    minWidth: 150,
    maxWidth: 380,
    width: "auto",
    boxSizing: "border-box",
    whiteSpace: "nowrap"
  };
};
const getHomeActionProps = node => {
  const disabled = Boolean(node?.is_start_page && node?.is_home);
  const label = node?.is_home ? node.is_start_page ? "Start page stays in Home" : "Leave in Library only" : "Add to Home";
  const title = disabled ? "Set a different start page before changing this item's Home state." : undefined;
  return {
    label,
    disabled,
    title
  };
};
const getUnlistedActionProps = node => {
  const disabled = Boolean(node?.is_start_page);
  const label = disabled ? "Start page must stay published" : (node?.status || "").toLowerCase() === "unlisted" ? "Return to Library" : "Send to Unlisted";
  const title = disabled ? "Set a different start page before moving this item to Unlisted." : undefined;
  return {
    label,
    disabled,
    title
  };
};
export const DocumentTreeMenuPopup = React.memo(({
  menuOpen,
  menuStyle,
  menuRef,
  children
}) => <div ref={menuRef} className={`doc-tree-menu ${menuOpen ? "open" : ""}`} onClick={e => e.stopPropagation()} style={buildMenuStyle(menuOpen, menuStyle)}>
      {children}
    </div>);
DocumentTreeMenuPopup.displayName = "DocumentTreeMenuPopup";
export const DocumentTreeMenuItems = React.memo(({
  node,
  canDelete,
  onSetStartPage,
  onToggleHome,
  onToggleUnlisted,
  onTogglePin,
  onDelete,
  onRemoveStartPage,
  onMove
}) => {
  const {
    label: homeActionLabel,
    disabled: homeActionDisabled,
    title: homeActionTitle
  } = getHomeActionProps(node);
  const {
    label: unlistedActionLabel,
    disabled: unlistedActionDisabled,
    title: unlistedActionTitle
  } = getUnlistedActionProps(node);
  const isDraft = (node?.status || "").toLowerCase() === "draft";
  const allowDraftDelete = canDelete || isDraft;
  if (isDraft) {
    return <>
          {allowDraftDelete && <button className="doc-tree-menu-item" onClick={onDelete}>
              Delete permanently
            </button>}
        </>;
  }
  return <>
        {!node?.is_start_page && <button className="doc-tree-menu-item" onClick={onSetStartPage}>
            Set as Start Page
          </button>}
        <button className="doc-tree-menu-item" onClick={homeActionDisabled ? undefined : onToggleHome} disabled={homeActionDisabled} title={homeActionTitle}>
          {homeActionLabel}
        </button>
        {onToggleUnlisted && <button className="doc-tree-menu-item" onClick={unlistedActionDisabled ? undefined : onToggleUnlisted} disabled={unlistedActionDisabled} title={unlistedActionTitle}>
            {unlistedActionLabel}
          </button>}
        <button className="doc-tree-menu-item" onClick={onTogglePin}>
          {node?.is_pinned ? "Unpin from quick access" : "Pin to quick access"}
        </button>
        {onMove && <button className="doc-tree-menu-item" onClick={onMove}>
            Move to another folder
          </button>}
        {onRemoveStartPage && node?.is_start_page && <button className="doc-tree-menu-item" onClick={onRemoveStartPage}>
            Remove start page
          </button>}
        {canDelete && !node?.is_start_page && <button className="doc-tree-menu-item" onClick={onDelete}>
            Delete permanently
          </button>}
      </>;
});
DocumentTreeMenuItems.displayName = "DocumentTreeMenuItems";
