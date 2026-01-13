export const slugToSegments = (slug) =>
  (slug || "")
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/");
export const segmentsToSlug = (s) =>
  (s || "")
    .split("/")
    .map((p) => decodeURIComponent(p))
    .join("/");

export const slugToPath = (slug) => {
  const segs = slugToSegments(slug);
  return segs ? `/doc/${segs}` : "/";
};

export const pathToSlug = (path) => {
  if (!path) return "";
  let p = path.replace(/^\/+|\/+$/g, "");
  if (!p) return "";
  if (p.startsWith("doc/")) p = p.replace(/^doc\//, "");
  try {
    return p
      .split("/")
      .map((s) => decodeURIComponent(s))
      .join("/");
  } catch {
    return p;
  }
};

export const parseSearchParams = (search) => {
  const params = new URLSearchParams(search || "");
  const q = params.get("q") || "";
  const section = params.get("section") || null;
  const statusParam = params.get("status") || "";
  const statuses = statusParam
    ? statusParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  return { q, section, statuses };
};

export const buildSearchString = ({ q, section, statuses }) => {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (section) params.set("section", section);
  if (statuses && statuses.length) params.set("status", statuses.join(","));
  const s = params.toString();
  return s ? `?${s}` : "";
};

export const parseLocation = (location) => {
  const p = location && location.pathname ? location.pathname : "/";
  const { q, section, statuses } = parseSearchParams(
    location && location.search ? location.search : ""
  );

  if (p === "/welcome") return { type: "welcome" };
  if (p === "/setup") return { type: "setup" };

  if (p.startsWith("/settings")) {
    const cat = p.replace(/^\/settings\/?/, "") || "account";
    return { type: "settings", category: cat };
  }

  if (p === "/new" || p === "/editor/new") {
    return { type: "editor-new", legacy: p === "/new" };
  }

  if (p === "/new/folder" || p === "/new-folder") return { type: "newFolder" };
  if (p.startsWith("/about/")) {
    const maybe = p.replace(/^\/about\/?/, "");
    const slug = pathToSlug(maybe);
    if (slug) return { type: "about", slug };
  }

  if (p.startsWith("/history/")) {
    const maybe = p.replace(/^\/history\/?/, "");
    const slug = pathToSlug(maybe);
    if (slug)
      return { type: "history", slug, params: { q, section, statuses } };
  }

  if (p.startsWith("/edit")) {
    const maybe = p.replace(/^\/edit\/?/, "");
    const slug = pathToSlug(maybe);
    if (slug) return { type: "edit", slug };
  }

  if (p.startsWith("/doc/")) {
    const maybe = p.replace(/^\/doc\/?/, "");
    const slug = pathToSlug(maybe);
    if (slug) return { type: "doc", slug };
  }

  const legacy = pathToSlug(p);
  if (legacy) return { type: "doc", slug: legacy, canonicalize: true };

  return { type: "root" };
};

export const navigate = (url, { replace = false, state = {} } = {}) => {
  try {
    if (replace) window.history.replaceState(state, "", url);
    else window.history.pushState(state, "", url);
  } catch (e) {
    console.warn("[router] navigation failed", e);
  }
};

export const isReservedPath = (path) => {
  if (!path) return false;
  return /^\/(settings|edit|about|history|new|editor|welcome|setup)(\/|$)/.test(
    path
  );
};
