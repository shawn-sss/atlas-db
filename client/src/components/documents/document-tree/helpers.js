const TREE_BASE_INDENT = 8;
const TREE_LEVEL_INDENT = 14;
export const treeIndent = level => `${TREE_BASE_INDENT + level * TREE_LEVEL_INDENT}px`;
