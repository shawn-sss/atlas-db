---
status: published
owner: owner
id: doc-b2a2252ffe07b415810e429d
---

# Install Browser Extensions

Document the exact steps to load the curated extension pack so every machine matches the template.

## Procedure

1. **Open the extensions page**
   - Navigate to chrome://extensions (or the equivalent UI in your browser) and keep the tab handy.
2. **Enable developer or side-load mode**
   - Flip the toggle that allows loading unpacked or packaged extensions from the internal share.
3. **Install each approved extension**
   - Load the extensions from the shared folder, checking the version string against the tracker.
4. **Pin and verify**
   - Pin the icons to the toolbar, confirm they appear, and run browser-check --extensions.

## Notes

- Attach a screenshot of the pinned toolbar to the ticket.
- If an install fails, paste error text from %LOCALAPPDATA%/Browser/ExtensionLog below.
