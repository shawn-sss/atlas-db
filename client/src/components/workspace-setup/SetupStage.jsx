import React from "react";
import AppIcon, { APP_ICON_SIZES } from "../ui/icons/app-icon";
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
  seededAccounts,
  finishSetup,
  setupBusy,
  setupError,
  timezoneSaved
}) => {
  const accounts = seededAccounts && seededAccounts.length > 0 ? seededAccounts : [{
    username: "owner",
    password: "owner",
    role: "Owner"
  }, {
    username: "admin",
    password: "admin",
    role: "Admin"
  }, {
    username: "user",
    password: "user",
    role: "User"
  }];
  return <div className="start-body start-body-split">
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
              <input className="input" value={appTitle} onChange={e => onAppTitleChange(e.target.value)} placeholder="Team name or workspace title" />
            </label>
            <label className="field">
              <span>Workspace icon</span>
              <div className="workspace-icon-field">
                <div className="workspace-icon-preview">
                  <AppIcon size={APP_ICON_SIZES.preview} src={appIconPreview} alt={`${brandTitle} icon preview`} />
                </div>
                <div className="workspace-icon-actions">
                  <label className="btn btn-secondary btn-sm workspace-icon-upload">
                    Upload icon
                    <input type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" onChange={onIconSelect} />
                  </label>
                </div>
              </div>
              <div className="muted workspace-icon-hint">
                {iconBusy ? "Uploading icon..." : iconMessage || "PNG, JPG, GIF, WEBP, or BMP up to 10MB. Auto-cropped to square."}
              </div>
            </label>

            <label className="field">
              <span>Timezone</span>
              <select className="input" value={selectedTimezone} onChange={handleTimezoneSelect}>
                <option value="" disabled>
                  Choose a timezone
                </option>
                {COMMON_TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>)}
              </select>
            </label>
            {timezoneMessage && timezoneTone === "danger" && <div className="muted start-form-status start-timezone-danger">
                {timezoneMessage}
              </div>}
          </div>
          <div className="start-action-note">
            <div className="start-note-title">Next up after setup</div>
            <ul className="start-action-list">
              <li>Sign in with the seeded owner account shown here.</li>
              <li>Refine the navigation by renaming or moving pages.</li>
              <li>Invite teammates from the Settings panel.</li>
            </ul>
          </div>
          <div className="start-action-note">
            <div className="start-note-title">Default accounts</div>
            <ul className="start-action-list">
              {accounts.map(account => <li key={account.username}>
                  <strong>{account.role}</strong>: username{" "}
                  <code>{account.username}</code>, password{" "}
                  <code>{account.password}</code>
                </li>)}
            </ul>
            <div className="muted">
              Use <code>owner</code> for the first sign-in after setup.
            </div>
          </div>
          {setupError && <Banner tone="danger">{setupError}</Banner>}
          <div className="start-actions-row">
            <button className="btn btn-secondary" type="button" disabled={!timezoneSaved || !selectedTimezone || setupBusy} onClick={finishSetup}>
              {setupBusy ? "Finishing setup..." : "Finish setup and go to sign in"}
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
                <li>Finish setup, then sign in with the owner account.</li>
              </ul>
            </div>
          </div>
          <div className="start-action-card start-action-card-compact">
            <div className="start-action-title">Seeded access</div>
            <div className="start-action-note">
              <div className="muted">
                Setup seeds owner, admin, and user accounts automatically so
                the first sign-in is predictable and the roles are ready
                immediately.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>;
};
SetupStage.displayName = "SetupStage";
export default React.memo(SetupStage);
