import React from "react";
import { DEFAULT_START_PAGE_SLUG } from "../../constants/defaults";

const WelcomeStage = ({ brandTitle, onStageChange }) => (
  <div className="start-body start-body-split">
    <div className="start-split-grid">
      <div className="start-action-card start-action-card-wide">
        <div className="start-action-header">
          <div>
            <div className="start-kicker">Welcome</div>
            <div className="start-action-title">
              {brandTitle} keeps knowledge tidy, searchable, and ready for
              decisions.
            </div>
          </div>
          <div className="start-meta-pill">2 min setup</div>
        </div>
        <div className="start-action-note start-lede">
          <p>
            Use {brandTitle} to capture playbooks, decisions, quick references,
            and the policies that keep the team in sync.
          </p>
          <p>
            Design navigation now so teammates find answers without digging
            through the chat backlog.
          </p>
        </div>
        <div className="start-info-grid">
          <div className="start-info-card">
            <div className="start-info-title">Keep pages focused</div>
            <div className="muted">
              Name documents for a single topic, add statuses, and keep the
              story current as work evolves.
            </div>
          </div>
          <div className="start-info-card">
            <div className="start-info-title">Set a Start page</div>
            <div className="muted">
              Pin the page that greets teammates with the clearest guidance
              every time.
            </div>
          </div>
          <div className="start-info-card">
            <div className="start-info-title">Link and discover</div>
            <div className="muted">
              Markdown links, tags, and search keep related context easy to
              find.
            </div>
          </div>
          <div className="start-info-card">
            <div className="start-info-title">Share a consistent tone</div>
            <div className="muted">
              Use a shared title, icon, and statuses to keep the workspace
              feeling intentional.
            </div>
          </div>
        </div>
        <div className="start-action-note">
          <p>
            When setup finishes we seed the owner account and create a starter
            Start page at <code>{DEFAULT_START_PAGE_SLUG}</code>.
          </p>
          <p>
            Afterward you can refine the workspace title, icon, timezone, and
            navigation from Settings.
          </p>
        </div>
        <div className="start-actions-row">
          <button className="btn" onClick={() => onStageChange("setup")}>
            Continue to setup
          </button>
        </div>
      </div>
      <div className="start-side-stack">
        <div className="start-action-card start-action-card-compact">
          <div className="start-action-title">Structure recipe</div>
          <div className="start-action-note">
            <ul className="start-action-list">
              <li>
                <strong>docs</strong> - policies, runbooks, APIs
              </li>
              <li>
                <strong>team</strong> - handbook, roles, rituals
              </li>
              <li>
                <strong>projects</strong> - specs, notes, decisions
              </li>
            </ul>
            <div className="muted">
              Examples: <code>docs/incident-response</code>,{" "}
              <code>team/handbook</code>
            </div>
          </div>
        </div>
        <div className="start-action-card start-action-card-compact">
          <div className="start-action-title">What gets created</div>
          <div className="start-action-note">
            <ul className="start-action-list">
              <li>
                Owner account seeded as <code>owner</code> so you can sign in
                and continue.
              </li>
              <li>
                Your workspace title, icon, and timezone are captured for the
                whole team.
              </li>
              <li>A default Start page is created and ready for updates.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
);

WelcomeStage.displayName = "WelcomeStage";

export default React.memo(WelcomeStage);
