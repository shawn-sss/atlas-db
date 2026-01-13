import React from "react";
import FolderTreeNode from "./folder-tree-node";
import DocumentTreeItem from "./document-tree-item";

const DocumentTree = React.memo(
  ({
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
    onToggleFolderCollapse,
  }) => {
    if (!nodes || nodes.length === 0)
      return (
        <div className="muted" style={{ padding: "0 var(--space-md)" }}>
          No documents yet.
        </div>
      );
    const renderNode = (node, level) => {
      if (node.is_folder) {
        return (
          <FolderTreeNode
            key={node.slug}
            node={node}
            level={level}
            onSelect={onSelect}
            activeSlug={activeSlug}
            onSetStartPage={onSetStartPage}
            onRemoveStartPage={onRemoveStartPage}
            onTogglePin={onTogglePin}
            onToggleHome={onToggleHome}
            onSetStatus={onSetStatus}
            onDelete={onDelete}
            onMove={onMove}
            canDelete={canDelete}
            collapsedFolders={collapsedFolders}
            onToggleFolderCollapse={onToggleFolderCollapse}
            renderNode={renderNode}
          />
        );
      }
      return (
        <DocumentTreeItem
          key={node.slug}
          node={node}
          level={level}
          onSelect={onSelect}
          activeSlug={activeSlug}
          onSetStartPage={onSetStartPage}
          onRemoveStartPage={onRemoveStartPage}
          onTogglePin={onTogglePin}
          onToggleHome={onToggleHome}
          onSetStatus={onSetStatus}
          onDelete={onDelete}
          onMove={onMove}
          canDelete={canDelete}
          collapsedFolders={collapsedFolders}
          onToggleFolderCollapse={onToggleFolderCollapse}
        />
      );
    };
    return (
      <ul className="doc-tree">{nodes.map((node) => renderNode(node, 0))}</ul>
    );
  },
  (a, b) =>
    a.nodes === b.nodes &&
    a.activeSlug === b.activeSlug &&
    a.collapsedFolders === b.collapsedFolders
);

DocumentTree.displayName = "DocumentTree";

export default DocumentTree;
