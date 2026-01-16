import React, { useEffect, useState } from "react";
import { apiFetch } from "../../../../../api/client";
import ROUTES from "../../../../../api/routes";

export default function UsersSection({
  createForm,
  onCreateFormChange,
  onCreateUser,
  createBusy,
  refreshKey,
}) {
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState(null);
  const [roleEdits, setRoleEdits] = useState({});
  const [roleBusy, setRoleBusy] = useState({});

  useEffect(() => {
    let mounted = true;
    const fetchUsers = async () => {
      setUsersLoading(true);
      setUsersError(null);
      try {
        const data = await apiFetch(ROUTES.users);
        if (!mounted) return;
        const list = Array.isArray(data) ? data : [];
        const roleRank = { owner: 0, admin: 1, user: 2 };
        const sorted = [...list].sort((a, b) => {
          const aRole = (a?.role || "User").toLowerCase();
          const bRole = (b?.role || "User").toLowerCase();
          const aRank = roleRank[aRole] ?? 3;
          const bRank = roleRank[bRole] ?? 3;
          if (aRank !== bRank) return aRank - bRank;
          const aName = (a?.username || "").toLowerCase();
          const bName = (b?.username || "").toLowerCase();
          if (aName < bName) return -1;
          if (aName > bName) return 1;
          return 0;
        });
        setUsers(sorted);
        const nextEdits = {};
        sorted.forEach((user) => {
          if (user && typeof user.id !== "undefined") {
            nextEdits[user.id] = user.role || "User";
          }
        });
        setRoleEdits(nextEdits);
      } catch (err) {
        if (!mounted) return;
        setUsersError(err.message || "Failed to load users");
        setUsers([]);
      } finally {
        if (mounted) setUsersLoading(false);
      }
    };
    fetchUsers();
    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  const handleCreate = async () => {
    if (typeof onCreateUser !== "function") return;
    await onCreateUser();
  };

  const handleRoleChange = (id, value) => {
    setRoleEdits((prev) => ({ ...prev, [id]: value }));
  };

  const handleRoleSave = async (id) => {
    const nextRole = roleEdits[id];
    if (!nextRole) return;
    setRoleBusy((prev) => ({ ...prev, [id]: true }));
    setUsersError(null);
    try {
      await apiFetch(ROUTES.userRole(id), {
        method: "PUT",
        body: { role: nextRole },
      });
      setUsers((prev) =>
        prev.map((user) =>
          user.id === id ? { ...user, role: nextRole } : user
        )
      );
    } catch (err) {
      setUsersError(err.message || "Failed to update role");
    } finally {
      setRoleBusy((prev) => ({ ...prev, [id]: false }));
    }
  };

  return (
    <div className="card">
      <div className="card-title">Invite teammate</div>
      <div className="stack">
        <label className="field">
          <span>Username</span>
          <input
            className="input"
            value={createForm.username}
            onChange={(e) => onCreateFormChange("username", e.target.value)}
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            className="input"
            type="password"
            value={createForm.password}
            onChange={(e) => onCreateFormChange("password", e.target.value)}
          />
        </label>
        <label className="field">
          <span>Role</span>
          <select
            className="input"
            value={createForm.role}
            onChange={(e) => onCreateFormChange("role", e.target.value)}
          >
            <option value="User">User</option>
            <option value="Admin">Admin</option>
            <option value="Owner">Owner</option>
          </select>
        </label>
        <button
          className="btn btn-primary"
          type="button"
          onClick={handleCreate}
          disabled={createBusy}
        >
          {createBusy ? "Creating." : "Create user"}
        </button>
      </div>
      <div className="card-title" style={{ marginTop: 16 }}>
        Registered users
      </div>
      {usersError && (
        <div className="banner banner-danger" style={{ marginBottom: 10 }}>
          <div className="banner-body">{usersError}</div>
        </div>
      )}
      <div className="stack">
        {usersLoading && <div className="muted">Loading users...</div>}
        {!usersLoading && users.length === 0 && (
          <div className="muted">No users yet.</div>
        )}
        {users.map((user) => (
          <div
            key={user.id}
            className="row"
            style={{ justifyContent: "space-between", alignItems: "center" }}
          >
            <div>
              <div className="list-title">{user.username}</div>
              <div className="muted">Current: {user.role || "User"}</div>
            </div>
            <div
              className="row"
              style={{ gap: 8, alignItems: "center", flexWrap: "nowrap" }}
            >
              <select
                className="input"
                value={roleEdits[user.id] || user.role || "User"}
                onChange={(e) => handleRoleChange(user.id, e.target.value)}
              >
                <option value="User">User</option>
                <option value="Admin">Admin</option>
                <option value="Owner">Owner</option>
              </select>
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                onClick={() => handleRoleSave(user.id)}
                disabled={roleBusy[user.id]}
              >
                {roleBusy[user.id] ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
