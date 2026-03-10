export function escapeHtml(value) {
  return (value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function normalizeHeading(value) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function extractSection(content, fragment) {
  if (!content || !fragment) {
    return content;
  }
  const target = fragment.trim();
  if (!target) return content;
  const lines = content.split(/\r?\n/);
  if (target.startsWith("^")) {
    const block = target.slice(1).trim();
    if (block) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(`^${block}`)) {
          let section = lines[i];
          let j = i + 1;
          while (
            j < lines.length &&
            lines[j].trim() !== "" &&
            !lines[j].match(/^#{1,6}\s/)
          ) {
            section += "\n" + lines[j];
            j++;
          }
          return section;
        }
      }
    }
  }
  const normalizedTarget = normalizeHeading(target);
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (!match) continue;
    const heading = match[2].trim();
    if (!heading) continue;
    if (normalizeHeading(heading) === normalizedTarget) {
      const level = match[1].length;
      let section = lines[i];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const next = lines[j].match(/^(#{1,6})\s+(.*)$/);
        if (next && next[1].length <= level) break;
        section += "\n" + lines[j];
      }
      return section;
    }
  }
  return content;
}
export const escapeHTML = escapeHtml;
