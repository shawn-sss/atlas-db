import React from "react";

export default function AccountSection({ user }) {
  return (
    <div className="stack">
      <div className="card">
        <div className="card-title">Account</div>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div>
              <strong>{user?.username}</strong>
            </div>
            <div className="muted">{user?.role}</div>
          </div>
          <div className="chip chip-sm">Current</div>
        </div>
      </div>
    </div>
  );
}
