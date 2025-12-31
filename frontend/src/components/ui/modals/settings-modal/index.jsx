import React, { useEffect, useState } from "react";
import ModalShell from "..";
import IconAdmin from "../../icons/icon-admin";
import IconOwner from "../../icons/icon-owner";
import IconUser from "../../icons/icon-user";
import { apiFetch } from "../../../../api/client";
import ROUTES from "../../../../api/routes";
import AccountSection from "./sections/AccountSection";
import UsersSection from "./sections/UsersSection";
import WorkspaceSection from "./sections/WorkspaceSection";
import BackupsSection from "./sections/BackupsSection";
import OwnerSection from "./sections/OwnerSection";

export default function SettingsModal({
  user,
  startPageSlug,
  bootstrap,
  initialCategory,
  onCategoryChange,
  onClose,
  onNuke,
  onAppIconChange,
  onAppTitleChange,
}) {
  const canAdmin = !!user && (user.role === "Admin" || user.role === "Owner");
  const isOwner = !!user && user.role === "Owner";
  const categories = [
    { id: "account", label: "Account", roles: "all" },
    { id: "users", label: "Users", roles: "admin" },
    { id: "workspace", label: "Workspace", roles: "admin_owner" },
    { id: "backups", label: "Backups", roles: "admin" },
    { id: "owner", label: "Owner", roles: "owner" },
  ];
  const [activeCat, setActiveCat] = useState(initialCategory || "account");
  const [userError, setUserError] = useState(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: "",
    password: "",
    role: "User",
  });
  const [nukeBusy, setNukeBusy] = useState(false);

  useEffect(() => {
    if (!canAdmin && ["users", "backups", "workspace"].includes(activeCat)) {
      setActiveCat("account");
    }
    if (!isOwner && activeCat === "owner") {
      setActiveCat("account");
    }
  }, [activeCat, canAdmin, isOwner]);

  useEffect(() => {
    if (typeof onCategoryChange === "function") {
      onCategoryChange(activeCat);
    }
  }, [activeCat, onCategoryChange]);

  useEffect(() => {
    if (!initialCategory) return;

    setActiveCat((currentCat) =>
      currentCat === initialCategory ? currentCat : initialCategory
    );
  }, [initialCategory]);

  const handleCreateUser = async () => {
    if (!createForm.username || !createForm.password) {
      setUserError("Provide username and password.");
      return;
    }
    setCreateBusy(true);
    setUserError(null);
    try {
      await apiFetch(ROUTES.users, {
        method: "POST",
        body: createForm,
      });
      setCreateForm({ username: "", password: "", role: "User" });
    } catch (err) {
      setUserError(err.message);
    } finally {
      setCreateBusy(false);
    }
  };

  const triggerNuke = async () => {
    if (!onNuke) return;
    setNukeBusy(true);
    try {
      await onNuke();
    } catch (err) {
      setUserError(err.message);
    } finally {
      setNukeBusy(false);
    }
  };

  const handleCreateFormChange = (field, value) => {
    setCreateForm((form) => ({ ...form, [field]: value }));
  };

  return (
    <ModalShell
      eyebrow="Settings"
      title="Workspace settings"
      onClose={onClose}
      className="modal-settings"
    >
      <div className="settings-shell">
        <div style={{ minWidth: 160 }} className="stack settings-shell-nav">
          {categories.map((cat) => {
            const restricted = cat.roles !== "all";
            let titleText = "";
            if (cat.roles === "admin") titleText = "Admins only";
            else if (cat.roles === "owner") titleText = "Owners only";
            else if (cat.roles === "admin_owner")
              titleText = "Admins or Owners";
            return (
              <button
                key={cat.id}
                className={`tab ${activeCat === cat.id ? "tab-active" : ""}`}
                type="button"
                onClick={() => setActiveCat(cat.id)}
                title={restricted ? titleText : ""}
                style={{ textAlign: "left" }}
              >
                <span className="nav-icon">
                  {cat.roles === "admin" && <IconAdmin />}
                  {cat.roles === "owner" && <IconOwner />}
                  {cat.roles === "admin_owner" && (
                    <>
                      <IconAdmin />
                      <span style={{ width: 8 }} />
                      <IconOwner />
                    </>
                  )}
                  {cat.roles === "all" && <IconUser />}
                </span>
                <span className="nav-label">{cat.label}</span>
              </button>
            );
          })}
        </div>
        <div className="settings-shell-content">
          {userError && (
            <div className="banner banner-info" style={{ marginBottom: 10 }}>
              <div className="banner-body">{userError}</div>
            </div>
          )}

          <div className="muted settings-note" style={{ marginBottom: 8 }}>
            Select a section on the left to manage your account, invite
            teammates, workspace settings, backups, and owner actions.
          </div>

          {activeCat === "account" && <AccountSection user={user} />}
          {activeCat === "users" && (
            <UsersSection
              createForm={createForm}
              onCreateFormChange={handleCreateFormChange}
              onCreateUser={handleCreateUser}
              createBusy={createBusy}
            />
          )}
          {activeCat === "workspace" && (
            <WorkspaceSection
              bootstrap={bootstrap}
              appIcon={bootstrap.appIcon}
              onAppIconChange={onAppIconChange}
              onAppTitleChange={onAppTitleChange}
            />
          )}
          {activeCat === "backups" && (
            <BackupsSection user={user} canAdmin={canAdmin} />
          )}
          {activeCat === "owner" && (
            <OwnerSection
              bootstrap={bootstrap}
              startPageSlug={startPageSlug}
              onNuke={triggerNuke}
              nukeBusy={nukeBusy}
            />
          )}
        </div>
      </div>
    </ModalShell>
  );
}
