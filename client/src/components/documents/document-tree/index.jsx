import React, { useEffect, useRef } from "react";
import FolderTreeNode from "./folder-tree-node";
import DocumentTreeItem from "./document-tree-item";
const DocumentTree = React.memo(function DocumentTree({
  nodes,
  onSelect,
  activeSlug,
  onSetStartPage,
  onRemoveStartPage,
  onTogglePin,
  onToggleHome,
  onSetStatus,
  onDelete,
  onMove,
  canDelete = false,
  collapsedFolders = {},
  onToggleFolderCollapse
}) {
  const treeRef = useRef(null);
  useEffect(() => {
    if (typeof window === "undefined" || !activeSlug) return;
    const container = treeRef.current;
    if (!container) return;
    const frameId = window.requestAnimationFrame(() => {
      const activeItem = container.querySelector(".doc-tree-item.active");
      if (!(activeItem instanceof HTMLElement)) return;
      activeItem.scrollIntoView({
        block: "nearest"
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [activeSlug, nodes]);
  if (!nodes || nodes.length === 0) {
    return <div className="muted" style={{
      padding: "0 var(--space-md)"
    }}>
        No documents yet.
      </div>;
  }
  const renderNode = (node, level) => {
    if (node.is_folder) {
      return <FolderTreeNode key={node.slug} node={node} level={level} onSelect={onSelect} activeSlug={activeSlug} onSetStartPage={onSetStartPage} onRemoveStartPage={onRemoveStartPage} onTogglePin={onTogglePin} onToggleHome={onToggleHome} onSetStatus={onSetStatus} onDelete={onDelete} onMove={onMove} canDelete={canDelete} collapsedFolders={collapsedFolders} onToggleFolderCollapse={onToggleFolderCollapse} renderNode={renderNode} />;
    }
    return <DocumentTreeItem key={node.slug} node={node} level={level} originLabel={node.originLabel} onSelect={onSelect} activeSlug={activeSlug} onSetStartPage={onSetStartPage} onRemoveStartPage={onRemoveStartPage} onTogglePin={onTogglePin} onToggleHome={onToggleHome} onSetStatus={onSetStatus} onDelete={onDelete} onMove={onMove} canDelete={canDelete} />;
  };
  return <ul className="doc-tree" ref={treeRef}>
      {nodes.map(node => renderNode(node, 0))}
    </ul>;
});
DocumentTree.displayName = "DocumentTree";
export default DocumentTree;
