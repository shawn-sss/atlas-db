import React from "react";

export default function UsersSection({
  createForm,
  onCreateFormChange,
  onCreateUser,
  createBusy,
}) {
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
          onClick={onCreateUser}
          disabled={createBusy}
        >
          {createBusy ? "Creating." : "Create user"}
        </button>
      </div>
    </div>
  );
}
