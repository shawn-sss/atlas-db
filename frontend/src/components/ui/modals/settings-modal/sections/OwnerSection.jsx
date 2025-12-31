import React from "react";
import { decodeSlug } from "../../../../../utils/slug";

export default function OwnerSection({
  bootstrap,
  startPageSlug,
  onNuke,
  nukeBusy,
}) {
  return (
    <div className="stack">
      <div className="card">
        <div className="card-title">Boot details</div>
        <div className="muted">Boot ID: {bootstrap.bootId || "-"}</div>
        <div className="muted">
          Start page:{" "}
          {startPageSlug ? decodeSlug(startPageSlug) : "Not configured"}
        </div>
      </div>
      <div className="card">
        <div className="card-title">Owner controls</div>
        <div className="stack">
          <div className="muted">
            Owner actions delete every document, database entries, uploaded
            images, backups, and config metadata.
          </div>
          <button
            className="btn btn-danger"
            onClick={onNuke}
            disabled={nukeBusy}
          >
            {nukeBusy ? "Deleting." : "Nuke workspace"}
          </button>
        </div>
      </div>
    </div>
  );
}
