import { escapeHtml } from "./markdown-helpers";

export function renderMarkdown(md, options = {}) {
  if (!md) return "";
  const lines = md.split(/\r?\n/);
  let html = "";
  let inCode = false;
  const resolveDocById = options.resolveDocById;
  const resolveDocBySlug = options.resolveDocBySlug;

  const listStack = [];

  const closeAllLists = () => {
    while (listStack.length) {
      const top = listStack.pop();
      html += `</${top.type}>`;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine;
    if (/^(?:\t|\s{4,})\S/.test(line)) {
      const afterIndent = line.replace(/^\t|^\s{4}/, "");
      if (/^(-\s+|\d+\.\s+)/.test(afterIndent)) {
      } else {
        closeAllLists();
        html += '<pre class="md-code"><code>';
        let j = i;
        while (
          j < lines.length &&
          (lines[j].trim() === "" || /^(?:\t|\s{4,})\S/.test(lines[j]))
        ) {
          const ln = lines[j].replace(/^\t|^\s{0,4}/, "");
          html += escapeHtml(ln) + "\n";
          j++;
        }
        html += "</code></pre>";
        i = j - 1;
        continue;
      }
    }
    if (line.startsWith("```")) {
      if (inCode) {
        html += "</code></pre>";
      } else {
        closeAllLists();
        html += '<pre class="md-code"><code>';
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      html += escapeHtml(line) + "\n";
      continue;
    }

    if (/^\s*(?:\*{3,}|-{3,}|_{3,})\s*$/.test(line)) {
      closeAllLists();
      html += "<hr/>";
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeAllLists();
      const level = Math.min(6, headingMatch[1].length);
      const text = renderInline(
        headingMatch[2].trim(),
        resolveDocById,
        resolveDocBySlug
      );
      html += `<h${level}>${text}</h${level}>`;
      continue;
    }

    const bqMatch = line.match(/^\s*>\s?(.*)$/);
    if (bqMatch) {
      closeAllLists();
      let bqHtml = "";
      let j = i;
      while (j < lines.length) {
        const m = lines[j].match(/^\s*>\s?(.*)$/);
        if (!m) break;
        const t = renderInline(m[1] || "", resolveDocById, resolveDocBySlug);
        bqHtml += `<p>${t}</p>`;
        j++;
      }
      html += `<blockquote>${bqHtml}</blockquote>`;
      i = j - 1;
      continue;
    }

    const nextLine = lines[i + 1] || "";
    if (
      /\|/.test(line) &&
      /^\s*\|?\s*[-:]+\s*(\|\s*[-:]+\s*)+\|?\s*$/.test(nextLine)
    ) {
      closeAllLists();
      const headers = line
        .split("|")
        .map((s) => s.trim())
        .filter((s) => s !== "");
      let j = i + 2;
      const rows = [];
      while (j < lines.length) {
        const l = lines[j];
        if (!/\|/.test(l) || l.trim() === "") break;
        const cols = l
          .split("|")
          .map((s) => s.trim())
          .filter((_, idx) => idx < headers.length);
        rows.push(cols);
        j++;
      }
      html +=
        '<table class="md-table"><thead><tr>' +
        headers
          .map(
            (h) =>
              `<th>${renderInline(h, resolveDocById, resolveDocBySlug)}</th>`
          )
          .join("") +
        "</tr></thead>";
      if (rows.length) {
        html +=
          "<tbody>" +
          rows
            .map(
              (r) =>
                `<tr>${r
                  .map(
                    (c) =>
                      `<td>${renderInline(
                        c,
                        resolveDocById,
                        resolveDocBySlug
                      )}</td>`
                  )
                  .join("")}</tr>`
            )
            .join("") +
          "</tbody>";
      }
      html += "</table>";
      i = j - 1;
      continue;
    }

    const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    const bulletMatch = line.match(/^(\s*)-\s+(.*)$/);
    if (orderedMatch || bulletMatch) {
      const m = orderedMatch || bulletMatch;
      const leading = m[1] || "";
      const indentLevel = Math.floor(leading.replace(/\t/g, "  ").length / 2);
      const type = orderedMatch ? "ol" : "ul";
      const content = renderInline(
        (orderedMatch ? orderedMatch[3] : bulletMatch[2]).trim(),
        resolveDocById,
        resolveDocBySlug
      );

      while (listStack.length > indentLevel) {
        const top = listStack.pop();
        html += `</${top.type}>`;
      }
      if (listStack.length < indentLevel) {
        for (let k = listStack.length; k < indentLevel; k++) {
          html += `<${type}>`;
          listStack.push({ type, indent: k });
        }
      }

      if (!listStack.length || listStack[listStack.length - 1].type !== type) {
        if (listStack.length) html += `</${listStack.pop().type}>`;
        html += `<${type}>`;
        listStack.push({ type, indent: indentLevel });
      }

      html += `<li>${content}</li>`;
      continue;
    } else {
      if (line.trim() === "") {
        closeAllLists();
        html += '<div class="md-gap"></div>';
        continue;
      }

      if (listStack.length) closeAllLists();
    }

    const text = renderInline(line.trim(), resolveDocById, resolveDocBySlug);
    html += `<p>${text}</p>`;
  }
  if (listStack.length) closeAllLists();
  if (inCode) {
    html += "</code></pre>";
  }
  return html;
}

function escapeAttr(s) {
  if (!s) return "";
  const low = s.trim().toLowerCase();
  if (low.startsWith("javascript:")) return "#";
  return (s + "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(raw, resolveDocById, resolveDocBySlug) {
  if (!raw) return "";

  const pieces = raw.split(/(`[^`]*`)/g);
  return pieces
    .map((part) => {
      if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }

      let s = part;

      s = escapeHtml(s);

      s = s.replace(/!\[\[([^\]]+)\]\]/g, (m, inner) => {
        const placeholder = renderEmbedPlaceholder(
          inner || "",
          resolveDocById,
          resolveDocBySlug,
          "block"
        );
        return placeholder || m;
      });
      s = s.replace(/\{\{embed:([^}]+)\}\}/g, (m, inner) => {
        const placeholder = renderEmbedPlaceholder(
          inner || "",
          resolveDocById,
          resolveDocBySlug,
          "inline"
        );
        return placeholder || m;
      });

      s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, url) => {
        return `<img src="${escapeAttr(url)}" alt="${escapeHtml(alt)}" />`;
      });

      s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, url) => {
        return `<a href="${escapeAttr(url)}">${escapeHtml(label)}</a>`;
      });

      s = s.replace(/\[\[([^\]]+)\]\]/g, (m, inner) => {
        const parts = inner.split("|");
        const targetRaw = parts[0] ? parts[0].trim() : "";
        if (!targetRaw) return m;
        const override = parts[1] ? parts[1].trim() : "";
        const lower = targetRaw.toLowerCase();
        let slugVal = "";
        let doc = null;
        if (lower.startsWith("doc:")) {
          const docId = targetRaw.slice(4).trim();
          doc = resolveDocById?.(docId);
          slugVal = doc?.slug || "";
        } else if (lower.startsWith("path:")) {
          slugVal = normalizeWikiSlug(targetRaw.slice(5));
          if (slugVal) {
            doc = resolveDocBySlug?.(slugVal);
          }
        } else {
          slugVal = normalizeWikiSlug(targetRaw);
          if (slugVal) {
            doc = resolveDocBySlug?.(slugVal);
          }
        }
        const label = override || doc?.title || doc?.slug || targetRaw;
        const encodedTarget = slugVal
          ? encodeURIComponent(slugVal)
          : encodeURIComponent(targetRaw);
        const docIdAttr = doc?.doc_id
          ? ` data-doc-id="${escapeAttr(doc.doc_id)}"`
          : "";
        const slugAttr = ` data-wiki-slug="${encodedTarget}"`;
        const href = slugVal
          ? `#doc-${encodedTarget}`
          : `#wiki-${encodedTarget}`;
        const classes = ["wiki-link"];
        if (doc) classes.push("wiki-link-resolved");
        return `<a class="${classes.join(
          " "
        )}"${slugAttr}${docIdAttr} href="${href}">${escapeHtml(label)}</a>`;
      });

      s = s.replace(/\*\*([^*]+)\*\*/g, (m, t) => `<strong>${t}</strong>`);

      s = s.replace(/\*([^*]+)\*/g, (m, t) => `<em>${t}</em>`);

      s = s.replace(
        /(https?:\/\/[^\s<]+)/g,
        (m) => `<a href="${escapeAttr(m)}">${escapeHtml(m)}</a>`
      );
      return s;
    })
    .join("");
}

function normalizeWikiSlug(raw) {
  if (!raw) return "";
  let slug = raw;
  try {
    slug = decodeURIComponent(slug);
  } catch (err) {
    console.warn("[markdown] decode slug", err);
  }
  slug = slug.trim();
  slug = slug.replace(/^\/+|\/+$/g, "");
  slug = slug.replace(/\.md$/i, "");
  slug = slug.replace(/\\/g, "/");
  return slug;
}

function renderEmbedPlaceholder(raw, resolveDocById, resolveDocBySlug, mode) {
  const info = parseEmbedTarget(raw, resolveDocById, resolveDocBySlug);
  if (!info) return "";
  const attrs = [];
  if (info.slug)
    attrs.push(`data-embed-slug="${encodeURIComponent(info.slug)}"`);
  if (info.fragment)
    attrs.push(`data-embed-fragment="${escapeAttr(info.fragment)}"`);
  if (info.docId) attrs.push(`data-doc-id="${escapeAttr(info.docId)}"`);
  attrs.push(`data-embed-mode="${mode}"`);
  const label = info.alias || info.label || info.title || "Embed";
  const hint = mode === "block" ? "Embedded page preview" : "Embedded view";
  const title = info.title || label;
  return `<span class="md-embed" ${attrs.join(" ")} title="Embed ${escapeAttr(
    title
  )}"><span class="md-embed-label">${escapeHtml(
    label
  )}</span><span class="md-embed-hint">${hint}</span></span>`;
}

function parseEmbedTarget(raw, resolveDocById, resolveDocBySlug) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parts = trimmed.split("|");
  const targetPart = parts[0] ? parts[0].trim() : "";
  const alias = parts[1] ? parts[1].trim() : "";
  if (!targetPart) return null;
  let slug = "";
  let fragment = "";
  let docId = "";
  let doc = null;
  const hashIdx = targetPart.indexOf("#");
  let target = targetPart;
  if (hashIdx >= 0) {
    fragment = targetPart.slice(hashIdx + 1).trim();
    target = targetPart.slice(0, hashIdx).trim();
  }
  const lower = target.toLowerCase();
  if (lower.startsWith("doc:")) {
    docId = target.slice(4).trim();
    if (docId) doc = resolveDocById?.(docId) || null;
    slug = doc?.slug || "";
  } else {
    let candidate = target;
    if (lower.startsWith("path:")) {
      candidate = candidate.slice(5).trim();
    }
    slug = normalizeWikiSlug(candidate);
    if (slug) {
      doc = resolveDocBySlug?.(slug) || null;
      if (doc?.doc_id) docId = doc.doc_id;
    }
  }
  const title = doc?.title || doc?.slug || slug || target;
  const label = alias || title;
  return { slug, fragment, alias, docId, doc, label, title };
}
