import React, { useState } from "react";
import { apiFetch } from "../../../api/client";
import ROUTES from "../../../api/routes";
import Banner from "../../ui/Banner";

export default function LoginCard({ onLogin }) {
  const [username, setUsername] = useState("owner");
  const [password, setPassword] = useState("owner");
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    try {
      const data = await apiFetch(ROUTES.login, {
        method: "POST",
        body: { username, password },
      });
      onLogin(data);
    } catch (err) {
      setError(err.message || "Login failed");
    }
  };

  return (
    <div className="card auth-card">
      <div className="card-title">Sign in</div>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>Username</span>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        <div className="row">
          <button className="btn" type="submit">
            Sign in
          </button>
        </div>
        {error && <Banner tone="danger">{error}</Banner>}
      </form>
    </div>
  );
}
