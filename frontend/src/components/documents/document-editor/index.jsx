import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ROUTES from "../../../api/routes";
import { renderMarkdown } from "../../../utils/markdown";
import { normalizeStatus } from "../../../utils/formatters";
import { cleanSlug, slugify } from "../../../utils/slug";
import { slugToPath, slugToSegments } from "../../../utils/router";
import ModalShell from "../../ui/modals";
import DocumentSearch from "../document-search";
import { parseContent, parseDualPaneContent } from "./editor-helpers";
import {
  IconEye,
  IconEyeSlash,
  IconSplit,
  IconBack,
  IconCloudUpload,
  IconDraft,
  IconLink,
  IconImage,
  IconCode,
  IconTable,
  IconHr,
} from "./editor-icons";

const STATUS_OPTIONS = ["draft", "published", "unlisted"];

export default function Editor({
  slug,
  initial,
  initialFolder = false,
  onSaved,
  onCancel,
  endpointPrefix = "/api/page/",
  linkables = [],
  onSlugChange,
  isDualPane = false,
  onEnterDualPane,
  onExitDualPane,
  metadata = null,
  currentUser = null,
  parentSlug = "",
  parentOptions = [],
  onParentSlugChange,
  onDraftAutoSaved,
}) {
  const isEdit = !!slug;
  const [titleText, setTitleText] = useState(slug || "");
  const [bodyText, setBodyText] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [slugEditMode, setSlugEditMode] = useState(false);
  const [slugInput, setSlugInput] = useState("");
  const [, setSlugError] = useState(null);
  const [folderMode, setFolderMode] = useState(Boolean(initialFolder));
  const [showRenameConfirm, setShowRenameConfirm] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [showPreview, setShowPreview] = useState(true);
  const [stagedDraft, setStagedDraft] = useState(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [showDocumentSearch, setShowDocumentSearch] = useState(false);
  const [documentQuery, setDocumentQuery] = useState("");
  const [documentInsertMode, setDocumentInsertMode] = useState("link");
  const viewRef = useRef(null);
  const titleInputRef = useRef(null);
  const draftTimerRef = useRef(null);
  const lastSavedContentRef = useRef(null);
  const restoredDraftKeyRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const uploadXhrRef = useRef(null);
  const saveRef = useRef(null);
  const draftSaveTimerRef = useRef(null);
  const lastDraftSavedRef = useRef(null);
  const draftSlugRef = useRef(null);
  const [overwritePrompt, setOverwritePrompt] = useState(false);
  const [overwriteMessage] = useState("");
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [metaStatus, setMetaStatus] = useState(() => {
    const normalized = normalizeStatus(metadata?.status);
    if (normalized) return normalized;
    return isEdit ? "published" : "draft";
  });
  const [metaCreatedBy, setMetaCreatedBy] = useState(
    (metadata?.owner || currentUser?.username || "").trim()
  );

  const derivedSlug = useMemo(() => slugify(titleText), [titleText]);
  const urlPrefix = useMemo(() => {
    if (isEdit) return "/doc/";
    const parent = (parentSlug || "").trim();
    if (!parent) return "/doc/";
    return `/doc/${slugToSegments(parent)}/`;
  }, [isEdit, parentSlug]);
  const saveSlug = useMemo(() => {
    if (isEdit) return slug;
    if (slugInput && String(slugInput).trim() !== "") return slugify(slugInput);
    return derivedSlug;
  }, [isEdit, slug, slugInput, derivedSlug]);
  const normalizedEditSlug = useMemo(() => {
    if (!isEdit) return "";
    const raw = (slugInput || "").trim();
    if (!raw) return "";
    const cleaned = slugify(raw);
    if (cleaned.includes("/")) return cleaned;
    const current = cleanSlug(slug || "");
    const idx = current.lastIndexOf("/");
    if (idx <= 0) return cleaned;
    const parent = current.slice(0, idx);
    return parent ? `${parent}/${cleaned}` : cleaned;
  }, [isEdit, slugInput, slug]);
  const fullSlug = useMemo(() => {
    if (isEdit) return slug || "";
    if (!saveSlug) return "";
    return parentSlug ? `${parentSlug}/${saveSlug}` : saveSlug;
  }, [isEdit, slug, parentSlug, saveSlug]);
  const draftKey = useMemo(() => `atlas-editor-draft:${fullSlug}`, [fullSlug]);
  const [cmModules, setCmModules] = useState(null);
  useEffect(() => {
    let mounted = true;
    Promise.all([
      import("@uiw/react-codemirror"),
      import("@codemirror/lang-markdown"),
      import("@codemirror/view"),
      import("@codemirror/commands"),
    ])
      .then(([cmModule, langModule, viewModule, commandsModule]) => {
        if (!mounted) return;
        const defaultKeymap = Array.isArray(commandsModule?.defaultKeymap)
          ? commandsModule.defaultKeymap
          : commandsModule?.defaultKeymap || [];
        setCmModules({
          CodeMirror: cmModule.default || cmModule,
          cmMarkdown: (
            langModule &&
            (langModule.markdown || langModule.default || langModule)
          ).markdown
            ? langModule.markdown
            : langModule.default || langModule,
          EditorView: viewModule.EditorView,
          keymap: viewModule.keymap,
          defaultKeymap,
        });
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const parsed = parseContent(initial || "", slug || "");
    const nextTitle = parsed.title || slug || "";
    const nextSlug = slugify(nextTitle);
    setTitleText(nextTitle);
    setBodyText(parsed.body || "");
    setSlugInput(slug || (nextTitle && nextTitle.trim() ? nextSlug : ""));
    setFolderMode(Boolean(initialFolder));
    setErr(null);
    setDocumentQuery("");
    setShowDocumentSearch(false);
    setStagedDraft(null);
    setDraftRestored(false);
    restoredDraftKeyRef.current = null;
    lastSavedContentRef.current = null;
    draftSlugRef.current = null;
    lastDraftSavedRef.current = null;
    try {
      const d = localStorage.getItem(`atlas-editor-draft:${nextSlug}`);
      if (d && d !== (initial || "")) setStagedDraft(d);
    } catch (e) {
      console.warn("[Editor] read draft", e);
    }
    if (!isEdit) {
      setTimeout(() => {
        try {
          if (titleInputRef.current) {
            titleInputRef.current.focus();
            titleInputRef.current.select();
          }
        } catch (e) {
          console.warn("[Editor] focus title", e);
        }
      }, 0);
    }
    return () => {
      safeAbortUpload();
    };
  }, [initial, slug, initialFolder, isEdit]);

  useEffect(() => {
    const normalized = normalizeStatus(metadata?.status);
    setMetaStatus(normalized || (isEdit ? "published" : "draft"));
    setMetaCreatedBy((metadata?.owner || currentUser?.username || "").trim());
  }, [metadata, currentUser?.username, isEdit]);

  useEffect(() => {
    if (onSlugChange) onSlugChange(saveSlug);
  }, [saveSlug, onSlugChange]);

  useEffect(() => {
    if (isDualPane) setShowPreview(true);
  }, [isDualPane]);

  const fullContent = useMemo(() => {
    const heading = titleText.trim() ? `# ${titleText.trim()}` : "";
    const body = bodyText || "";
    if (heading && body) {
      return `${heading}\n\n${body}`;
    }
    if (heading) return heading + "\n";
    return body;
  }, [titleText, bodyText]);

  const dualPaneValue = useMemo(() => {
    const titleLine = `# ${titleText.trim()}`;
    if (bodyText) {
      return `${titleLine}\n\n${bodyText}`;
    }
    return `${titleLine}\n`;
  }, [titleText, bodyText]);

  const extensions = useMemo(() => {
    if (!cmModules) return [];
    try {
      const md =
        typeof cmModules.cmMarkdown === "function"
          ? cmModules.cmMarkdown()
          : cmModules.cmMarkdown && cmModules.cmMarkdown.markdown
          ? cmModules.cmMarkdown.markdown()
          : null;
      const lineWrap =
        cmModules.EditorView && cmModules.EditorView.lineWrapping
          ? cmModules.EditorView.lineWrapping
          : null;
      return [md, lineWrap].filter(Boolean);
    } catch (e) {
      return [];
    }
  }, [cmModules]);
  const linkResolver = useMemo(() => {
    const byId = new Map();
    const bySlug = new Map();
    const list = Array.isArray(linkables) ? linkables : [];
    list.forEach((item) => {
      if (item?.doc_id) byId.set(item.doc_id, item);
      if (item?.slug) bySlug.set(cleanSlug(item.slug), item);
    });
    return {
      resolveDocById: (id) => byId.get(id),
      resolveDocBySlug: (slug) =>
        slug ? bySlug.get(cleanSlug(slug)) : undefined,
    };
  }, [linkables]);
  const previewHtml = useMemo(
    () => renderMarkdown(fullContent, linkResolver),
    [fullContent, linkResolver]
  );
  const filteredLinks = useMemo(() => {
    const q = documentQuery.trim().toLowerCase();
    const list = Array.isArray(linkables) ? linkables : [];
    if (!q) return list;
    return list.filter(
      (l) =>
        (l?.slug || "").toLowerCase().includes(q) ||
        (l?.title || "").toLowerCase().includes(q)
    );
  }, [linkables, documentQuery]);

  const metadataReady = Boolean(metaStatus && metaCreatedBy.trim());
  const buildFrontMatter = (statusValue, ownerValue) => {
    const normalizedStatus = normalizeStatus(statusValue);
    const normalizedOwner = (ownerValue || "").trim();
    if (!normalizedStatus || !normalizedOwner) return "";
    return `---\nstatus: ${normalizedStatus}\nowner: ${normalizedOwner}\n---\n\n`;
  };
  const frontMatter = useMemo(() => {
    if (!metadataReady) return "";
    return buildFrontMatter(metaStatus, metaCreatedBy);
  }, [metadataReady, metaStatus, metaCreatedBy]);

  const safeRemoveLocalStorageKey = (key, label) => {
    if (!key) return;
    if (typeof window === "undefined" || !window.localStorage) return;
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.warn("[Editor] localStorage remove", label || key, err);
    }
  };

  const safeAbortUpload = () => {
    try {
      if (uploadXhrRef.current) uploadXhrRef.current.abort();
    } catch (err) {
      console.warn("[Editor] abort upload", err);
    }
  };

  const updateViewRef = (update) => {
    if (update?.view) viewRef.current = update.view;
  };

  const focusEditor = () => {
    const view = viewRef.current;
    if (view) view.focus();
  };

  const insertSnippet = (snippet) => {
    const view = viewRef.current;
    if (!view) {
      setBodyText((v) => v + snippet);
      return;
    }
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: snippet },
      selection: { anchor: from + snippet.length },
    });
    focusEditor();
  };

  const wrapSelection = (prefix, suffix = prefix) => {
    const view = viewRef.current;
    if (!view) {
      setBodyText((v) => `${prefix}${v}${suffix}`);
      return;
    }
    const { from, to } = view.state.selection.main;
    const selected = view.state.doc.sliceString(from, to);
    const insert = `${prefix}${selected || ""}${suffix}`;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
    });
    focusEditor();
  };

  const applyToSelectedLines = (view, transform) => {
    const changes = [];
    const ranges = view.state.selection.ranges;
    for (const range of ranges) {
      const startLine = view.state.doc.lineAt(range.from);
      const endPos =
        range.to === range.from ? range.to : Math.max(0, range.to - 1);
      const endLine = view.state.doc.lineAt(endPos);
      for (let n = startLine.number; n <= endLine.number; n++) {
        const line = view.state.doc.line(n);
        const res = transform(line);
        if (!res) continue;
        if (typeof res === "string") {
          changes.push({ from: line.from, to: line.from, insert: res });
        } else if (res.remove && res.remove > 0) {
          const removeLen = Math.min(res.remove, line.to - line.from);
          changes.push({
            from: line.from,
            to: line.from + removeLen,
            insert: "",
          });
        }
      }
    }
    if (changes.length) {
      view.dispatch({
        changes,
        selection: view.state.selection,
        scrollIntoView: true,
      });
      return true;
    }
    return false;
  };

  const toggleBulletList = (view) => {
    return applyToSelectedLines(view, (line) => {
      if (/^\s*-\s+/.test(line.text)) {
        const m = line.text.match(/^(\s*)-\s+/);
        return { remove: m ? m[0].length : 2 };
      }
      return "- ";
    });
  };

  const toggleNumberedList = (view) => {
    return applyToSelectedLines(view, (line) => {
      if (/^\s*\d+\.\s+/.test(line.text)) {
        const m = line.text.match(/^(\s*)\d+\.\s+/);
        return { remove: m ? m[0].length : 3 };
      }
      return "1. ";
    });
  };

  const indentLines = (view) => applyToSelectedLines(view, () => "  ");

  const outdentLines = (view) => {
    return applyToSelectedLines(view, (line) => {
      const m = line.text.match(/^(\t| {2})/);
      if (m) return { remove: m[0].length };
      return null;
    });
  };

  const insertDocument = (
    slugValue,
    asEmbed = documentInsertMode === "embed"
  ) => {
    if (!slugValue) return;
    const snippet = asEmbed ? `![[${slugValue}]]` : `[[${slugValue}]]`;
    insertSnippet(snippet);
    setShowDocumentSearch(false);
    setDocumentQuery("");
  };

  const promptAndInsertLink = async () => {
    let url = window.prompt(
      "Enter link URL or page slug (for wiki use [[slug]]):",
      "https://"
    );
    if (!url) return;
    if (url.startsWith("[[") && url.endsWith("]]")) {
      insertSnippet(url);
      return;
    }
    const text = window.prompt("Link text (optional):", "");
    const insert = text ? `[${text}](${url})` : `<${url}>`;
    insertSnippet(insert);
  };

  const promptAndInsertImage = async () => {
    let url = window.prompt("Enter image URL (or paste data URL):", "");
    if (!url) return;
    const alt = window.prompt("Alt text (optional):", "");
    insertSnippet(`![${alt || ""}](${url})`);
  };

  const toggleBlockquote = (view) => {
    return applyToSelectedLines(view, (line) => {
      if (/^\s*>\s+/.test(line.text)) {
        const m = line.text.match(/^(\s*>\s+)/);
        return { remove: m ? m[0].length : 2 };
      }
      return "> ";
    });
  };

  const insertTable = () => {
    const tpl = `\n| Column 1 | Column 2 | Column 3 |\n|---|---:|---:|\n| text | text | text |\n\n`;
    insertSnippet(tpl);
  };

  const insertHorizontalRule = () => {
    insertSnippet("\n---\n");
  };

  const pasteImageHandler = useMemo(() => {
    if (!cmModules || !cmModules.EditorView) return null;
    return cmModules.EditorView.domEventHandlers({
      paste: (event, view) => {
        try {
          const items = event.clipboardData && event.clipboardData.items;
          if (!items) return false;
          for (const it of items) {
            if (it.type && it.type.indexOf("image") === 0) {
              const file = it.getAsFile();
              if (!file) continue;
              try {
                const form = new FormData();
                form.append("file", file, file.name || "pasted.png");
                try {
                  const xhr = new XMLHttpRequest();
                  uploadXhrRef.current = xhr;
                  setUploading(true);
                  setUploadProgress(0);
                  xhr.open("POST", ROUTES.uploadImageXHR, true);
                  xhr.withCredentials = true;
                  xhr.upload.onprogress = (ev) => {
                    if (ev.lengthComputable)
                      setUploadProgress(
                        Math.round((ev.loaded / ev.total) * 100)
                      );
                  };
                  xhr.onload = () => {
                    try {
                      if (xhr.status >= 200 && xhr.status < 300) {
                        const j = JSON.parse(xhr.responseText || "{}");
                        const url = j && j.url ? j.url : null;
                        if (url) {
                          view.dispatch({
                            changes: {
                              from: view.state.selection.main.from,
                              to: view.state.selection.main.to,
                              insert: `![](${url})\n`,
                            },
                          });
                          setUploading(false);
                          setUploadProgress(0);
                          uploadXhrRef.current = null;
                          return;
                        }
                      }
                    } catch (e) {
                      console.warn("[Editor] parse upload response", e);
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      const data = reader.result;
                      view.dispatch({
                        changes: {
                          from: view.state.selection.main.from,
                          to: view.state.selection.main.to,
                          insert: `![](${data})\n`,
                        },
                      });
                    };
                    reader.readAsDataURL(file);
                    setUploading(false);
                    setUploadProgress(0);
                    uploadXhrRef.current = null;
                  };
                  xhr.onerror = () => {
                    const reader = new FileReader();
                    reader.onload = () => {
                      const data = reader.result;
                      view.dispatch({
                        changes: {
                          from: view.state.selection.main.from,
                          to: view.state.selection.main.to,
                          insert: `![](${data})\n`,
                        },
                      });
                    };
                    reader.readAsDataURL(file);
                    setUploading(false);
                    setUploadProgress(0);
                    uploadXhrRef.current = null;
                  };
                  xhr.onabort = () => {
                    setUploading(false);
                    setUploadProgress(0);
                    uploadXhrRef.current = null;
                  };
                  xhr.send(form);
                } catch (e) {
                  const reader = new FileReader();
                  reader.onload = () => {
                    const data = reader.result;
                    view.dispatch({
                      changes: {
                        from: view.state.selection.main.from,
                        to: view.state.selection.main.to,
                        insert: `![](${data})\n`,
                      },
                    });
                  };
                  reader.readAsDataURL(file);
                }
              } catch (e) {
                console.warn("[Editor] upload via XHR failed", e);
                const reader = new FileReader();
                reader.onload = () => {
                  const data = reader.result;
                  view.dispatch({
                    changes: {
                      from: view.state.selection.main.from,
                      to: view.state.selection.main.to,
                      insert: `![](${data})\n`,
                    },
                  });
                };
                reader.readAsDataURL(file);
              }
              event.preventDefault();
              return true;
            }
          }
        } catch (e) {
          console.warn("[Editor] handle pasted image", e);
        }
        return false;
      },
    });
  }, [cmModules]);

  const editorKeymap = useMemo(() => {
    if (!cmModules || !cmModules.keymap || !cmModules.EditorView) return null;
    try {
      const { keymap, defaultKeymap } = cmModules;
      return keymap.of([
        {
          key: "Mod-s",
          run: () => {
            const fn = saveRef.current;
            if (fn) {
              fn();
              return true;
            }
            return false;
          },
        },
        {
          key: "Mod-Enter",
          run: () => {
            const fn = saveRef.current;
            if (fn) {
              fn();
              return true;
            }
            return false;
          },
        },
        {
          key: "Mod-Shift-p",
          run: () => {
            setShowPreview((s) => !s);
            return true;
          },
        },
        {
          key: "Tab",
          run: (view) => {
            const did = indentLines(view);
            if (did) return true;
            const { from, to } = view.state.selection.main;
            view.dispatch({
              changes: { from: from, to: to, insert: "  " },
              selection: { anchor: from + 2 },
            });
            return true;
          },
        },
        {
          key: "Shift-Tab",
          run: (view) => {
            return outdentLines(view) || false;
          },
        },
        {
          key: "Mod-b",
          run: (view) => {
            const { from, to } = view.state.selection.main;
            const selected = view.state.doc.sliceString(from, to);
            const insert = `**${selected || ""}**`;
            view.dispatch({
              changes: { from, to, insert },
              selection: { anchor: from + insert.length },
            });
            return true;
          },
        },
        {
          key: "Mod-i",
          run: (view) => {
            const { from, to } = view.state.selection.main;
            const selected = view.state.doc.sliceString(from, to);
            const insert = `*${selected || ""}*`;
            view.dispatch({
              changes: { from, to, insert },
              selection: { anchor: from + insert.length },
            });
            return true;
          },
        },
        ...defaultKeymap,
      ]);
    } catch (e) {
      return null;
    }
  }, [cmModules]);

  const pasteHandlerExt = useMemo(() => {
    if (!cmModules || !cmModules.EditorView) return null;
    return cmModules.EditorView.domEventHandlers({
      paste: (event, view) => {
        try {
          const text =
            event.clipboardData &&
            event.clipboardData.getData &&
            event.clipboardData.getData("text/plain");
          if (!text) return false;
          event.preventDefault();
          let processed = text;

          const lines = processed.split(/\r?\n/);
          const nonEmpty = lines.filter((l) => l.trim() !== "");
          let minIndent = Infinity;
          for (const l of nonEmpty) {
            const m = l.match(/^(\s+)/);
            if (m) {
              const len = m[1].replace(/\t/g, "  ").length;
              minIndent = Math.min(minIndent, len);
            } else {
              minIndent = Math.min(minIndent, 0);
            }
          }
          if (minIndent === Infinity) minIndent = 0;
          if (minIndent > 0) {
            const prefix = " ".repeat(minIndent);
            processed = lines
              .map((l) => (l.startsWith(prefix) ? l.slice(minIndent) : l))
              .join("\n");
          }

          if (/\n?\s*\d+\.\s+/.test(processed)) {
            const pos = view.state.selection.main.from;
            const beforeLine = view.state.doc.lineAt(pos);
            let startNum = null;
            for (let i = beforeLine.number; i >= 1; i--) {
              const line = view.state.doc.line(i).text;
              const m = line.match(/^\s*(\d+)\.\s+/);
              if (m) {
                startNum = parseInt(m[1], 10) + 1;
                break;
              }
              if (line.trim() === "") continue;
            }
            if (startNum === null) startNum = 1;
            let cur = startNum;
            processed = processed
              .split(/\r?\n/)
              .map((l) => {
                const m = l.match(/^(\s*)(\d+)\.\s+(.*)$/);
                if (m) {
                  const out = `${m[1]}${cur}. ${m[3]}`;
                  cur++;
                  return out;
                }
                if (l.trim() === "") {
                  cur = startNum;
                  return l;
                }
                return l;
              })
              .join("\n");
          }

          view.dispatch({
            changes: {
              from: view.state.selection.main.from,
              to: view.state.selection.main.to,
              insert: processed,
            },
            selection: {
              anchor: view.state.selection.main.from + processed.length,
            },
          });
          return true;
        } catch (e) {
          console.warn("[Editor] normal paste", e);
          return false;
        }
      },
    });
  }, [cmModules]);

  const extensionsWithKeys = useMemo(
    () =>
      [...extensions, editorKeymap, pasteImageHandler, pasteHandlerExt].filter(
        Boolean
      ),
    [extensions, editorKeymap, pasteHandlerExt, pasteImageHandler]
  );

  const CM = cmModules ? cmModules.CodeMirror : null;
  const performSave = async (renameTo) => {
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    }
    if (!metadataReady) {
      setErr("Complete the metadata fields before saving.");
      return;
    }
    setSaving(true);
    try {
      const targetSlug = isEdit ? slug || "" : fullSlug;
      const baseSlug = folderMode ? `${targetSlug}/_index` : targetSlug;
      let url = endpointPrefix + encodeURI(baseSlug);
      if (renameTo) url += `?rename_to=${encodeURIComponent(renameTo)}`;
      const payload = `${frontMatter}${fullContent}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
        body: payload,
      });
      if (res.ok) {
        let finalSlug = fullSlug || (isEdit ? slug || "" : saveSlug);
        try {
          const data = await res.json().catch(() => null);
          if (data && data.slug) finalSlug = data.slug;
        } catch (e) {
          console.warn("[Editor] parse save response", e);
        }

        lastSavedContentRef.current = fullContent;
        const keyToClear = restoredDraftKeyRef.current || draftKey;
        safeRemoveLocalStorageKey(keyToClear, "saved draft key");
        if (
          restoredDraftKeyRef.current &&
          restoredDraftKeyRef.current !== draftKey
        ) {
          safeRemoveLocalStorageKey(draftKey, "old draft key");
        }
        restoredDraftKeyRef.current = null;
        setStagedDraft(null);
        setDraftRestored(false);
        onSaved &&
          onSaved({ slug: finalSlug, status: metaStatus, isNew: !isEdit });
        return;
      }
      if (res.status === 409) {
        setErr("That URL already exists. Choose a different slug.");
        setSlugError("That URL already exists. Choose a different slug.");
        setShowRenameConfirm(false);
        return;
      }
      const txt = await res.text().catch(() => "");
      setErr(txt || "Save failed: " + res.status);
    } catch (e) {
      setErr("Save failed: network error");
    } finally {
      setSaving(false);
    }
  };

  async function slugExists(checkSlug = fullSlug) {
    try {
      const checkEndpoint = endpointPrefix + encodeURI(checkSlug);
      console.log("[slugExists] checking", checkEndpoint);
      const res = await fetch(checkEndpoint, {
        method: "GET",
        cache: "no-store",
        credentials: "include",
      });
      console.log("[slugExists] GET response", res.status, res.ok);
      const exists = res.ok; 
      console.log("[slugExists] final exists", exists);
      return exists;
    } catch (e) {
      console.error("[slugExists] error", e);
      return false;
    }
  }

  async function save() {
    await performSave();
  }

  try {
    saveRef.current = () => save();
  } catch (e) {
    console.warn("[Editor] register save ref", e);
  }

  useEffect(() => {
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      try {
        if (fullContent === lastSavedContentRef.current) {
          localStorage.removeItem(draftKey);
          return;
        }
        if (fullContent === (initial || "") || fullContent.trim() === "") {
          localStorage.removeItem(draftKey);
        } else {
          localStorage.setItem(draftKey, fullContent);
        }
      } catch (e) {
        console.warn("[Editor] autosave", e);
      }
    }, 800);
    return () => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, [fullContent, draftKey, initial]);

  const hasSlugSeed = Boolean(
    (slugInput || "").trim() || (titleText || "").trim()
  );
  const shouldAutoSaveDraft = !isEdit && fullContent.trim() !== "";
  const ensureDraftSlug = useCallback(
    (ownerValue) => {
      if (draftSlugRef.current) return draftSlugRef.current;
      const ownerSlug = slugify(ownerValue || "user");
      const token = `${Date.now().toString(36)}${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const next = `drafts/${ownerSlug}/${token}`;
      draftSlugRef.current = next;
      return next;
    },
    []
  );
  const saveDraftNow = useCallback(async () => {
    if (!shouldAutoSaveDraft) return;
    if (fullContent === lastDraftSavedRef.current) return;
    const ownerValue = (metaCreatedBy || currentUser?.username || "").trim();
    const draftFrontMatter = buildFrontMatter("draft", ownerValue);
    if (!draftFrontMatter) return;
    let targetSlug = hasSlugSeed ? fullSlug : ensureDraftSlug(ownerValue);
    let renameTo = "";
    if (hasSlugSeed && draftSlugRef.current && draftSlugRef.current !== fullSlug) {
      renameTo = fullSlug;
      targetSlug = draftSlugRef.current;
    }
    const baseSlug = folderMode ? `${targetSlug}/_index` : targetSlug;
    let url = endpointPrefix + encodeURI(baseSlug);
    if (renameTo) {
      url += `?rename_to=${encodeURIComponent(renameTo)}`;
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
        body: `${draftFrontMatter}${fullContent}`,
      });
      if (res.ok) {
        let nextSlug = renameTo || targetSlug;
        try {
          const data = await res.json().catch(() => null);
          if (data && data.slug) nextSlug = data.slug;
        } catch (e) {
          console.warn("[Editor] draft save response parse", e);
        }
        draftSlugRef.current = nextSlug;
        lastDraftSavedRef.current = fullContent;
        if (onDraftAutoSaved) {
          onDraftAutoSaved({ slug: nextSlug, status: "draft" });
        }
      }
    } catch (e) {
      console.warn("[Editor] draft autosave failed", e);
    }
  }, [
    shouldAutoSaveDraft,
    fullContent,
    hasSlugSeed,
    fullSlug,
    metaCreatedBy,
    currentUser?.username,
    buildFrontMatter,
    folderMode,
    ensureDraftSlug,
    endpointPrefix,
    onDraftAutoSaved,
  ]);

  useEffect(() => {
    lastDraftSavedRef.current = null;
  }, [fullSlug]);

  useEffect(() => {
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    if (!shouldAutoSaveDraft) return;
    draftSaveTimerRef.current = setTimeout(() => {
      saveDraftNow();
    }, 1200);
    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    };
  }, [saveDraftNow, shouldAutoSaveDraft, fullContent]);

  const restoreDraft = () => {
    if (!stagedDraft) return;
    restoredDraftKeyRef.current = draftKey;
    const parsed = parseContent(stagedDraft, titleText || slug || "");
    setTitleText(parsed.title || titleText);
    setBodyText(parsed.body || "");
    setStagedDraft(null);
    setDraftRestored(true);
  };

  const handleTitleChange = (value) => {
    const prevTitle = titleText;
    setTitleText(value);
    if (!isEdit) {
      const prevDerived = slugify(prevTitle);
      const newDerived = value && String(value).trim() ? slugify(value) : "";
      try {
        if (
          !slugEditMode ||
          slugify(slugInput) === prevDerived ||
          !slugInput ||
          String(slugInput).trim() === ""
        ) {
          setSlugInput(newDerived);
          setSlugError(null);
        }
      } catch (e) {
        setSlugInput(newDerived);
      }
    }
  };

  const discardDraft = () => {
    safeRemoveLocalStorageKey(draftKey, "discard draft");
    setStagedDraft(null);
    setShowDraftModal(false);
  };

  return (
    <div
      className={`editor editor-modern ${isDualPane ? "editor-dual-pane" : ""}`}
    >
      <div className="editor-header-actions">
        <div className="editor-header-actions-left">
          <button
            className="btn btn-ghost"
            onClick={() => {
              saveDraftNow();
              safeRemoveLocalStorageKey(draftKey, "back button");
              onCancel && onCancel();
            }}
            title="Back"
          >
            <span className="editor-action-icon">
              <IconBack size={14} />
            </span>
          </button>
        </div>
        <div className="editor-header-actions-right">
          {stagedDraft && (
            <button
              className="btn btn-secondary btn-sm editor-topbar-action"
              onClick={() => setShowDraftModal(true)}
            >
              <span className="editor-action-icon">
                <IconDraft size={14} />
              </span>
              <span>Draft available</span>
            </button>
          )}
          {draftRestored && !stagedDraft && (
            <span className="chip chip-outline editor-topbar-chip">
              Draft restored
            </span>
          )}
          {uploading && (
            <button
              className="btn btn-ghost btn-sm editor-topbar-action"
              onClick={() => {
                safeAbortUpload();
                setUploading(false);
                setUploadProgress(0);
                uploadXhrRef.current = null;
              }}
            >
              <span className="editor-action-icon">
                <IconCloudUpload size={14} />
              </span>
              <span>Uploading {uploadProgress}%</span>
            </button>
          )}
          <button
            className="btn btn-primary btn-sm editor-topbar-action"
            onClick={async () => {
              if (isEdit) {
                const targetSlug = normalizedEditSlug;
                if (targetSlug && targetSlug !== cleanSlug(slug || "")) {
                  try {
                    const checkEndpoint =
                      endpointPrefix + encodeURI(targetSlug);
                    const res = await fetch(checkEndpoint, {
                      method: "GET",
                      cache: "no-store",
                      credentials: "include",
                    });
                    if (res.ok) {
                      setSlugError("That URL is already taken.");
                      return;
                    }
                  } catch (e) {
                    console.warn("[Editor] slug check", e);
                  }
                  setRenameTarget(targetSlug);
                  setShowRenameConfirm(true);
                  return;
                }
                await save();
                return;
              }
              const exists = await slugExists();
              if (exists) {
                setSlugError(
                  "That URL already exists. Change it to create a new page."
                );
                return;
              }
              await save();
            }}
            disabled={saving || !metadataReady}
          >
            <span>Save</span>
          </button>
        </div>
      </div>
      <div className="editor-topbar">
        <div className="editor-topbar-header">
          <label className="field editor-type-field">
            <select
              className="input"
              value={folderMode ? "folder" : "file"}
              onChange={(e) => setFolderMode(e.target.value === "folder")}
            >
              <option value="file">File</option>
              <option value="folder">Folder</option>
            </select>
          </label>
          <div className="editor-topbar-meta">
            {!isEdit && parentOptions && parentOptions.length ? (
              <label className="field editor-location-field">
                <span>Location</span>
                <select
                  className="input"
                  value={parentSlug}
                  onChange={(e) =>
                    onParentSlugChange && onParentSlugChange(e.target.value)
                  }
                >
                  {parentOptions.map((opt) => (
                    <option
                      key={opt.slug || "__root__"}
                      value={opt.slug || ""}
                    >
                      {opt.label || opt.slug || "Root"}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="field editor-status-field">
              <span>Status</span>
              <select
                className="input"
                value={metaStatus}
                onChange={(e) => setMetaStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt[0].toUpperCase() + opt.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="editor-topbar-main">
          <label className="field editor-title-field">
            <span>Title</span>
            <input
              className="input editor-title-input editor-title-input-hero"
              ref={titleInputRef}
              value={titleText}
              onChange={(e) => handleTitleChange(e.target.value)}
            />
          </label>
          <label className="field editor-slug-field">
            <span>URL</span>
            <div className="editor-slug-input">
              <span className="editor-slug-prefix">{urlPrefix}</span>
              <input
                className="input"
                value={slugInput}
                onChange={(e) => {
                  setSlugInput(e.target.value);
                  setSlugError(null);
                  setSlugEditMode(true);
                }}
              />
            </div>
          </label>
        </div>
      </div>

      <div
        className={`editor-surface ${
          showPreview ? "editor-surface-split" : ""
        }`}
      >
        <div className="editor-toolbar-row">
          <div className="editor-toolbar-shell">
            <div className="editor-toolbar-controls">
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={() => setShowPreview((p) => !p)}
                title={showPreview ? "Hide preview" : "Show preview"}
                aria-label={showPreview ? "Hide preview" : "Show preview"}
              >
                <span className="editor-action-icon">
                  {showPreview ? (
                    <IconEye size={14} />
                  ) : (
                    <IconEyeSlash size={14} />
                  )}
                </span>
              </button>
              {!isDualPane && onEnterDualPane && (
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  onClick={() =>
                    onEnterDualPane && onEnterDualPane(fullContent)
                  }
                  title="Dual pane"
                  aria-label="Dual pane"
                >
                  <span className="editor-action-icon">
                    <IconSplit size={14} />
                  </span>
                </button>
              )}
              {isDualPane && onExitDualPane && (
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  onClick={() => onExitDualPane && onExitDualPane(fullContent)}
                  title="Exit dual pane"
                  aria-label="Exit dual pane"
                >
                  <span className="editor-action-icon">
                    <IconSplit size={14} />
                  </span>
                </button>
              )}
            </div>

            <div className="editor-toolbar">
              <div className="row">
                <div className="toolbar-group">
                  <button
                    className="btn btn-sm btn-ghost"
                    type="button"
                    onClick={() => wrapSelection("**", "**")}
                    title="Bold"
                    aria-label="Bold"
                  >
                    <span className="btn-emoji">B</span>
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    type="button"
                    onClick={() => wrapSelection("*", "*")}
                    title="Italic"
                    aria-label="Italic"
                  >
                    <span className="btn-emoji">I</span>
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    type="button"
                    onClick={() => wrapSelection("<u>", "</u>")}
                    title="Underline"
                    aria-label="Underline"
                  >
                    <span className="btn-emoji">U</span>
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    type="button"
                    onClick={() => wrapSelection("~~", "~~")}
                    title="Strikethrough"
                    aria-label="Strikethrough"
                  >
                    <span className="btn-emoji">S</span>
                  </button>
                </div>

                <div className="toolbar-group">
                  <button
                    className="btn btn-sm btn-ghost"
                    type="button"
                    onClick={() => insertSnippet("# ")}
                    title="Heading H1"
                    aria-label="Heading H1"
                  >
                    <span className="btn-emoji">H1</span>
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    type="button"
                    onClick={() => insertSnippet("## ")}
                    title="Heading H2"
                    aria-label="Heading H2"
                  >
                    <span className="btn-emoji">H2</span>
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    type="button"
                    onClick={() => insertSnippet("### ")}
                    title="Heading H3"
                    aria-label="Heading H3"
                  >
                    <span className="btn-emoji">H3</span>
                  </button>
                </div>

                <div className="toolbar-group">
                  <button
                    className="btn btn-sm btn-ghost"
                    type="button"
                    onClick={() => {
                      const v = viewRef.current;
                      if (v) toggleBulletList(v);
                      else insertSnippet("- ");
                    }}
                    title="Toggle bullet list"
                    aria-label="Toggle bullet list"
                  >
                    <span className="btn-emoji">*</span>
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    type="button"
                    onClick={() => {
                      const v = viewRef.current;
                      if (v) toggleNumberedList(v);
                      else insertSnippet("1. ");
                    }}
                    title="Toggle numbered list"
                    aria-label="Toggle numbered list"
                  >
                    <span className="btn-emoji">1.</span>
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    type="button"
                    onClick={() => {
                      const v = viewRef.current;
                      if (v) indentLines(v);
                      else insertSnippet("  ");
                    }}
                    title="Indent"
                    aria-label="Indent"
                  >
                    <span className="btn-emoji">&gt;&gt;</span>
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    type="button"
                    onClick={() => {
                      const v = viewRef.current;
                      if (v) outdentLines(v);
                    }}
                    title="Outdent"
                    aria-label="Outdent"
                  >
                    <span className="btn-emoji">&lt;&lt;</span>
                  </button>
                </div>

                <div className="toolbar-group">
                  <button
                    className="btn btn-sm btn-ghost"
                    type="button"
                    onClick={() => {
                      const v = viewRef.current;
                      if (v) toggleBlockquote(v);
                      else insertSnippet("> ");
                    }}
                    title="Blockquote"
                    aria-label="Blockquote"
                  >
                    <span className="btn-emoji">&gt;</span>
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    type="button"
                    onClick={() => insertSnippet("\n```\ncode\n```\n")}
                    title="Code block"
                    aria-label="Code block"
                  >
                    <span className="btn-emoji">
                      <IconCode size={14} />
                    </span>
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    type="button"
                    onClick={insertTable}
                    title="Insert table"
                    aria-label="Insert table"
                  >
                    <span className="btn-emoji">
                      <IconTable size={14} />
                    </span>
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    type="button"
                    onClick={insertHorizontalRule}
                    title="Insert horizontal rule"
                    aria-label="Insert horizontal rule"
                  >
                    <span className="btn-emoji">
                      <IconHr size={14} />
                    </span>
                  </button>
                </div>

                <div className="toolbar-group">
                  <button
                    className="btn btn-sm btn-ghost"
                    type="button"
                    onClick={promptAndInsertLink}
                    title="Insert link"
                    aria-label="Insert link"
                  >
                    <span className="btn-emoji">
                      <IconLink size={14} />
                    </span>
                  </button>
                  <button
                    className="btn btn-sm btn-ghost"
                    type="button"
                    onClick={promptAndInsertImage}
                    title="Insert image"
                    aria-label="Insert image"
                  >
                    <span className="btn-emoji">
                      <IconImage size={14} />
                    </span>
                  </button>
                  <div className="wiki-mode-toggle">
                    <button
                      type="button"
                      className={documentInsertMode === "link" ? "active" : ""}
                      aria-pressed={documentInsertMode === "link"}
                      onClick={() => setDocumentInsertMode("link")}
                    >
                      Link
                    </button>
                    <button
                      type="button"
                      className={documentInsertMode === "embed" ? "active" : ""}
                      aria-pressed={documentInsertMode === "embed"}
                      onClick={() => setDocumentInsertMode("embed")}
                    >
                      Embed
                    </button>
                  </div>
                  <button
                    className="btn btn-sm btn-secondary"
                    type="button"
                    onClick={() => setShowDocumentSearch((s) => !s)}
                    title="Insert wiki link"
                    aria-label="Insert wiki link"
                  >
                    [[ ]]
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="editor-pane editor-pane-body">
          <div className="editor-body">
            {!isDualPane && <div className="content-eyebrow">Body</div>}
            {CM ? (
              <CM
                value={isDualPane ? dualPaneValue : bodyText}
                height="100%"
                extensions={extensionsWithKeys}
                basicSetup={{ lineNumbers: false }}
                onUpdate={(update) => {
                  updateViewRef(update);
                }}
                onChange={(v) => {
                  if (isDualPane) {
                    const parsed = parseDualPaneContent(v);
                    setTitleText(parsed.title);
                    setBodyText(parsed.body);
                    return;
                  }
                  setBodyText(v);
                }}
                theme="dark"
              />
            ) : (
              <textarea
                className="codemirror-fallback"
                value={isDualPane ? dualPaneValue : bodyText}
                onChange={(e) => {
                  const v = e.target.value;
                  if (isDualPane) {
                    const parsed = parseDualPaneContent(v);
                    setTitleText(parsed.title);
                    setBodyText(parsed.body);
                    return;
                  }
                  setBodyText(v);
                }}
                style={{
                  width: "100%",
                  height: "100%",
                  boxSizing: "border-box",
                  fontFamily: "monospace",
                  padding: 12,
                }}
              />
            )}
            {showDocumentSearch && (
              <DocumentSearch
                documentQuery={documentQuery}
                onQueryChange={setDocumentQuery}
                filteredLinks={filteredLinks}
                onInsert={(slugValue, embed) =>
                  insertDocument(slugValue, embed)
                }
                documentInsertMode={documentInsertMode}
                onClose={() => setShowDocumentSearch(false)}
              />
            )}
          </div>
        </div>

        {showPreview && (
          <div className="editor-pane editor-preview">
            {!isDualPane && <div className="content-eyebrow">Live preview</div>}
            <div className="md-view md-prose">
              {fullContent ? (
                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              ) : null}
            </div>
          </div>
        )}
      </div>

      {err && (
        <div className="banner banner-danger" style={{ marginTop: 10 }}>
          <div className="banner-body">{err}</div>
        </div>
      )}

      {overwritePrompt && (
        <ModalShell
          title="Overwrite existing page?"
          onClose={() => setOverwritePrompt(false)}
          maxWidth={520}
          footer={
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button
                className="btn btn-danger"
                onClick={() => {
                  setOverwritePrompt(false);
                  save();
                }}
                disabled={saving}
              >
                Yes, overwrite
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setOverwritePrompt(false)}
                disabled={saving}
              >
                No, go back
              </button>
            </div>
          }
        >
          <div className="stack">
            <div className="muted">
              {overwriteMessage ||
                "A page with this slug already exists. Overwrite it, or change the title to pick a new slug."}
            </div>
          </div>
        </ModalShell>
      )}

      {showRenameConfirm && (
        <ModalShell
          title="Change page URL?"
          onClose={() => setShowRenameConfirm(false)}
          maxWidth={520}
          footer={
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  setShowRenameConfirm(false);
                  setSlugEditMode(false);
                  await performSave(renameTarget);
                }}
                disabled={saving}
              >
                Change URL
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setShowRenameConfirm(false)}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          }
        >
          <div className="stack">
            <div className="muted">
              You&apos;re changing this page&apos;s URL from {slugToPath(slug)} to{" "}
              {slugToPath(renameTarget)}. Links/bookmarks to the old URL may
              stop working.
            </div>
          </div>
        </ModalShell>
      )}

      {showDraftModal && (
        <ModalShell
          title="Draft available"
          onClose={() => setShowDraftModal(false)}
          maxWidth={460}
          footer={
            <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
              <button
                className="btn"
                onClick={() => {
                  restoreDraft();
                  setShowDraftModal(false);
                }}
              >
                Restore draft
              </button>
              <button className="btn btn-ghost" onClick={discardDraft}>
                Discard draft
              </button>
            </div>
          }
        >
          <div className="stack">
            <div className="muted">Restore the saved draft or discard it.</div>
          </div>
        </ModalShell>
      )}
    </div>
  );
}
