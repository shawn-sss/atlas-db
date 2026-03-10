import React from "react";
import DocumentTree from "../document-tree";
import { normalizeStatus } from "../../../utils/formatters";

export default function DocumentSidebar({
  search,
  onSearchChange,
  trimmedSearch,
  searchResults,
  searchLoading,
  searchError,
  sectionFilter,
  setSectionFilter,
  onSectionChange,
  treeLoading,
  tree,
  onSelect,
  activeSlug,
  onSetStartPage,
  onRemoveStartPage,
  onTogglePin,
  onToggleHome,
  onDelete,
  canDelete,
  collapsedFolders,
  onToggleFolderCollapse,
  openNew,
  disableNew,
  onMove,
  onSetStatus,
}) {
  const handleSearchResultSelect = (slug) => {
    if (onSelect) {
      onSelect(slug);
    }
    if (onSearchChange) {
      onSearchChange("");
    }
  };

  return (
    <aside className="doc-sidebar">
      <header className="doc-sidebar-header">
        <div>
          <h2>Documents</h2>
        </div>
        <div className="doc-sidebar-header-actions">
          <button
            type="button"
            className="btn btn-sm"
            onClick={openNew}
            disabled={disableNew}
          >
            New
          </button>
        </div>
      </header>
      <section
        className="doc-sidebar-section doc-sidebar-search"
        aria-labelledby="sidebar-search-label"
      >
        <h3 id="sidebar-search-label" className="visually-hidden">
          Search documents
        </h3>
        <div className="doc-search-toolbar">
          <div className="doc-search-toolbar-row">
            <input
              className="doc-search"
              placeholder="Search documents..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            <button
              type="button"
              className="doc-search-toolbar-clear btn btn-ghost btn-sm"
              onClick={() => onSearchChange("")}
              disabled={!trimmedSearch}
            >
              Clear
            </button>
          </div>
          <div className="doc-search-toolbar-filters">
            <div className="doc-section-filter" style={{ marginRight: "8px" }}>
              <button
                type="button"
                className={`section-button${
                  sectionFilter === "home" ? " active" : ""
                }`}
                onClick={() =>
                  onSectionChange
                    ? onSectionChange("home")
                    : setSectionFilter("home")
                }
              >
                Home
              </button>
              <button
                type="button"
                className={`section-button${
                  sectionFilter === "library" ? " active" : ""
                }`}
                onClick={() =>
                  onSectionChange
                    ? onSectionChange("library")
                    : setSectionFilter("library")
                }
              >
                Library
              </button>
              <button
                type="button"
                className={`section-button${
                  sectionFilter === "unlisted" ? " active" : ""
                }`}
                onClick={() =>
                  onSectionChange
                    ? onSectionChange("unlisted")
                    : setSectionFilter("unlisted")
                }
              >
                Unlisted
              </button>
              <button
                type="button"
                className={`section-button${
                  sectionFilter === "drafts" ? " active" : ""
                }`}
                onClick={() =>
                  onSectionChange
                    ? onSectionChange("drafts")
                    : setSectionFilter("drafts")
                }
              >
                Drafts
              </button>
            </div>
          </div>
        </div>
      </section>
      {trimmedSearch ? (
        <section
          className="doc-sidebar-section doc-sidebar-search-results"
          aria-labelledby="sidebar-search-results-label"
          aria-live="polite"
        >
          <h4 id="sidebar-search-results-label" className="visually-hidden">
            Search results
          </h4>
          <div className="doc-search-results">
            <div className="doc-search-results-header">
              <span>Results for &ldquo;{trimmedSearch}&rdquo;</span>
              {searchLoading && <span className="muted">Searching...</span>}
            </div>
            {searchError && (
              <div className="doc-search-error">{searchError}</div>
            )}
            {!searchLoading && !searchError && searchResults.length === 0 && (
              <div className="muted">
                No matches yet. Try adjusting your filters.
              </div>
            )}
            <div className="doc-search-results-list">
              {searchResults.map((result) => (
                <button
                  key={result.doc_id || result.slug}
                  type="button"
                  className="doc-search-result"
                  onClick={() => handleSearchResultSelect(result.slug)}
                >
                  <div className="doc-search-result-heading">
                    <strong>{result.title || result.slug}</strong>
                    <span className="doc-search-result-status">
                      {normalizeStatus((result.status || "").toLowerCase())}
                    </span>
                    {result.is_home && (
                      <span className="chip chip-sm chip-section">Home</span>
                    )}
                    {result.is_start_page && (
                      <span className="chip chip-sm">Start</span>
                    )}
                  </div>
                  {result.snippet ? (
                    <div
                      className="doc-search-result-snippet"
                      dangerouslySetInnerHTML={{ __html: result.snippet }}
                    />
                  ) : (
                    <div className="doc-search-result-snippet">
                      {result.slug}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}
      <section
        className="doc-sidebar-section doc-sidebar-tree"
        aria-labelledby="sidebar-tree-label"
      >
        <h3 id="sidebar-tree-label" className="visually-hidden">
          Document tree
        </h3>
        {treeLoading ? (
          <div className="muted" style={{ padding: "0 var(--space-md)" }}>
            Loading documents...
          </div>
        ) : (
          <div className="doc-tree-panel">
            <DocumentTree
              nodes={tree}
              onSelect={onSelect}
              activeSlug={activeSlug}
              onSetStartPage={onSetStartPage}
              onRemoveStartPage={onRemoveStartPage}
              onTogglePin={onTogglePin}
              onToggleHome={onToggleHome}
              onSetStatus={onSetStatus}
              onDelete={onDelete}
              canDelete={canDelete}
              collapsedFolders={collapsedFolders}
              onToggleFolderCollapse={onToggleFolderCollapse}
              onMove={onMove}
            />
          </div>
        )}
      </section>
    </aside>
  );
}
