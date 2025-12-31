export const cleanSlug = (slug) =>
  slug ? slug.trim().replace(/\.md$/, "").replace(/\\/g, "/") : "";
export const slugify = (raw) => {
  const base = (raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9/_ -]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "");
  return base || "untitled";
};
export const decodeSlug = (slug) => {
  if (!slug) return "";
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
};
