import React, { useEffect, useState } from "react";
import { apiFetch } from "../../../../../api/client";
import ROUTES from "../../../../../api/routes";

export default function BackupsSection({ user, canAdmin }) {
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);

  const role = (user?.role || "").toLowerCase();
  const isAdmin = role === "admin" || role === "owner";

  const fetchList = async () => {
    setError(null);
    try {
      const data = await apiFetch(ROUTES.backups);
      setList(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.message || "Failed to load backups");
      setList([]);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  async function createBackup() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(ROUTES.backup, { method: "POST" });
      await fetchList();
      alert("Backup created");
    } catch (err) {
      setError(err?.message || "Backup failed");
    }
    setBusy(false);
  }

  async function restore(backupFile) {
    if (
      !confirm(
        `Restore from ${backupFile}? This will overwrite current content.`
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(ROUTES.backupRestore, {
        method: "POST",
        body: { file: backupFile },
      });
      alert("Restored from backup; the service will restart shortly.");
    } catch (err) {
      setError(err?.message || "Restore failed");
    }
    setBusy(false);
  }

  async function upload() {
    if (!file) {
      alert("Select a file");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await apiFetch(ROUTES.backupsUpload, { method: "POST", body: fd });
      await fetchList();
      alert("Uploaded");
    } catch (err) {
      setError(err?.message || "Upload failed");
    }
    setBusy(false);
  }

  const handleFileChange = (event) => {
    setFile(event.target.files?.[0] || null);
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="card-title">Backups</div>
        <div className="muted">{!canAdmin ? "Admins only" : ""}</div>
      </div>
      {error && (
        <div className="banner banner-danger" style={{ marginBottom: 10 }}>
          <div className="banner-body">{error}</div>
        </div>
      )}
      <div className="card">
        <div
          className="row"
          style={{ alignItems: "center", justifyContent: "space-between" }}
        >
          <div>
            <div className="card-title">Create backup</div>
            <div className="muted">
              Includes markdown content, database, and history.
            </div>
          </div>
          <button className="btn" onClick={createBackup} disabled={busy}>
            Create
          </button>
        </div>
      </div>
      <div className="card">
        <div className="card-title">Upload backup (.zip)</div>
        <div className="row">
          <input
            className="input"
            style={{ width: "auto" }}
            type="file"
            accept=".zip"
            onChange={handleFileChange}
          />
          <button
            className="btn btn-secondary"
            onClick={upload}
            disabled={busy}
          >
            Upload
          </button>
        </div>
        {file && (
          <div className="muted" style={{ marginTop: 4 }}>
            Selected: {file.name}
          </div>
        )}
      </div>
      <div className="card">
        <div className="card-title">Available backups</div>
        <div className="stack">
          {list.length === 0 && <div className="muted">No backups</div>}
          {list.map((f) => (
            <div
              key={f}
              className="row"
              style={{ justifyContent: "space-between", alignItems: "center" }}
            >
              <div className="list-title">{f}</div>
              <div className="row">
                <a
                  className="btn btn-ghost btn-sm"
                  href={ROUTES.backupFile + "?file=" + encodeURIComponent(f)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download
                </a>
                {isAdmin && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => restore(f)}
                    disabled={busy}
                  >
                    Restore
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
