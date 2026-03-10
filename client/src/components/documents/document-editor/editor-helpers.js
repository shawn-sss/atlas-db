export function parseContent(markdown, fallbackTitle = "") {
  const src = typeof markdown === "string" ? markdown : "";
  const lines = src.split(/\r?\n/);
  const first = (lines[0] || "").trim();
  if (first.startsWith("# ")) {
    const title = first.replace(/^#\s+/, "").trim() || fallbackTitle;
    const body = lines.slice(1).join("\n").replace(/^\n+/, "");
    return { title, body };
  }
  return { title: fallbackTitle, body: src };
}

export function parseDualPaneContent(markdown) {
  const src = typeof markdown === "string" ? markdown : "";
  const lines = src.split(/\r?\n/);
  const first = (lines[0] || "").trim();
  if (first.startsWith("# ")) {
    const title = first.replace(/^#\s+/, "").trim();
    const body = lines.slice(1).join("\n").replace(/^\n+/, "");
    return { title, body };
  }
  return { title: "", body: src };
}
