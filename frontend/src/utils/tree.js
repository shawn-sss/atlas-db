export const buildTree = (items, startPageSlug) => {
  const map = new Map();
  items.forEach((item) => {
    map.set(item.slug, { ...item, children: [] });
  });
  const roots = [];
  map.forEach((node) => {
    const parentSlug = node.parent_slug;
    if (parentSlug && map.has(parentSlug)) {
      map.get(parentSlug).children.push(node);
    } else {
      roots.push(node);
    }
  });
  if (startPageSlug) {
    const idx = roots.findIndex((r) => r.slug === startPageSlug);
    if (idx > 0) {
      const [r] = roots.splice(idx, 1);
      roots.unshift(r);
    } else if (idx === -1 && map.has(startPageSlug)) {
      const node = map.get(startPageSlug);
      const parent = node.parent_slug;
      if (parent && map.has(parent)) {
        const parentNode = map.get(parent);
        parentNode.children = (parentNode.children || []).filter(
          (c) => c.slug !== startPageSlug
        );
      }
      roots.unshift(node);
    }
  }

  const label = (n) => (n.title || n.slug || "").toLowerCase();
  const createdTime = (n) => {
    const v = n.created_at || n.createdAt || n.saved_at || 0;
    const t = new Date(v).getTime();
    return Number.isFinite(t) ? t : 0;
  };
  const sortNodes = (arr) => {
    arr.sort((a, b) => {
      const pinnedDiff = (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0);
      if (pinnedDiff !== 0) return pinnedDiff;
      const ta = createdTime(a);
      const tb = createdTime(b);
      if (ta || tb) {
        if (tb !== ta) return tb - ta;
      }
      return label(a).localeCompare(label(b));
    });
    arr.forEach((n) => {
      if (n.children && n.children.length) sortNodes(n.children);
    });
  };
  sortNodes(roots);

  if (startPageSlug) {
    const idx = roots.findIndex((r) => r.slug === startPageSlug);
    if (idx > 0) {
      const [r] = roots.splice(idx, 1);
      roots.unshift(r);
    }
  }
  return roots;
};

export const flattenTreeNodes = (nodes) => {
  const result = [];
  const walk = (items) => {
    (items || []).forEach((item) => {
      result.push({ slug: item.slug, title: item.title || item.slug });
      if (item.children && item.children.length) {
        walk(item.children);
      }
    });
  };
  walk(nodes);
  return result;
};

export const findNodePath = (nodes, target) => {
  for (const node of nodes) {
    if (node.slug === target) {
      return [node.slug];
    }
    if (node.children) {
      const childPath = findNodePath(node.children, target);
      if (childPath) {
        return [node.slug, ...childPath];
      }
    }
  }
  return null;
};

export const uniqueBySlug = (items) => {
  const seen = new Set();
  const result = [];
  for (const item of items || []) {
    if (!item?.slug) continue;
    if (seen.has(item.slug)) continue;
    seen.add(item.slug);
    result.push(item);
  }
  return result;
};

export const containsSlugInTree = (node, slug) => {
  if (!node || !slug) return false;
  if (node.slug === slug) return true;
  const children = node.children || [];
  for (const child of children) {
    if (containsSlugInTree(child, slug)) return true;
  }
  return false;
};
