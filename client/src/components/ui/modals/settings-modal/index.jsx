import React, { useCallback, useEffect, useState } from "react";
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
import { hasAdminAccess, isOwnerRole } from "../../../../utils/userRoles";
const SETTINGS_CATEGORIES = [{
  id: "account",
  label: "Account",
  roles: "all"
}, {
  id: "users",
  label: "Users",
  roles: "admin_owner"
}, {
  id: "workspace",
  label: "Workspace",
  roles: "admin_owner"
}, {
  id: "backups",
  label: "Backups",
  roles: "admin_owner"
}, {
  id: "owner",
  label: "Owner",
  roles: "owner"
}];
export default function SettingsModal({
  user,
  startPageSlug,
  bootstrap,
  initialCategory,
  onCategoryChange,
  onClose,
  onNuke,
  onAppIconChange,
  onAppTitleChange
}) {
  const canAdmin = hasAdminAccess(user);
  const canOwner = isOwnerRole(user);
  const canAccessCategory = useCallback(category => {
    if (!category || category.roles === "all") return true;
    if (category.roles === "admin_owner") return canAdmin;
    if (category.roles === "owner") return canOwner;
    return false;
  }, [canAdmin, canOwner]);
  const visibleCategories = SETTINGS_CATEGORIES.filter(canAccessCategory);
  const firstAvailableCategory = visibleCategories[0]?.id || "account";
  const normalizeCategory = useCallback(nextCat => {
    if (!nextCat) return firstAvailableCategory;
    const match = SETTINGS_CATEGORIES.find(category => category.id === nextCat);
    if (!match || !canAccessCategory(match)) {
      return firstAvailableCategory;
    }
    return nextCat;
  }, [canAccessCategory, firstAvailableCategory]);
  const [activeCat, setActiveCat] = useState(() => normalizeCategory(initialCategory || firstAvailableCategory));
  const [userError, setUserError] = useState(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: "",
    password: "",
    role: "User"
  });
  const [nukeBusy, setNukeBusy] = useState(false);
  const [usersRefreshKey, setUsersRefreshKey] = useState(0);
  useEffect(() => {
    if (typeof onCategoryChange === "function") {
      onCategoryChange(activeCat);
    }
  }, [activeCat, onCategoryChange]);
  useEffect(() => {
    if (!initialCategory) return;
    const nextCat = normalizeCategory(initialCategory);
    setActiveCat(currentCat => currentCat === nextCat ? currentCat : nextCat);
  }, [initialCategory, normalizeCategory]);
  useEffect(() => {
    const nextCat = normalizeCategory(activeCat);
    if (nextCat !== activeCat) {
      setActiveCat(nextCat);
    }
  }, [activeCat, normalizeCategory]);
  const handleCreateUser = async () => {
    if (!createForm.username || !createForm.password) {
      setUserError("Provide username and password.");
      return false;
    }
    setCreateBusy(true);
    setUserError(null);
    try {
      await apiFetch(ROUTES.users, {
        method: "POST",
        body: createForm
      });
      setCreateForm({
        username: "",
        password: "",
        role: "User"
      });
      setUsersRefreshKey(prev => prev + 1);
      return true;
    } catch (err) {
      setUserError(err.message);
      return false;
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
    setCreateForm(form => ({
      ...form,
      [field]: value
    }));
  };
  const renderSection = sectionId => {
    if (sectionId === "account") {
      return <AccountSection user={user} />;
    }
    if (sectionId === "users") {
      return <UsersSection user={user} createForm={createForm} onCreateFormChange={handleCreateFormChange} onCreateUser={handleCreateUser} createBusy={createBusy} refreshKey={usersRefreshKey} />;
    }
    if (sectionId === "workspace") {
      return <WorkspaceSection bootstrap={bootstrap} appIcon={bootstrap.appIcon} onAppIconChange={onAppIconChange} onAppTitleChange={onAppTitleChange} />;
    }
    if (sectionId === "backups") {
      return <BackupsSection canAdmin={canAdmin} />;
    }
    if (sectionId === "owner") {
      return <OwnerSection bootstrap={bootstrap} startPageSlug={startPageSlug} onNuke={triggerNuke} nukeBusy={nukeBusy} />;
    }
    return null;
  };
  return <ModalShell eyebrow="Settings" title="Workspace settings" onClose={onClose} className="modal-settings">
      <div className="settings-shell">
        <div className="stack settings-shell-nav">
          {visibleCategories.map(cat => {
          const restricted = cat.roles !== "all";
          let titleText = "";
          if (cat.roles === "admin") titleText = "Admins only";else if (cat.roles === "owner") titleText = "Owners only";else if (cat.roles === "admin_owner") titleText = "Admins or Owners";
          return <button key={cat.id} className={`tab ${activeCat === cat.id ? "tab-active" : ""}`} type="button" onClick={() => setActiveCat(normalizeCategory(cat.id))} title={restricted ? titleText : ""} style={{
            textAlign: "left"
          }}>
                <span className="nav-icon">
                  {cat.roles === "admin" && <IconAdmin />}
                  {cat.roles === "owner" && <IconOwner />}
                  {cat.roles === "admin_owner" && <>
                      <IconAdmin />
                      <span style={{
                  width: 8
                }} />
                      <IconOwner />
                    </>}
                  {cat.roles === "all" && <IconUser />}
                </span>
                <span className="nav-label">{cat.label}</span>
              </button>;
        })}
        </div>
        <div className="settings-shell-content">
          {userError && <div className="banner banner-info" style={{
          marginBottom: 10
        }}>
              <div className="banner-body">{userError}</div>
            </div>}

          <div className="muted settings-note" style={{
          marginBottom: 8
        }}>
            Select a section on the left to manage your account, invite
            teammates, workspace settings, backups, and owner actions.
          </div>

          {visibleCategories.map(cat => {
          const isActive = activeCat === cat.id;
          return <div key={cat.id} className={`settings-shell-panel${isActive ? " settings-shell-panel-active" : ""}`} hidden={!isActive} aria-hidden={!isActive}>
                {renderSection(cat.id)}
              </div>;
        })}
        </div>
      </div>
    </ModalShell>;
}
