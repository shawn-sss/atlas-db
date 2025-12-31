import React, { useCallback, useEffect, useState } from "react";
import AppIcon from "../ui/icons/app-icon";
import { apiFetch } from "../../api/client";
import ROUTES from "../../api/routes";
import { DEFAULT_APP_TITLE } from "../../constants/defaults";

export default function WorkspaceOwnerControls({
  bootstrap,
  appIcon,
  onAppIconChange,
  onAppTitleChange,
}) {
  const [title, setTitle] = useState(bootstrap.appTitle || "");
  const [savingTitle, setSavingTitle] = useState(false);

  const [iconPreview, setIconPreview] = useState(appIcon || "");
  const [iconMsg, setIconMsg] = useState("");
  const [iconBusy, setIconBusy] = useState(false);

  useEffect(() => {
    setTitle(bootstrap.appTitle || "");
  }, [bootstrap.appTitle]);

  useEffect(() => {
    setIconPreview(appIcon || "");
  }, [appIcon]);

  const saveTitle = useCallback(async () => {
    const trimmed = (title || "").trim();
    const payload = trimmed || DEFAULT_APP_TITLE;
    setSavingTitle(true);
    try {
      await apiFetch(ROUTES.bootstrapAppTitle, {
        method: "PUT",
        body: { appTitle: payload },
      });
      if (onAppTitleChange) {
        onAppTitleChange(payload);
      }
    } catch (err) {
      console.warn("[WorkspaceOwnerControls] save title", err);
    } finally {
      setSavingTitle(false);
    }
  }, [title, onAppTitleChange]);

  const uploadIcon = useCallback(
    async (file) => {
      if (!file) return;
      setIconMsg("");
      setIconBusy(true);
      try {
        const form = new FormData();
        form.append("file", file);
        const data = await apiFetch(ROUTES.bootstrapAppIcon, {
          method: "POST",
          body: form,
        });
        const url = data?.url || "";
        setIconPreview(url);
        if (onAppIconChange) {
          onAppIconChange(url);
        }
        setIconMsg("Icon saved");
      } catch (err) {
        setIconMsg(err.message || "Upload failed");
      } finally {
        setIconBusy(false);
      }
    },
    [onAppIconChange]
  );

  const handleIconSelect = useCallback(
    (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      uploadIcon(file);
      event.target.value = "";
    },
    [uploadIcon]
  );

  const handleIconReset = useCallback(async () => {
    if (iconBusy) return;
    setIconMsg("");
    setIconBusy(true);
    try {
      await apiFetch(ROUTES.bootstrapAppIcon, { method: "DELETE" });
      setIconPreview("");
      if (onAppIconChange) {
        onAppIconChange("");
      }
      setIconMsg("Icon reset to default");
    } catch (err) {
      setIconMsg(err.message || "Reset failed");
    } finally {
      setIconBusy(false);
    }
  }, [iconBusy, onAppIconChange]);

  const handleIconSelectChange = useCallback(
    (e) => handleIconSelect(e),
    [handleIconSelect]
  );

  return (
    <div className="card">
      <div className="card-title">Workspace details</div>
      <div className="stack">
        <label className="field">
          <span>Workspace title</span>
          <input
            className="input"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
            placeholder="Team or workspace name"
          />
        </label>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            onClick={saveTitle}
            disabled={savingTitle}
          >
            {savingTitle ? "Saving..." : "Save title"}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            type="button"
            onClick={() => {
              setTitle("");
            }}
            disabled={savingTitle}
          >
            Reset to default
          </button>
        </div>
        <label className="field">
          <span>Workspace icon</span>
          <div className="workspace-icon-field">
            <div className="workspace-icon-preview">
              {iconPreview ? (
                <img
                  src={iconPreview}
                  alt={`${title || DEFAULT_APP_TITLE} icon preview`}
                />
              ) : (
                <AppIcon size={52} />
              )}
            </div>
            <div className="workspace-icon-actions">
              <label className="btn btn-secondary btn-sm workspace-icon-upload">
                Upload new icon
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  onChange={handleIconSelectChange}
                />
              </label>
              <button
                className="btn btn-ghost btn-sm"
                type="button"
                onClick={handleIconReset}
                disabled={iconBusy || !iconPreview}
              >
                {iconBusy ? "Resetting..." : "Reset to default"}
              </button>
            </div>
          </div>
          <div className="muted workspace-icon-hint">
            {iconBusy
              ? "Working..."
              : iconMsg || "Square PNG/JPG up to 10MB keeps the circle crisp."}
          </div>
        </label>
      </div>
    </div>
  );
}
