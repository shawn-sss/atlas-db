import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { renderMarkdown } from "../utils/markdown";
import { apiFetch } from "../api/client";
import ROUTES from "../api/routes";
const Editor = React.lazy(() =>
  import("../components/documents/document-editor/index.jsx")
);
import {
  parseLocation,
  slugToPath,
  slugToSegments,
  parseSearchParams,
  buildSearchString,
  navigate,
} from "../utils/router";
import { getPrefs, savePrefs } from "../utils/userPrefs";

import AuthCanvas from "../components/auth/auth-canvas";
import LoginCard from "../components/auth/login-card";
import WorkspaceSetupFlow from "../components/workspace-setup";
import WorkspaceLayout from "../components/workspace/Layout";
import { DEFAULT_APP_TITLE } from "../constants/defaults";
import {
  SIDEBAR_PREFS_KEY_PREFIX,
  DEFAULT_SECTION_FILTER,
} from "../constants/app";
import { buildTree } from "../utils/tree";
import { cleanSlug, slugify, decodeSlug } from "../utils/slug";
import { formatTimestamp, normalizeStatus } from "../utils/formatters";
import { escapeHtml, extractSection } from "../utils/markdown-helpers";
import { createDefaultCollapsedFolders } from "../utils/app-state";

export default function useWorkspaceSession() {
  const [user, setUser] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [navNodes, setNavNodes] = useState([]);
  const [draftNodes, setDraftNodes] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [content, setContent] = useState("");
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [treeLoading, setTreeLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);
  const [startPageSlug, setStartPageSlug] = useState(null);
  const [bootstrapReady, setBootstrapReady] = useState(false);
  const [bootstrapInfo, setBootstrapInfo] = useState({
    fresh: false,
    bootId: "",
    startPageSlug: "",
    timezone: "",
    appTitle: "",
    appIcon: "",
  });
  const [onboardingStep, setOnboardingStep] = useState("splash");
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editorDualPane, setEditorDualPane] = useState(false);
  const [editorMode, setEditorMode] = useState("edit");
  const [editorDraft, setEditorDraft] = useState(null);
  const [editorCreateFolderMode, setEditorCreateFolderMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState("account");
  const [showNewModal, setShowNewModal] = useState(false);
  const [showFolderPrompt, setShowFolderPrompt] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showReaderModal, setShowReaderModal] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState(null);
  const [folderSaving, setFolderSaving] = useState(false);
  const [parentPickerState, setParentPickerState] = useState(null);
  const parentPickerAction = useRef(null);
  const [pendingNewDocParent, setPendingNewDocParent] = useState("");
  const [pendingFolderParent, setPendingFolderParent] = useState("");
  const isOwner = user?.role === "Owner";
  const canAdmin = !!user && (user.role === "Admin" || user.role === "Owner");
  const canRestoreHistory =
    !!user && (user.role === "Admin" || user.role === "Owner");
  const [historyEntries, setHistoryEntries] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [historyDiffData, setHistoryDiffData] = useState(null);
  const [historyDiffLoading, setHistoryDiffLoading] = useState(false);
  const [historyDiffError, setHistoryDiffError] = useState(null);
  const [showHistoryDiff, setShowHistoryDiff] = useState(false);
  const [historyDiffEntryId, setHistoryDiffEntryId] = useState(null);
  const [historyRestoreId, setHistoryRestoreId] = useState(null);
  const [historyRestoreError, setHistoryRestoreError] = useState(null);
  const [collapsedFolders, setCollapsedFolders] = useState(
    createDefaultCollapsedFolders
  );
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const searchAbortRef = useRef(null);
  const searchTimerRef = useRef(null);
  const openDocAbortRef = useRef(null);
  const openDocRequestRef = useRef(0);
  const previewRef = useRef(null);
  const embedCacheRef = useRef(new Map());
  const embedControllersRef = useRef(new Map());
  const treeAbortRef = useRef(null);
  const draftAbortRef = useRef(null);
  const sidebarPrefsKey = useMemo(
    () => `${SIDEBAR_PREFS_KEY_PREFIX}:${user?.username || "guest"}`,
    [user?.username]
  );
  const docByIdMap = useMemo(() => {
    const map = new Map();
    documents.forEach((doc) => {
      if (doc.doc_id) {
        map.set(doc.doc_id, doc);
      }
    });
    return map;
  }, [documents]);
  const docBySlugMap = useMemo(() => {
    const map = new Map();
    documents.forEach((doc) => {
      if (doc.slug) {
        map.set(cleanSlug(doc.slug), doc);
      }
    });
    return map;
  }, [documents]);
  const selectedDocMetadata = useMemo(() => {
    if (!selectedDoc) return null;
    return {
      status: normalizeStatus((selectedDoc.status || "").toLowerCase()),
      owner: selectedDoc.owner || "",
    };
  }, [selectedDoc]);
  const [sectionFilter, setSectionFilter] = useState(DEFAULT_SECTION_FILTER);
  const markdownResolver = useMemo(
    () => ({
      resolveDocById: (id) => docByIdMap.get(id),
      resolveDocBySlug: (slug) =>
        slug ? docBySlugMap.get(cleanSlug(slug)) : undefined,
    }),
    [docByIdMap, docBySlugMap]
  );
  const aboutDocInfo = useMemo(() => {
    if (!selectedDoc) return null;
    const rawSlug = selectedDoc.slug || "";
    const normalizedSlug = cleanSlug(rawSlug).replace(/^\/+/, "");
    const createdAtValue =
      selectedDoc.created_at || selectedDoc.createdAt || selectedDoc.saved_at;
    const updatedAtValue = selectedDoc.updated_at || selectedDoc.updatedAt;
    return {
      title: selectedDoc.title || selectedDoc.slug || "Untitled",
      url: normalizedSlug ? slugToPath(normalizedSlug) : "Unknown",
      status: normalizeStatus((selectedDoc.status || "").toLowerCase()),
      createdBy: selectedDoc.owner || "Unknown",
      createdAt: formatTimestamp(createdAtValue),
      updatedAt: formatTimestamp(updatedAtValue),
    };
  }, [selectedDoc]);

  const draftNodesWithOrigin = useMemo(() => {
    if (sectionFilter !== "drafts") return draftNodes;
    return (draftNodes || []).map((node) => {
      if (!node?.slug) return node;
      const clean = cleanSlug(node.slug);
      const exists = docBySlugMap.has(clean);
      return {
        ...node,
        originLabel: exists ? "Existing" : "New",
      };
    });
  }, [draftNodes, docBySlugMap, sectionFilter]);

  const filteredNavNodes = useMemo(() => {
    const source =
      sectionFilter === "drafts" ? draftNodesWithOrigin : navNodes;
    return source.filter((node) => {
      if (!node?.slug) return false;
      const nodeStatus = normalizeStatus((node.status || "").toLowerCase());
      if (sectionFilter === "home") {
        return node.is_home && nodeStatus === "published";
      }
      if (sectionFilter === "library") {
        return nodeStatus === "published";
      }
      if (sectionFilter === "unlisted") {
        return nodeStatus === "unlisted";
      }
      if (sectionFilter === "drafts") {
        return nodeStatus === "draft";
      }
      return nodeStatus === "published";
    });
  }, [draftNodesWithOrigin, navNodes, sectionFilter]);

  const tree = useMemo(
    () => buildTree(filteredNavNodes, startPageSlug),
    [filteredNavNodes, startPageSlug]
  );
  const defaultStartPageSlug = useMemo(() => {
    const slug = startPageSlug || navNodes[0]?.slug || "";
    return cleanSlug(slug) || null;
  }, [navNodes, startPageSlug]);
  const normalizedStartPageSlug = useMemo(
    () => cleanSlug(startPageSlug) || null,
    [startPageSlug]
  );
  const trimmedSearch = search.trim();
  const closeParentPicker = useCallback(() => {
    parentPickerAction.current = null;
    setParentPickerState(null);
  }, []);
  const locationTree = useMemo(
    () => buildTree(navNodes, startPageSlug),
    [navNodes, startPageSlug]
  );
  const locationOptions = useMemo(() => {
    const options = [{ slug: "", label: "Root" }];
    const walk = (nodes, depth = 0) => {
      (nodes || []).forEach((node) => {
        if (node?.is_folder) {
          const indent = depth ? `${"- ".repeat(depth)}` : "";
          const label = node.title || node.slug || "Untitled";
          options.push({
            slug: cleanSlug(node.slug),
            label: `${indent}${label}`,
          });
        }
        if (node?.children && node.children.length) {
          walk(node.children, depth + 1);
        }
      });
    };
    walk(locationTree, 0);
    return options;
  }, [locationTree]);
  const requestParentPicker = useCallback((state, action) => {
    parentPickerAction.current = action;
    setParentPickerState(state);
  }, []);
  const handleParentSelected = useCallback(
    async (slug) => {
      const normalized = cleanSlug(slug || "");
      const action = parentPickerAction.current;
      closeParentPicker();
      if (!action) return;
      try {
        await action(normalized);
      } catch (err) {
        setError(err?.message || "Could not complete action");
      }
    },
    [closeParentPicker]
  );
  const openCreateEditor = useCallback((isFolder) => {
    setEditorMode("new");
    setEditorDraft("");
    setEditing(true);
    setShowEditor(true);
    setEditorCreateFolderMode(isFolder);
  }, []);
  const openNewEditor = useCallback(() => {
    setShowNewModal(false);
    setPendingNewDocParent("");
    openCreateEditor(false);
  }, [openCreateEditor]);
  const handleEditorParentChange = useCallback((nextParent) => {
    setPendingNewDocParent(cleanSlug(nextParent || ""));
  }, []);
  const handleNewDocument = useCallback(() => {
    setShowNewModal(false);
    setPendingNewDocParent("");
    openCreateEditor(false);
  }, [openCreateEditor]);
  const promptNewFolder = useCallback(() => {
    setShowNewModal(false);
    const defaultParent = selectedDoc?.is_folder
      ? cleanSlug(selectedDoc.slug)
      : cleanSlug(selectedDoc?.parent_slug || "");
    requestParentPicker(
      {
        title: "New folder location",
        subtitle: "Select a parent folder for the new folder.",
        confirmLabel: "Create folder here",
        initialSelection: defaultParent,
      },
      async (targetParent) => {
        setPendingFolderParent(targetParent || "");
        setFolderError(null);
        setFolderName("");
        setShowFolderPrompt(true);
      }
    );
  }, [
    requestParentPicker,
    selectedDoc?.is_folder,
    selectedDoc?.slug,
    selectedDoc?.parent_slug,
  ]);
  const closeFolderPrompt = useCallback(() => {
    setShowFolderPrompt(false);
    setFolderError(null);
    setFolderName("");
    setFolderSaving(false);
    setPendingFolderParent("");
  }, []);
  const openNewModal = useCallback(() => {
    openNewEditor();
  }, [openNewEditor]);
  const closeNewModal = useCallback(() => {
    setShowNewModal(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let mounted = true;
    try {
      setPrefsLoaded(false);
    } catch (e) {}
    (async () => {
      try {
        const parsed = await getPrefs(user, sidebarPrefsKey);
        const storedCollapsedFolders = parsed?.collapsedFolders;
        const next =
          storedCollapsedFolders && typeof storedCollapsedFolders === "object"
            ? storedCollapsedFolders
            : createDefaultCollapsedFolders();
        if (mounted) setCollapsedFolders(next);
      } catch (err) {
        if (mounted) setCollapsedFolders(createDefaultCollapsedFolders());
      }
      if (mounted) {
        try {
          setPrefsLoaded(true);
        } catch (e) {}
      }
    })();
    return () => {
      mounted = false;
    };
  }, [sidebarPrefsKey, user]);

  useEffect(() => {
    return () => {
      if (treeAbortRef.current) {
        try {
          treeAbortRef.current.abort();
        } catch (e) {
          console.warn("[workspace] abort tree fetch", e);
        }
      }
      if (draftAbortRef.current) {
        try {
          draftAbortRef.current.abort();
        } catch (e) {
          console.warn("[workspace] abort draft fetch", e);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !prefsLoaded) return;
    savePrefs(user, { collapsedFolders }, sidebarPrefsKey);
  }, [collapsedFolders, sidebarPrefsKey, prefsLoaded, user]);

  useEffect(() => {
    if (!showEditor) {
      setEditorCreateFolderMode(false);
    }
  }, [showEditor]);

  const toggleFolderCollapse = useCallback((slug) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [slug]: !prev?.[slug],
    }));
  }, []);
  const loadBootstrap = useCallback(async () => {
    try {
      const data = await apiFetch(ROUTES.bootstrap);
      setBootstrapInfo({
        fresh: !!data.fresh,
        bootId: data.bootId || "",
        startPageSlug: data.startPageSlug || "",
        timezone: data.timezone || "",
        appTitle: data.appTitle || "",
        appIcon: data.appIcon || "",
      });
      setStartPageSlug(data.startPageSlug || null);
    } catch (err) {
      setBootstrapInfo((prev) => ({
        ...prev,
        bootId: "",
        startPageSlug: prev.startPageSlug,
        timezone: prev.timezone,
        appTitle: prev.appTitle,
        appIcon: prev.appIcon,
      }));
      setStartPageSlug(null);
    } finally {
      setBootstrapReady(true);
    }
  }, []);

  const handleAppIconChange = useCallback((iconUrl) => {
    setBootstrapInfo((prev) => ({ ...prev, appIcon: iconUrl || "" }));
  }, []);

  const handleAppTitleChange = useCallback((newTitle) => {
    setBootstrapInfo((prev) => ({ ...prev, appTitle: newTitle || "" }));
  }, []);

  const loadNav = useCallback(async () => {
    if (treeAbortRef.current) {
      treeAbortRef.current.abort();
    }
    const controller = new AbortController();
    treeAbortRef.current = controller;
    setTreeLoading(true);
    setError(null);
    const timeoutId = setTimeout(() => {
      try {
        controller.abort();
      } catch (e) {
        console.warn("[workspace] abort nav fetch", e);
      }
      if (treeAbortRef.current === controller) {
        setError("Failed to load pages (retry)");
      }
    }, 8000);
    const statuses = ["published", "unlisted"];
    const params = new URLSearchParams();
    if (statuses.length) params.set("status", statuses.join(","));
    const navUrl = params.toString()
      ? `${ROUTES.documentsTree}?${params.toString()}`
      : ROUTES.documentsTree;
    try {
      const data = await apiFetch(navUrl, {
        signal: controller.signal,
      });
      if (treeAbortRef.current !== controller) return;
      const list = Array.isArray(data) ? data : [];
      setNavNodes(list);
      setDocuments(list);
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (treeAbortRef.current !== controller) return;
      setError(err.message || "Failed to load pages (retry)");
    } finally {
      clearTimeout(timeoutId);
      if (treeAbortRef.current === controller) {
        setTreeLoading(false);
      }
    }
  }, []);

  const loadHistory = useCallback(async () => {
    const targetSlug = selectedDoc?.slug;
    if (!targetSlug) {
      setHistoryEntries([]);
      setHistoryError(null);
      setHistoryLoading(false);
      return;
    }
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const data = await apiFetch(
        `/api/documenthistory/${encodeURIComponent(targetSlug)}`
      );
      if (selectedDoc?.slug !== targetSlug) return;
      setHistoryEntries(Array.isArray(data) ? data : []);
    } catch (err) {
      if (selectedDoc?.slug !== targetSlug) return;
      setHistoryError(err.message || "Unable to load history");
      setHistoryEntries([]);
    } finally {
      if (selectedDoc?.slug === targetSlug) {
        setHistoryLoading(false);
      }
    }
  }, [selectedDoc?.slug]);

  const handleHistoryDiff = useCallback(
    async (entry) => {
      const targetSlug = selectedDoc?.slug;
      if (!targetSlug) return;
      setHistoryDiffLoading(true);
      setHistoryDiffError(null);
      setHistoryDiffEntryId(entry.id);
      try {
        const data = await apiFetch(
          `/api/documenthistory/diff/${encodeURIComponent(targetSlug)}?id=${
            entry.id
          }`
        );
        if (selectedDoc?.slug !== targetSlug) return;
        setHistoryDiffData(data);
        setShowHistoryDiff(true);
      } catch (err) {
        if (selectedDoc?.slug !== targetSlug) return;
        setHistoryDiffError(err.message || "Unable to load diff");
      } finally {
        if (selectedDoc?.slug === targetSlug) {
          setHistoryDiffLoading(false);
        }
        setHistoryDiffEntryId(null);
      }
    },
    [selectedDoc?.slug]
  );

  const openDocument = useCallback(async (slug) => {
    if (!slug) return;
    const clean = cleanSlug(slug);
    if (openDocAbortRef.current) {
      openDocAbortRef.current.abort();
    }
    const controller = new AbortController();
    openDocAbortRef.current = controller;
    const requestId = openDocRequestRef.current + 1;
    openDocRequestRef.current = requestId;
    setLoadingDoc(true);
    try {
      const data = await apiFetch(
        `/api/document/${encodeURIComponent(clean)}`,
        { signal: controller.signal }
      );
      if (openDocRequestRef.current !== requestId) return;
      setSelectedDoc(data);
      setContent(data.content || "");
      if (data.is_start_page) setStartPageSlug(data.slug);
      try {
        if (typeof window !== "undefined") {
          const path = slugToPath(data.slug);
          const search = window.location.search || "";
          const full = `${path}${search}`;
          if (window.location.pathname + window.location.search !== full) {
            navigate(full, { state: { slug: data.slug } });
          }
        }
      } catch (e) {}
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (openDocRequestRef.current !== requestId) return;
      setError(err.message || "Document not found");
      setSelectedDoc(null);
      setContent("");
    } finally {
      if (openDocRequestRef.current === requestId) {
        setLoadingDoc(false);
      }
    }
  }, []);

  const openDraft = useCallback(async (slug) => {
    if (!slug) return;
    const clean = cleanSlug(slug);
    if (openDocAbortRef.current) {
      openDocAbortRef.current.abort();
    }
    const controller = new AbortController();
    openDocAbortRef.current = controller;
    const requestId = openDocRequestRef.current + 1;
    openDocRequestRef.current = requestId;
    setLoadingDoc(true);
    try {
      const data = await apiFetch(
        ROUTES.draft(encodeURIComponent(clean)),
        { signal: controller.signal }
      );
      if (openDocRequestRef.current !== requestId) return;
      setSelectedDoc(data);
      setContent(data.content || "");
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (openDocRequestRef.current !== requestId) return;
      setError(err.message || "Draft not found");
      setSelectedDoc(null);
      setContent("");
    } finally {
      if (openDocRequestRef.current === requestId) {
        setLoadingDoc(false);
      }
    }
  }, []);

  const loadDrafts = useCallback(async () => {
    if (draftAbortRef.current) {
      draftAbortRef.current.abort();
    }
    const controller = new AbortController();
    draftAbortRef.current = controller;
    setTreeLoading(true);
    setError(null);
    const timeoutId = setTimeout(() => {
      try {
        controller.abort();
      } catch (e) {
        console.warn("[workspace] abort draft fetch", e);
      }
      if (draftAbortRef.current === controller) {
        setError("Failed to load drafts (retry)");
      }
    }, 8000);
    try {
      const data = await apiFetch(ROUTES.draftsTree, {
        signal: controller.signal,
      });
      if (draftAbortRef.current !== controller) return;
      const list = Array.isArray(data) ? data : [];
      setDraftNodes(list);
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (draftAbortRef.current !== controller) return;
      setError(err.message || "Failed to load drafts (retry)");
    } finally {
      clearTimeout(timeoutId);
      if (draftAbortRef.current === controller) {
        setTreeLoading(false);
      }
    }
  }, []);
  const expandParentsForSlug = useCallback(
    (slug) => {
      const normalized = cleanSlug(slug || "");
      if (!normalized) return;
      const map = new Map();
      navNodes.forEach((node) => {
        if (node?.slug) map.set(cleanSlug(node.slug), node);
      });
      let current = map.get(normalized);
      if (!current) return;
      const ancestors = [];
      const seen = new Set();
      while (current?.parent_slug || current?.parent) {
        const parentSlug = cleanSlug(current.parent_slug || current.parent || "");
        if (!parentSlug || seen.has(parentSlug)) break;
        seen.add(parentSlug);
        const parent = map.get(parentSlug);
        if (!parent) break;
        ancestors.push(parent.slug);
        current = parent;
      }
      if (!ancestors.length) return;
      setCollapsedFolders((prev) => {
        let changed = false;
        const next = { ...prev };
        ancestors.forEach((ancestorSlug) => {
          if (next[ancestorSlug] !== false) {
            next[ancestorSlug] = false;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    },
    [navNodes]
  );
  const closeEditor = useCallback(() => {
    setShowEditor(false);
    setEditing(false);
    setEditorDualPane(false);
    setEditorDraft(null);
    setPendingNewDocParent("");
  }, []);
  const selectedSlug = selectedDoc?.slug ? cleanSlug(selectedDoc.slug) : null;
  const handleSidebarSelect = useCallback(
    (slug) => {
      const normalizedSlug = cleanSlug(slug);
      if (!normalizedSlug) return;
      const useDraft = sectionFilter === "drafts";
      closeEditor();
      if (normalizedSlug === selectedSlug) {
        if (useDraft) {
          setSelectedDoc(null);
          setContent("");
          return;
        }
        const parentSlug = selectedDoc
          ? cleanSlug(selectedDoc.parent_slug || selectedDoc.parent || "")
          : null;
        if (parentSlug && parentSlug !== normalizedSlug) {
          useDraft ? openDraft(parentSlug) : openDocument(parentSlug);
          return;
        }
        if (defaultStartPageSlug) {
          useDraft ? openDraft(defaultStartPageSlug) : openDocument(defaultStartPageSlug);
          return;
        }
        setSelectedDoc(null);
        setContent("");
        try {
          if (typeof window !== "undefined") {
            const rootPath = "/";
            if (window.location.pathname !== rootPath) {
              navigate(rootPath, { state: {} });
            }
          }
        } catch (e) {
          console.warn("[workspace] navigate root", e);
        }
        return;
      }
      useDraft ? openDraft(normalizedSlug) : openDocument(normalizedSlug);
    },
    [
      defaultStartPageSlug,
      openDocument,
      openDraft,
      selectedDoc,
      selectedSlug,
      closeEditor,
      sectionFilter,
    ]
  );

  const refreshAfterSave = useCallback(
    async (slug, status) => {
      await loadNav();
      if (status === "draft") {
        await loadDrafts();
      }
      if (slug) openDocument(slug);
    },
    [loadNav, loadDrafts, openDocument]
  );

  const handleFolderSave = useCallback(async () => {
    const trimmedName = folderName.trim();
    if (!trimmedName) {
      setFolderError("Enter a folder name.");
      return;
    }
    setFolderError(null);
    setFolderSaving(true);
    try {
      const parentSlug = cleanSlug(pendingFolderParent || "");
      const base = slugify(trimmedName);
      let attempt = 0;
      let candidateSlug;
      do {
        const suffix = attempt === 0 ? "" : `-${attempt}`;
        const candidateBase = `${base}${suffix}`;
        candidateSlug = parentSlug
          ? `${parentSlug}/${candidateBase}`
          : candidateBase;
        attempt++;
        if (attempt > 50) {
          throw new Error("Unable to pick a unique folder name");
        }
      } while (docBySlugMap.has(cleanSlug(candidateSlug)));
      const requestSlug = `${candidateSlug}/_index`;
      const owner = (user?.username || "owner").trim() || "owner";
      const content = `---\nstatus: published\nowner: ${owner}\n---\n\n# ${trimmedName}\n\nAdd items to the folder!\n`;
      const endpoint = `/api/document/${encodeURI(requestSlug)}`;
      const data = await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
        body: content,
      });
      const createdSlug = data?.slug || candidateSlug;
      closeFolderPrompt();
      await refreshAfterSave(createdSlug);
    } catch (err) {
      setFolderSaving(false);
      setFolderError(err.message || "Failed to create folder");
    }
  }, [
    closeFolderPrompt,
    docBySlugMap,
    folderName,
    pendingFolderParent,
    refreshAfterSave,
    user?.username,
  ]);

  const handleMoveNode = useCallback(
    (node) => {
      if (!node?.slug) return;
      const defaultParent = cleanSlug(node.parent_slug || "");
      const label = node.is_folder ? "folder" : "document";
      requestParentPicker(
        {
          title: `Move ${label}`,
          subtitle: `Choose a parent folder for ${node.title || node.slug}.`,
          confirmLabel: "Move here",
          initialSelection: defaultParent,
          blockedSlug: node.slug,
        },
        async (targetParent) => {
          const payload = {
            slug: node.slug,
            parent: targetParent || "",
          };
          const data = await apiFetch("/api/document/move", {
            method: "POST",
            body: payload,
          });
          await refreshAfterSave(data?.slug || node.slug);
        }
      );
    },
    [refreshAfterSave, requestParentPicker]
  );

  const handleHistoryRollback = useCallback(
    async (entry) => {
      const targetSlug = selectedDoc?.slug;
      if (!targetSlug || !canRestoreHistory) return;
      if (
        !window.confirm(
          "This will overwrite the current document with the selected revision. Continue?"
        )
      ) {
        return;
      }
      setHistoryRestoreError(null);
      setHistoryRestoreId(entry.id);
      try {
        await apiFetch(
          `/api/documentrestore/${encodeURIComponent(targetSlug)}`,
          {
            method: "POST",
            body: { id: entry.id },
          }
        );
        await refreshAfterSave(targetSlug);
        await loadHistory();
      } catch (err) {
        setHistoryRestoreError(err.message || "Rollback failed");
      } finally {
        setHistoryRestoreId(null);
      }
    },
    [canRestoreHistory, loadHistory, refreshAfterSave, selectedDoc?.slug]
  );

  const handleMarkdownLinkClick = useCallback(
    (event) => {
      let node = event.target;
      if (!(node instanceof Element)) {
        node = node?.parentElement || null;
      }
      if (!node) return;
      const anchor = node.closest("a.wiki-link");
      if (!anchor) return;
      event.preventDefault();
      const docId = anchor.dataset.docId;
      if (docId && docByIdMap.has(docId)) {
        const targetSlug = docByIdMap.get(docId).slug;
        expandParentsForSlug(targetSlug);
        openDocument(targetSlug);
        return;
      }
      const slug = anchor.dataset.wikiSlug;
      if (slug) {
        const decoded = decodeSlug(slug);
        expandParentsForSlug(decoded);
        openDocument(decoded);
      }
    },
    [docByIdMap, expandParentsForSlug, openDocument]
  );

  const handleEnterDualPane = useCallback((draft) => {
    setEditorDraft(draft);
    setEditorDualPane(true);
  }, []);

  const handleExitDualPane = useCallback((draft) => {
    if (typeof draft === "string") {
      setEditorDraft(draft);
    }
    setEditorDualPane(false);
  }, []);

  const handlePreviewEdit = useCallback(() => {
    setEditorMode("edit");
    setEditorDraft(content);
    setEditing(true);
    setShowEditor(true);
  }, [content]);

  const handleShowAbout = useCallback(() => {
    setShowAboutModal(true);
  }, []);

  const handleOpenReader = useCallback(() => {
    setShowReaderModal(true);
  }, []);

  const handleCloseReader = useCallback(() => {
    setShowReaderModal(false);
  }, []);

  const handleEditorSaved = async (payload) => {
    const savedSlug = typeof payload === "string" ? payload : payload?.slug;
    const savedStatus = typeof payload === "object" ? payload?.status : null;
    closeEditor();
    if (savedSlug) {
      await refreshAfterSave(savedSlug, savedStatus);
    } else if (selectedDoc?.slug) {
      await refreshAfterSave(selectedDoc.slug, savedStatus);
    } else {
      await loadNav();
    }
  };

  const handleDraftAutoSaved = useCallback(
    async (payload) => {
      if (sectionFilter === "drafts") {
        await loadDrafts();
      }
    },
    [sectionFilter, loadDrafts]
  );

  const handleSetStartPage = useCallback(
    async (slug) => {
      if (!slug) return;
      await apiFetch("/api/start-page", {
        method: "PUT",
        body: { slug },
      });
      setStartPageSlug(slug);
      setBootstrapInfo((prev) => ({ ...prev, startPageSlug: slug }));
      setNavNodes((prev) =>
        prev.map((node) => ({ ...node, is_start_page: node.slug === slug }))
      );
      await loadBootstrap();
      await loadNav();
    },
    [loadBootstrap, loadNav]
  );

  const handleRemoveStartPage = useCallback(async () => {
    await apiFetch("/api/start-page", { method: "DELETE" });
    setStartPageSlug(null);
    setBootstrapInfo((prev) => ({ ...prev, startPageSlug: "" }));
    setNavNodes((prev) =>
      prev.map((node) => ({ ...node, is_start_page: false }))
    );
    await loadBootstrap();
    await loadNav();
  }, [loadBootstrap, loadNav]);

  const handleTogglePin = useCallback(
    async (slug, nextPinned) => {
      if (!slug) return;
      const endpoint = `/api/document/pin/${encodeURIComponent(slug)}`;
      await apiFetch(endpoint, { method: nextPinned ? "PUT" : "DELETE" });
      setNavNodes((prev) =>
        prev.map((node) =>
          node.slug === slug ? { ...node, is_pinned: nextPinned } : node
        )
      );
      setDocuments((prev) =>
        prev.map((node) =>
          node.slug === slug ? { ...node, is_pinned: nextPinned } : node
        )
      );
      await loadNav();
    },
    [loadNav]
  );

  const normalizeHomeSlug = useCallback((value) => {
    if (!value) return "";
    let next = String(value).trim();
    try {
      next = decodeURIComponent(next);
    } catch (err) {}
    next = cleanSlug(next);
    next = next.replace(/^\/+/, "").replace(/\/+$/, "");
    if (next.endsWith("/_index")) {
      next = next.slice(0, -"/_index".length);
    }
    return next;
  }, []);

  const collectDescendants = useCallback(
    (rootSlug, nodes) => {
      const byParent = new Map();
      const bySlug = new Map();
      (nodes || []).forEach((node) => {
        if (!node?.slug) return;
        const nodeSlug = normalizeHomeSlug(node.slug);
        bySlug.set(nodeSlug, node);
        const parentSlug = normalizeHomeSlug(
          node.parent_slug || node.parent || ""
        );
        if (!parentSlug) return;
        if (!byParent.has(parentSlug)) {
          byParent.set(parentSlug, []);
        }
        byParent.get(parentSlug).push(node);
      });
      const descendants = [];
      const seen = new Set();
      const root = normalizeHomeSlug(rootSlug);
      const stack = [root];
      while (stack.length > 0) {
        const current = stack.pop();
        const children = byParent.get(current) || [];
        for (const child of children) {
          if (!child?.slug) continue;
          const childSlug = normalizeHomeSlug(child.slug);
          if (seen.has(childSlug)) continue;
          seen.add(childSlug);
          descendants.push(child);
          if (child?.is_folder) {
            stack.push(childSlug);
          }
        }
      }
      if (root) {
        const prefix = `${root}/`;
        bySlug.forEach((node, nodeSlug) => {
          if (seen.has(nodeSlug)) return;
          if (!nodeSlug.startsWith(prefix)) return;
          seen.add(nodeSlug);
          descendants.push(node);
        });
      }
      return descendants;
    },
    [normalizeHomeSlug]
  );

  const handleToggleHome = useCallback(
    async (slug, nextHome) => {
      if (!slug) return;
      let descendantSlugs = null;
      try {
        const clean = normalizeHomeSlug(slug);
        const normalizedStartSlug = normalizeHomeSlug(
          normalizedStartPageSlug || ""
        );
        if (!nextHome && normalizedStartSlug && normalizedStartSlug === clean) {
          setError(
            "Set a different start page before removing the current one from Home."
          );
          return;
        }
        const endpoint = `/api/document/home/${encodeURIComponent(clean)}`;
        await apiFetch(endpoint, { method: nextHome ? "PUT" : "DELETE" });
        if (!nextHome) {
          const targetNode = navNodes.find(
            (node) => normalizeHomeSlug(node.slug) === clean
          );
          if (targetNode?.is_folder) {
            descendantSlugs = new Set();
            const descendants = collectDescendants(clean, navNodes)
              .filter((node) => node?.slug)
              .filter((node) => node.is_home)
              .filter((node) => {
                const nodeSlug = normalizeHomeSlug(node.slug);
                if (node.is_pinned) return false;
                if (node.is_start_page) return false;
                if (normalizedStartSlug && nodeSlug === normalizedStartSlug)
                  return false;
                return true;
              });
            descendants.forEach((node) =>
              descendantSlugs.add(normalizeHomeSlug(node.slug))
            );
          }
        } else {
          const targetNode = navNodes.find(
            (node) => normalizeHomeSlug(node.slug) === clean
          );
          if (targetNode?.is_folder) {
            descendantSlugs = new Set();
            const descendants = collectDescendants(clean, navNodes).filter(
              (node) => node?.slug
            );
            descendants.forEach((node) =>
              descendantSlugs.add(normalizeHomeSlug(node.slug))
            );
          }
        }
        setNavNodes((prev) =>
          prev.map((node) => {
            const nodeSlug = normalizeHomeSlug(node.slug);
            if (nodeSlug === clean) return { ...node, is_home: nextHome };
            if (descendantSlugs?.has(nodeSlug))
              return { ...node, is_home: nextHome };
            return node;
          })
        );
        setDocuments((prev) =>
          prev.map((node) => {
            const nodeSlug = normalizeHomeSlug(node.slug);
            if (nodeSlug === clean) return { ...node, is_home: nextHome };
            if (descendantSlugs?.has(nodeSlug))
              return { ...node, is_home: nextHome };
            return node;
          })
        );
        if (normalizeHomeSlug(selectedDoc?.slug || "") === clean) {
          setSelectedDoc((prev) =>
            prev ? { ...prev, is_home: nextHome } : prev
          );
        } else if (
          descendantSlugs?.has(normalizeHomeSlug(selectedDoc?.slug || ""))
        ) {
          setSelectedDoc((prev) =>
            prev ? { ...prev, is_home: nextHome } : prev
          );
        }
        await loadNav();
      } catch (err) {
        setError(err.message || "Failed to update Home");
      }
    },
    [
      collectDescendants,
      loadNav,
      navNodes,
      normalizeHomeSlug,
      normalizedStartPageSlug,
      selectedDoc?.slug,
    ]
  );

  const handleSetStatus = useCallback(
    async (slug, nextStatus) => {
      if (!slug) return;
      const normalized = normalizeStatus(nextStatus || "");
      if (!normalized) return;
      try {
        const targetNode = navNodes.find((node) => node?.slug === slug);
        if (normalized === "unlisted" && targetNode?.is_home) {
          await handleToggleHome(slug, false);
        }
        await apiFetch(ROUTES.documentStatus(slug), {
          method: "PUT",
          body: { status: normalized },
        });
        const updateStatusForSlug = (node) => {
          if (!node?.slug) return node;
          const isTarget =
            node.slug === slug || node.slug.startsWith(`${slug}/`);
          if (!isTarget) return node;
          const nextNode = { ...node, status: normalized };
          if (normalized === "unlisted") {
            nextNode.is_home = false;
          }
          return nextNode;
        };
        setNavNodes((prev) => prev.map(updateStatusForSlug));
        setDocuments((prev) => prev.map(updateStatusForSlug));
        setSelectedDoc((prev) => {
          if (!prev?.slug) return prev;
          if (prev.slug !== slug) return prev;
          const nextDoc = { ...prev, status: normalized };
          if (normalized === "unlisted") nextDoc.is_home = false;
          return nextDoc;
        });
        await loadNav();
      } catch (err) {
        setError(err?.message || "Failed to update status");
      }
    },
    [handleToggleHome, loadNav, navNodes]
  );

  const handleSectionChange = useCallback(
    (nextSection) => {
      if (!nextSection) return;
      closeEditor();
      setSelectedDoc(null);
      setContent("");
      setSectionFilter(nextSection);
    },
    [closeEditor]
  );

  const handleDeleteDocument = useCallback(
    async (slug) => {
      if (!slug) return;
      const clean = cleanSlug(slug);
      const isDraft =
        (selectedDoc?.slug === clean &&
          normalizeStatus((selectedDoc?.status || "").toLowerCase()) ===
            "draft") ||
        draftNodes.some((node) => cleanSlug(node?.slug || "") === clean);
      if (!canAdmin && !isDraft) {
        setError("Admin or Owner permissions required to delete.");
        return;
      }
      if (!isDraft && normalizedStartPageSlug && normalizedStartPageSlug === clean) {
        setError(
          "Cannot delete the active start page. Choose a different start page first."
        );
        return;
      }
      const ok = window.confirm(
        isDraft
          ? "This will permanently delete this draft. This cannot be undone."
          : "This will permanently delete this item from the library. This cannot be undone."
      );
      if (!ok) return;
      const endpoint = isDraft
        ? ROUTES.draft(encodeURIComponent(clean))
        : `/api/document/${encodeURIComponent(clean)}`;
      await apiFetch(endpoint, { method: "DELETE" });
      if (selectedDoc?.slug === clean) {
        setSelectedDoc(null);
        setContent("");
      }
      if (isDraft) {
        await loadDrafts();
      } else {
        await loadNav();
      }
    },
    [
      canAdmin,
      draftNodes,
      loadDrafts,
      loadNav,
      normalizedStartPageSlug,
      selectedDoc?.slug,
      selectedDoc?.status,
    ]
  );

  const handleLogout = async () => {
    try {
      await apiFetch("/api/logout", { method: "POST" });
    } catch (err) {
      setError(err.message || "Sign out failed");
      return;
    }
    setUser(null);
    setSelectedDoc(null);
    setContent("");
    setDocuments([]);
    setNavNodes([]);
  };

  const handleNukeWorkspace = useCallback(async () => {
    if (
      !window.confirm(
        "This will delete the entire database, wipe every Markdown document, remove uploaded images, clear backups, and reset config metadata. Continue?"
      )
    ) {
      return;
    }
    try {
      await apiFetch("/api/nuke", { method: "POST" });
      try {
        setSelectedDoc(null);
        setContent("");
        setDocuments([]);
        setNavNodes([]);
        setSearch("");
        setSectionFilter(DEFAULT_SECTION_FILTER);
        setHistoryEntries([]);
        setStartPageSlug(null);
        setShowEditor(false);
        setEditing(false);
        setShowSettings(false);
      } catch (e) {}
      try {
        navigate("/", { replace: true });
        if (
          typeof window !== "undefined" &&
          window.history &&
          window.history.replaceState
        ) {
          window.history.replaceState({}, "", "/");
        }
      } catch (e) {}
      alert("Workspace wiped. Reloading...");
      window.location.reload();
    } catch (err) {
      setError(err.message || "Nuke failed");
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    apiFetch("/api/me")
      .then((data) => {
        if (!mounted) return;
        if (!data) {
          setUser(null);
          return;
        }
        setUser(data);
      })
      .catch(() => {
        if (mounted) {
          setUser(null);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const { q, section } = parseSearchParams(
      window.location.search || ""
    );
    if (typeof q === "string" && q !== "") setSearch(q);
    if (section) setSectionFilter(section);

    const route = parseLocation(window.location);
    switch (route.type) {
      case "welcome":
        setOnboardingStep("welcome");
        return;
      case "setup":
        setOnboardingStep("setup");
        return;
      case "settings":
        setSettingsCategory(route.category || "account");
        setShowSettings(true);
        return;
      case "editor-new":
        openNewEditor();
        return;
      case "newFolder":
        setShowFolderPrompt(true);
        return;
      case "about":
        if (route.slug) {
          openDocument(route.slug)
            .then(() => setShowAboutModal(true))
            .catch((err) => console.warn("[workspace] open about", err));
        }
        return;
      case "reader":
        if (route.slug) {
          openDocument(route.slug)
            .then(() => setShowReaderModal(true))
            .catch((err) => console.warn("[workspace] open reader", err));
        }
        return;
      case "history":
        if (route.slug) {
          openDocument(route.slug)
            .then(() => {
              setShowHistoryDiff(true);
            })
            .catch((err) => console.warn("[workspace] open history diff", err));
        }
        return;
      case "edit":
        if (route.slug) {
          openDocument(route.slug)
            .then(() => {
              setEditorMode("edit");
              setShowEditor(true);
              setEditing(true);
            })
            .catch((err) => console.warn("[workspace] open edit", err));
        }
        return;
      case "doc":
        if (route.slug) {
          openDocument(route.slug);
          if (route.canonicalize) {
            try {
              navigate(slugToPath(route.slug), { replace: true, state: {} });
            } catch (e) {
              console.warn("[workspace] canonicalize nav", e);
            }
          }
        }
        return;
      default:
        return;
    }
  }, [openDocument, openNewEditor]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = (ev) => {
      const state = ev.state || {};
      if (state && state.slug) {
        openDocument(state.slug);
        return;
      }
      const { q, section } = parseSearchParams(
        window.location.search || ""
      );
      if (typeof q === "string") setSearch(q);
      if (section) setSectionFilter(section);

      const route = parseLocation(window.location);
      switch (route.type) {
        case "welcome":
          setOnboardingStep("welcome");
          return;
        case "setup":
          setOnboardingStep("setup");
          return;
        case "editor-new":
          openNewEditor();
          return;
        case "doc":
          if (route.slug) {
            openDocument(route.slug).catch((err) =>
              console.warn("[workspace] pop doc", err)
            );
            return;
          }
          break;
        case "about":
          if (route.slug) {
            openDocument(route.slug)
              .then(() => setShowAboutModal(true))
              .catch((err) => console.warn("[workspace] pop about", err));
            return;
          }
          break;
        case "reader":
          if (route.slug) {
            openDocument(route.slug)
              .then(() => setShowReaderModal(true))
              .catch((err) => console.warn("[workspace] pop reader", err));
            return;
          }
          break;
        case "history":
          if (route.slug) {
            openDocument(route.slug)
              .then(() => {
                setShowHistoryDiff(true);
              })
              .catch((err) =>
                console.warn("[workspace] pop history diff", err)
              );
            return;
          }
          break;
        case "settings":
          setSettingsCategory(route.category || "account");
          setShowSettings(true);
          return;
        case "new":
        case "newFolder":
          setShowFolderPrompt(true);
          return;
        case "edit":
          if (route.slug) {
            openDocument(route.slug)
              .then(() => {
                setEditorMode("edit");
                setShowEditor(true);
                setEditing(true);
              })
              .catch((err) => console.warn("[workspace] pop edit", err));
            return;
          }
          break;
        default:
          setShowSettings(false);
          setShowNewModal(false);
          setShowFolderPrompt(false);
          setShowEditor(false);
          setSelectedDoc(null);
          setContent("");
          return;
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [openDocument, openNewEditor]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!bootstrapReady || !bootstrapInfo.fresh || onboardingComplete) return;
    const desired =
      onboardingStep === "welcome"
        ? "/welcome"
        : onboardingStep === "setup"
        ? "/setup"
        : "/";
    if (window.location.pathname !== desired) {
      try {
        navigate(desired, { state: {} });
      } catch (e) {
        console.warn("[workspace] onboarding URL sync", e);
      }
    }
  }, [onboardingStep, bootstrapReady, bootstrapInfo.fresh, onboardingComplete]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const includeSection =
      sectionFilter && sectionFilter !== DEFAULT_SECTION_FILTER;
    const searchStr = buildSearchString({
      q: search || "",
      section: includeSection ? sectionFilter : "",
    });
    const pathname = window.location.pathname || "/";
    const full = `${pathname}${searchStr}`;
    try {
      const current = window.location.pathname + window.location.search;
      if (current !== full) {
        navigate(full, { replace: true, state: {} });
      }
    } catch (e) {
      console.warn("[workspace] push filters to URL", e);
    }
  }, [search, sectionFilter, draftNodes]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (showSettings) {
        const cat = settingsCategory || "account";
        const path = cat ? `/settings/${cat}` : "/settings";
        if (window.location.pathname !== path)
          navigate(path, { state: { panel: "settings", cat } });
      } else if (window.location.pathname.startsWith("/settings")) {
        navigate("/", { state: {} });
      }
    } catch (e) {
      console.warn("[workspace] sync settings URL", e);
    }
  }, [showSettings, settingsCategory]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (showNewModal) {
        if (window.location.pathname !== "/new")
          navigate("/new", { state: { panel: "new" } });
      } else if (
        window.location.pathname === "/new" &&
        !showEditor &&
        !showFolderPrompt
      ) {
        navigate("/", { state: {} });
      }
    } catch (e) {
      console.warn("[workspace] sync new modal URL", e);
    }
  }, [showNewModal, showEditor, showFolderPrompt]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (showFolderPrompt) {
        if (window.location.pathname !== "/new/folder")
          navigate("/new/folder", { state: { panel: "new-folder" } });
      } else if (
        window.location.pathname === "/new/folder" ||
        window.location.pathname === "/new-folder"
      ) {
        navigate("/", { state: {} });
      }
    } catch (e) {
      console.warn("[workspace] sync folder prompt URL", e);
    }
  }, [showFolderPrompt]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (showEditor) {
        if (editorMode === "edit" && selectedDoc?.slug) {
          const path = `/edit/${slugToSegments(selectedDoc.slug)}`;
          const search = window.location.search || "";
          const full = `${path}${search}`;
          if (window.location.pathname + window.location.search !== full) {
            navigate(full, {
              state: { editor: "edit", slug: selectedDoc.slug },
            });
          }
        } else {
          if (window.location.pathname !== "/editor/new")
            navigate("/editor/new", { state: { editor: "new" } });
        }
      } else if (
        window.location.pathname.startsWith("/edit") ||
        window.location.pathname === "/editor/new" ||
        window.location.pathname === "/new"
      ) {
        navigate("/", { state: {} });
      }
    } catch (e) {
      console.warn("[workspace] sync editor URL", e);
    }
  }, [showEditor, editorMode, selectedDoc?.slug]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (showAboutModal && selectedDoc?.slug) {
        const path = `/about/${slugToSegments(selectedDoc.slug)}`;
        if (window.location.pathname !== path)
          navigate(path, { state: { panel: "about", slug: selectedDoc.slug } });
      } else if (window.location.pathname.startsWith("/about")) {
        navigate("/", { state: {} });
      }
    } catch (e) {
      console.warn("[workspace] sync about URL", e);
    }
  }, [showAboutModal, selectedDoc?.slug]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (showReaderModal && selectedDoc?.slug) {
        const path = `/reader/${slugToSegments(selectedDoc.slug)}`;
        if (window.location.pathname !== path)
          navigate(path, {
            state: { panel: "reader", slug: selectedDoc.slug },
          });
      } else if (window.location.pathname.startsWith("/reader")) {
        navigate("/", { state: {} });
      }
    } catch (e) {
      console.warn("[workspace] sync reader URL", e);
    }
  }, [showReaderModal, selectedDoc?.slug]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (showHistoryDiff && selectedDoc?.slug) {
        const id = historyDiffEntryId || "";
        const path = `/history/${slugToSegments(selectedDoc.slug)}`;
        const full = id ? `${path}?id=${encodeURIComponent(id)}` : path;
        if (window.location.pathname + window.location.search !== full)
          navigate(full, {
            state: { panel: "history", slug: selectedDoc.slug, id },
          });
      } else if (window.location.pathname.startsWith("/history")) {
        navigate("/", { state: {} });
      }
    } catch (e) {
      console.warn("[workspace] sync history URL", e);
    }
  }, [showHistoryDiff, selectedDoc?.slug, historyDiffEntryId]);

  useEffect(() => {
    if (user && (!bootstrapInfo.fresh || onboardingComplete)) {
      loadNav();
    }
  }, [user, bootstrapInfo.fresh, onboardingComplete, loadNav]);

  useEffect(() => {
    if (!user || (bootstrapInfo.fresh && !onboardingComplete)) return;
    if (sectionFilter === "drafts") {
      loadDrafts();
    } else {
      loadNav();
    }
  }, [
    sectionFilter,
    user,
    bootstrapInfo.fresh,
    onboardingComplete,
    loadNav,
    loadDrafts,
  ]);

  useEffect(() => {
    setHistoryEntries([]);
    setHistoryDiffData(null);
    setShowHistoryDiff(false);
    setHistoryDiffError(null);
    setHistoryDiffEntryId(null);
    setHistoryRestoreId(null);
    setHistoryRestoreError(null);
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
      searchAbortRef.current = null;
    }
    const trimmed = search.trim();
    if (trimmed === "") {
      setSearchResults([]);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }
    if (sectionFilter === "drafts") {
      const q = trimmed.toLowerCase();
      const list = (draftNodes || []).filter((item) => {
        const title = (item?.title || "").toLowerCase();
        const slug = (item?.slug || "").toLowerCase();
        return title.includes(q) || slug.includes(q);
      });
      setSearchResults(list);
      setSearchError(null);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    searchTimerRef.current = setTimeout(() => {
      const controller = new AbortController();
      searchAbortRef.current = controller;
      const params = new URLSearchParams();
      params.set("q", trimmed);
      params.set("field", "title");
      params.set("limit", "50");
      const statuses =
        sectionFilter === "unlisted"
          ? ["unlisted"]
          : sectionFilter === "drafts"
          ? ["draft"]
          : ["published"];
      if (statuses.length) params.set("status", statuses.join(","));
      apiFetch(`/api/documents/search?${params.toString()}`, {
        signal: controller.signal,
      })
        .then((data) => {
          const list = Array.isArray(data) ? data : [];
          const next =
            sectionFilter === "home"
              ? list.filter((item) => item?.is_home)
              : sectionFilter === "library"
              ? list
              : list;
          setSearchResults(next);
          setSearchError(null);
        })
        .catch((err) => {
          if (err.name === "AbortError") return;
          setSearchResults([]);
          setSearchError(err.message || "Search failed");
        })
        .finally(() => {
          if (searchAbortRef.current === controller) {
            searchAbortRef.current = null;
            setSearchLoading(false);
          }
        });
    }, 350);
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
      if (searchAbortRef.current) {
        searchAbortRef.current.abort();
        searchAbortRef.current = null;
      }
    };
  }, [search, sectionFilter]);

  useEffect(() => {
    const container = previewRef.current;
    if (!container) return;
    const nodes = Array.from(
      container.querySelectorAll(".md-embed[data-embed-slug]")
    );
    if (nodes.length === 0) return;
    embedControllersRef.current.forEach((ctrl) => ctrl.abort());
    embedControllersRef.current.clear();

    nodes.forEach((node) => {
      const slugAttr = node.dataset.embedSlug;
      if (!slugAttr) return;
      const slug = decodeSlug(slugAttr);
      if (!slug) return;
      const fragment = node.dataset.embedFragment || "";
      const key = `${slug}|${fragment}`;
      if (embedCacheRef.current.has(key)) {
        node.innerHTML = embedCacheRef.current.get(key);
        node.classList.add("md-embed--loaded");
        return;
      }
      if (embedControllersRef.current.has(key)) return;
      const controller = new AbortController();
      embedControllersRef.current.set(key, controller);
      apiFetch(`/api/document/${encodeURIComponent(slug)}`, {
        signal: controller.signal,
      })
        .then((data) => {
          if (controller.signal.aborted) return;
          const body = fragment
            ? extractSection(data.content || "", fragment)
            : data.content || "";
          const panelHtml = `
            <div class="md-embed-panel">
              <div class="md-embed-panel-title">${escapeHtml(
                data.title || data.slug || slug
              )}</div>
              <div class="md-embed-panel-meta">${escapeHtml(
                normalizeStatus((data.status || "").toLowerCase())
              )}</div>
              <div class="md-embed-panel-body">${renderMarkdown(
                body || " ",
                markdownResolver
              )}</div>
            </div>`;
          embedCacheRef.current.set(key, panelHtml);
          node.innerHTML = panelHtml;
          node.classList.add("md-embed--loaded");
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          node.classList.add("md-embed--error");
          node.innerHTML = `<span class="md-embed-error">${escapeHtml(
            err.message || "Unable to load embed"
          )}</span>`;
        })
        .finally(() => {
          embedControllersRef.current.delete(key);
        });
    });

    return () => {
      embedControllersRef.current.forEach((ctrl) => ctrl.abort());
      embedControllersRef.current.clear();
    };
  }, [content, markdownResolver]);

  useEffect(() => {
    if (selectedDoc || navNodes.length === 0) return;
    const slug = startPageSlug || navNodes[0]?.slug;
    if (slug) {
      openDocument(slug);
    }
  }, [startPageSlug, navNodes, selectedDoc]);

  useEffect(() => {
    if (!selectedDoc) return;
    const nodeStatus = normalizeStatus((selectedDoc.status || "").toLowerCase());
    if (sectionFilter === "unlisted" && nodeStatus === "unlisted") return;
    if (sectionFilter === "drafts" && nodeStatus === "draft") return;
    if (nodeStatus !== "unlisted" && nodeStatus !== "draft") return;
    closeEditor();
    setSelectedDoc(null);
    setContent("");
    try {
      if (typeof window !== "undefined") {
        navigate("/", { state: {} });
      }
    } catch (e) {
      console.warn("[workspace] navigate root", e);
    }
  }, [closeEditor, sectionFilter, selectedDoc]);

  const handleOnboardingComplete = useCallback(() => {
    setOnboardingComplete(true);
    loadBootstrap();
  }, [loadBootstrap]);

  const previewContent = loadingDoc ? (
    <div className="muted">Loading document...</div>
  ) : selectedDoc ? (
    <div
      className="markdown-view"
      ref={previewRef}
      onClick={handleMarkdownLinkClick}
      dangerouslySetInnerHTML={{
        __html: renderMarkdown(content, markdownResolver),
      }}
    />
  ) : (
    <div className="empty">
      <h3>No document selected</h3>
      <p>
        {startPageSlug
          ? "Select a document from the left sidebar."
          : "Create your Start page by clicking New."}
      </p>
    </div>
  );

  const prevEditorSlugRef = useRef(null);
  useEffect(() => {
    const current = selectedDoc?.slug || null;
    if (!showEditor || editorMode !== "edit") {
      prevEditorSlugRef.current = current;
      return;
    }
    const previous = prevEditorSlugRef.current;
    if (previous && current && previous !== current) {
      setEditorDraft(null);
    }
    prevEditorSlugRef.current = current;
  }, [editorMode, selectedDoc?.slug, showEditor]);

  const editorSlug =
    editorMode === "edit" && selectedDoc ? selectedDoc.slug : "";
  const editorInitial = editorDraft ?? (editorMode === "edit" ? content : "");
  const editorInitialFolder =
    editorMode === "edit" ? selectedDoc?.is_folder : editorCreateFolderMode;
  const editorIsHome = editorMode === "edit" ? !!selectedDoc?.is_home : false;

  const editorSharedProps = {
    slug: editorSlug,
    initial: editorInitial,
    initialFolder: editorInitialFolder,
    onSaved: handleEditorSaved,
    onCancel: closeEditor,
    endpointPrefix: "/api/document/",
    linkables: documents,
    metadata: selectedDocMetadata,
    currentUser: user,
    currentDocId: editorMode === "edit" ? selectedDoc?.doc_id : null,
    parentSlug: editorMode === "new" ? pendingNewDocParent : "",
    parentOptions: editorMode === "new" ? locationOptions : [],
    onParentSlugChange: editorMode === "new" ? handleEditorParentChange : null,
    isHome: editorIsHome,
    onDraftAutoSaved: handleDraftAutoSaved,
  };

  const sidebarProps = {
    search,
    onSearchChange: setSearch,
    trimmedSearch,
    searchResults,
    searchLoading,
    searchError,
    sectionFilter,
    setSectionFilter,
    onSectionChange: handleSectionChange,
    treeLoading,
    tree,
    onSelect: handleSidebarSelect,
    activeSlug: selectedDoc?.slug,
    onSetStartPage: handleSetStartPage,
    onRemoveStartPage: handleRemoveStartPage,
    onTogglePin: handleTogglePin,
    onToggleHome: handleToggleHome,
    onDelete: handleDeleteDocument,
    canDelete: canAdmin,
    collapsedFolders,
    onToggleFolderCollapse: toggleFolderCollapse,
    openNew: openNewModal,
    disableNew: showEditor,
    onMove: handleMoveNode,
    onSetStatus: handleSetStatus,
  };

  const workspaceEditorProps = {
    showEditor,
    editorDualPane,
    selectedDoc,
    editorSharedProps,
    onEnterDualPane: handleEnterDualPane,
    onExitDualPane: handleExitDualPane,
    onShowAbout: handleShowAbout,
    onStartEditing: handlePreviewEdit,
    onOpenReader: handleOpenReader,
  };

  const parentPickerProps = {
    show: Boolean(parentPickerState),
    tree,
    state: parentPickerState || {},
    onClose: closeParentPicker,
    onConfirm: handleParentSelected,
  };

  const newModalProps = {
    show: showNewModal,
    onClose: closeNewModal,
    onDocument: handleNewDocument,
    onFolderSelect: promptNewFolder,
  };

  const folderPromptProps = {
    show: showFolderPrompt,
    folderName,
    onFolderNameChange: setFolderName,
    onClose: closeFolderPrompt,
    onSave: handleFolderSave,
    busy: folderSaving,
    error: folderError,
    parentSlug: pendingFolderParent || "",
  };

  const aboutModalProps = {
    show: showAboutModal,
    selectedDoc,
    info: aboutDocInfo,
    onClose: () => setShowAboutModal(false),
    historyEntries,
    historyLoading,
    historyError,
    historyRestoreError,
    historyRestoreId,
    historyDiffLoading,
    historyDiffEntryId,
    onHistoryDiff: handleHistoryDiff,
    onHistoryRollback: handleHistoryRollback,
    canRestoreHistory,
  };

  const readerModalProps = {
    show: showReaderModal,
    selectedDoc,
    html: renderMarkdown(content, markdownResolver),
    info: aboutDocInfo,
    onClose: handleCloseReader,
  };

  const editorOverlayProps = {
    show: showEditor && editorDualPane,
    component: Editor,
    props: {
      ...editorSharedProps,
      isDualPane: true,
      onExitDualPane: handleExitDualPane,
    },
  };

  const settingsProps = {
    show: showSettings,
    user,
    startPageSlug,
    bootstrap: bootstrapInfo,
    initialCategory: settingsCategory,
    onCategoryChange: setSettingsCategory,
    onClose: () => setShowSettings(false),
    onSetStartPage: handleSetStartPage,
    onNuke: handleNukeWorkspace,
    onAppIconChange: handleAppIconChange,
    onAppTitleChange: handleAppTitleChange,
  };

  const errorProps = {
    message: error,
    onClose: () => setError(null),
  };

  const historyDiffProps = {
    show: showHistoryDiff,
    data: historyDiffData,
    loading: historyDiffLoading,
    error: historyDiffError,
    onClose: () => {
      setShowHistoryDiff(false);
      setHistoryDiffData(null);
      setHistoryDiffError(null);
    },
  };

  const showOnboarding =
    bootstrapReady && bootstrapInfo.fresh && !onboardingComplete;
  const appTitleText =
    (bootstrapInfo.appTitle || "").trim() || DEFAULT_APP_TITLE;

  useEffect(() => {
    if (!bootstrapReady) return;
    document.title = appTitleText;
  }, [appTitleText, bootstrapReady]);

  const mainContent = !bootstrapReady ? (
    <div className="auth-view">
      <div className="auth-inner">
        <div className="muted">Loading configuration...</div>
      </div>
    </div>
  ) : showOnboarding ? (
    <WorkspaceSetupFlow
      stage={onboardingStep}
      onStageChange={setOnboardingStep}
      onLogin={(u) => setUser(u)}
      onComplete={handleOnboardingComplete}
      bootstrap={bootstrapInfo}
    />
  ) : !user ? (
    <AuthCanvas
      title="Sign in to your team wiki"
      description="Docs are ready when you are."
      brandTitle={appTitleText}
      brandSubtitle="Document knowledge base"
      brandIcon={bootstrapInfo.appIcon}
    >
      <LoginCard onLogin={(u) => setUser(u)} />
    </AuthCanvas>
  ) : (
    <WorkspaceLayout
      appTitleText={appTitleText}
      bootstrapInfo={bootstrapInfo}
      isOwner={isOwner}
      onNukeWorkspace={handleNukeWorkspace}
      onOpenSettings={() => setShowSettings(true)}
      onLogout={handleLogout}
      sidebarProps={sidebarProps}
      editorComponent={Editor}
      editorProps={workspaceEditorProps}
      previewContent={previewContent}
    />
  );

  return {
    editing,
    mainContent,
    newModalProps,
    folderPromptProps,
    parentPickerProps,
    aboutModalProps,
    readerModalProps,
    editorOverlayProps,
    settingsProps,
    errorProps,
    historyDiffProps,
  };
}
