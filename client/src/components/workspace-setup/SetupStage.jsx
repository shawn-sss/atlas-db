import React from "react";
import AppIcon from "../ui/icons/app-icon";
import Banner from "../ui/Banner";
import { COMMON_TIMEZONES } from "../../constants/timezones";

const SetupStage = ({
  brandTitle,
  appTitle,
  onAppTitleChange,
  appIconPreview,
  iconBusy,
  iconMessage,
  onIconSelect,
  selectedTimezone,
  handleTimezoneSelect,
  timezoneMessage,
  timezoneTone,
  finishSetup,
  setupBusy,
  setupError,
  timezoneSaved,
}) => (
  <div className="start-body start-body-split">
    <div className="start-split-grid">
      <div className="start-action-card start-action-card-wide">
        <div className="start-action-header">
          <div>
            <div className="start-kicker">Setup</div>
            <div className="start-action-title">
              Name your workspace and lock in the team timezone.
            </div>
          </div>
        </div>
        <div className="start-action-note start-lede">
          <p>
            These settings define how activity appears and what teammates see
            when they jump into {brandTitle}.
          </p>
        </div>
        <div className="start-form-stack">
          <label className="field">
            <span>Workspace title</span>
            <input
              className="input"
              value={appTitle}
              onChange={(e) => onAppTitleChange(e.target.value)}
              placeholder="Team name or workspace title"
            />
          </label>
          <label className="field">
            <span>Workspace icon</span>
            <div className="workspace-icon-field">
              <div className="workspace-icon-preview">
                {appIconPreview ? (
                  <img
                    src={appIconPreview}
                    alt={`${brandTitle} icon preview`}
                  />
                ) : (
                  <AppIcon size={216} />
                )}
              </div>
              <div className="workspace-icon-actions">
                <label className="btn btn-secondary btn-sm workspace-icon-upload">
                  Upload icon
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp,image/bmp"
                    onChange={onIconSelect}
                  />
                </label>
              </div>
            </div>
            <div className="muted workspace-icon-hint">
              {iconBusy
                ? "Uploading icon..."
                : iconMessage ||
                  "PNG, JPG, GIF, WEBP, or BMP up to 10MB. Auto-cropped to square."}
            </div>
          </label>

          <label className="field">
            <span>Timezone</span>
            <select
              className="input"
              value={selectedTimezone}
              onChange={handleTimezoneSelect}
            >
              <option value="" disabled>
                Choose a timezone
              </option>
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </label>
          {timezoneMessage && timezoneTone === "danger" && (
            <div className="muted start-form-status start-timezone-danger">
              {timezoneMessage}
            </div>
          )}
        </div>
        <div className="start-action-note">
          <div className="start-note-title">Next up after setup</div>
          <ul className="start-action-list">
            <li>
              Sign in as the seeded owner and open the starter Start page.
            </li>
            <li>Refine the navigation by renaming or moving pages.</li>
            <li>Invite teammates from the Settings panel.</li>
          </ul>
        </div>
        {setupError && <Banner tone="danger">{setupError}</Banner>}
        <div className="start-actions-row">
          <button
            className="btn btn-secondary"
            disabled={!timezoneSaved || !selectedTimezone || setupBusy}
            onClick={finishSetup}
          >
            {setupBusy
              ? "Finishing setup..."
              : "Finish setup and open workspace"}
          </button>
        </div>
      </div>
      <div className="start-side-stack">
        <div className="start-action-card start-action-card-compact">
          <div className="start-action-title">Setup checklist</div>
          <div className="start-action-note">
            <ul className="start-action-list">
              <li>Add a short, clear workspace title and optional icon.</li>
              <li>Select the timezone your team uses daily.</li>
              <li>Finish setup to open the workspace.</li>
            </ul>
          </div>
        </div>
        <div className="start-action-card start-action-card-compact">
          <div className="start-action-title">Owner access</div>
          <div className="start-action-note">
            <div className="muted">Owner credentials</div>
            <div className="start-credential-row">
              <code>owner</code>
              <span className="start-credential-divider">/</span>
              <code>owner</code>
            </div>
            <div className="muted">
              You can change passwords and roles in Settings later.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

SetupStage.displayName = "SetupStage";

export default React.memo(SetupStage);
