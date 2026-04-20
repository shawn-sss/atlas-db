---
status: published
owner: owner
id: doc-004df945d21615cf26687e75
---

# PC Setup Process

Keep this checklist short so every technician can follow the same routine on every build. Mark each step in your ticket before moving on.

## Procedure

1. **Collect labels and asset data**
   - Record the serial, asset tag, and ticket number so the device can be tracked.
2. **Apply the current baseline image**
   - Boot to the imaging environment and let the base image run without intervention.
3. **Enable patches and policies**
   - Run the patch helper, confirm updates finish, and toggle the policy profile to Active.
4. **Run the standard installers**
   - Follow the [Software installs](../software-installs) guides and verify each version matches the template.
5. **Configure accounts and finalize**
   - Create admin users, confirm MFA prompts, and note the handoff summary in the ticket.

## Verification

- Checklist every step in your ticket before closing it.
- Run `system-checker --run-friendly` and attach the summary if anything looks off.

## Notes

- Mention environment-specific details (imaging server, Wi-Fi SSID, rack, etc.) to keep future builds predictable.
