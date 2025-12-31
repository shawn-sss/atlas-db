import React, { useEffect, useMemo, useState } from "react";
import ModalShell from "..";
import { containsSlugInTree } from "../../../../utils/tree";

export default function FolderPickerModal({
  tree = [],
  initialSlug = "",
  blockedSlug = null,
  title = "Choose location",
  subtitle = "Pick a folder that should contain the document.",
  confirmLabel = "Select folder",
  onClose,
  onConfirm,
}) {
  const [selected, setSelected] = useState(initialSlug || "");

  useEffect(() => {
    setSelected(initialSlug || "");
  }, [initialSlug]);

  const isRootBlocked = blockedSlug === "";
  const hasFolders = useMemo(() => {
    let found = false;
    const walk = (items) => {
      (items || []).forEach((item) => {
        if (item?.is_folder) {
          found = true;
        }
        if (item?.children && item.children.length) {
          walk(item.children);
        }
      });
    };
    walk(tree);
    return found;
  }, [tree]);

  const shouldDisable = (node) => {
    if (!blockedSlug) return false;
    if (node.slug === blockedSlug) return true;
    return containsSlugInTree(node, blockedSlug);
  };

  const renderNode = (node, level = 0) => {
    if (!node?.is_folder) return null;
    const disabled = shouldDisable(node);
    const isSelected = selected === node.slug;
    return (
      <React.Fragment key={node.slug}>
        <button
          type="button"
          className={`folder-picker-row${isSelected ? " selected" : ""}${
            disabled ? " disabled" : ""
          }`}
          style={{ paddingLeft: 12 + level * 16 }}
          onClick={() => {
            if (disabled) return;
            setSelected(node.slug);
          }}
          disabled={disabled}
        >
          <span className="folder-picker-label">{node.title || node.slug}</span>
        </button>
        {(node.children || []).map((child) => renderNode(child, level + 1))}
      </React.Fragment>
    );
  };

  const handleConfirm = () => {
    if (typeof onConfirm === "function") {
      onConfirm(selected || "");
    }
  };

  const footer = (
    <div className="folder-picker-footer">
      <button className="btn btn-ghost" type="button" onClick={onClose}>
        Back
      </button>
      <button className="btn btn-primary" type="button" onClick={handleConfirm}>
        {confirmLabel}
      </button>
    </div>
  );

  return (
    <ModalShell
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={footer}
      className="modal-folder-picker"
    >
      <div className="folder-picker">
        <button
          type="button"
          className={`folder-picker-row${selected === "" ? " selected" : ""}${
            isRootBlocked ? " disabled" : ""
          }`}
          onClick={() => {
            if (isRootBlocked) return;
            setSelected("");
          }}
          disabled={isRootBlocked}
        >
          <span className="folder-picker-label">Root</span>
        </button>
        <div className="folder-picker-list">
          {!hasFolders ? (
            <div className="folder-picker-empty">No folders yet.</div>
          ) : (
            tree.map((node) => renderNode(node, 0))
          )}
        </div>
      </div>
    </ModalShell>
  );
}
