---
status: published
owner: owner
id: doc-ccdceac52114546394e4d7d0
---

# Install Security Tools

This guide ensures every endpoint leaves the imaging belt with the same protection posture.

## Procedure

1. **Run the security bundle**
   - Launch the standard installer (e.g., shield-launch) and let it deploy the agents.
2. **Verify protection status**
   - Run security-console --status and confirm each agent reports Ready.
3. **Enable phishing filters**
   - Activate the phishing rule package, note the policy version, and document it here.
4. **Log to the dashboard**
   - Update the ticket with the machine details, attach the security-hash output, and note the registry field monitoring_tag.

## Notes

- If an agent refuses to start, restart, rerun step 1, and paste C:\\ProgramData\\Security\\Logs\\agent.log entries here.
