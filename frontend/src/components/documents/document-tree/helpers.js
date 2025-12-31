export const TREE_BASE_INDENT = 8;
export const TREE_LEVEL_INDENT = 14;

export const treeIndent = (level) =>
  `${TREE_BASE_INDENT + level * TREE_LEVEL_INDENT}px`;
