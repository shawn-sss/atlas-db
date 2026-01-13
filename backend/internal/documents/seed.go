package documents

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"atlas/internal/contentpath"
	"atlas/internal/random"
)

type seedDoc struct {
	path string
	slug string
	body string
}

const defaultSeedMetaKey = "seed_default_content_v1"

func seedDefaultStructureIfNeeded(db *sql.DB) []string {
	var seeded sql.NullString
	if err := db.QueryRow(`SELECT value FROM meta WHERE key = ?`, defaultSeedMetaKey).Scan(&seeded); err == nil && strings.TrimSpace(seeded.String) != "" {
		return nil
	}

	root := contentpath.PublishedRoot
	if root == "" {
		return nil
	}
	_ = os.MkdirAll(root, 0o755)

	writeIfMissing := func(rel string, content string) error {
		abs := filepath.Join(root, filepath.FromSlash(rel))
		if _, err := os.Stat(abs); err == nil {
			return nil
		}
		if err := os.MkdirAll(filepath.Dir(abs), 0o755); err != nil {
			return err
		}
		return os.WriteFile(abs, []byte(content), 0o644)
	}

	seedDocs := []seedDoc{
		{
			path: "software-installs/_index.md",
			slug: "software-installs",
			body: softwareInstallsIndexBody(),
		},
		{
			path: "software-installs/install-browser-extensions.md",
			slug: "software-installs/install-browser-extensions",
			body: installBrowserBody(),
		},
		{
			path: "software-installs/install-security-tools.md",
			slug: "software-installs/install-security-tools",
			body: installSecurityBody(),
		},
		{
			path: "new-pc-setup/_index.md",
			slug: "new-pc-setup",
			body: newPCIndexBody(),
		},
		{
			path: "new-pc-setup/process.md",
			slug: "new-pc-setup/process",
			body: newPCProcessBody(),
		},
		{
			path: "important-links.md",
			slug: "important-links",
			body: importantLinksBody(),
		},
	}

	var seededSlugs []string
	for _, doc := range seedDocs {
		content := seededDocumentContent(doc.slug, doc.body)
		if err := writeIfMissing(doc.path, content); err != nil {
			log.Printf("seed write %s: %v", doc.path, err)
			continue
		}
		seededSlugs = append(seededSlugs, doc.slug)
	}

	_, _ = db.Exec(`INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)`, defaultSeedMetaKey, fmt.Sprintf("%d", time.Now().Unix()))

	return seededSlugs
}

func newPCIndexBody() string {
	var b strings.Builder
	b.WriteString("# New PC Setup\n\n")
	b.WriteString("Use this parent document to describe the machine class, ticket tags, and owners before diving into the child checklist.\n\n")
	b.WriteString("## In this section\n\n")
	b.WriteString("- [[new-pc-setup/process|PC Setup Process]] — run through imaging, updates, and handoff on every build.\n")
	b.WriteString("- Note the hardware families or naming prefixes you expect to cover.\n\n")
	b.WriteString("Folders act like documents too, so keep this intro short and signal what belongs inside new-pc-setup/ before the checklist starts.\n")
	return b.String()
}

func newPCProcessBody() string {
	var b strings.Builder
	b.WriteString("# PC Setup Process\n\n")
	b.WriteString("Keep this checklist short so every technician can follow the same routine on every build. Mark each step in your ticket before moving on.\n\n")
	b.WriteString("## Procedure\n\n")
	b.WriteString("1. **Collect labels and asset data**\n")
	b.WriteString("   - Record the serial, asset tag, and ticket number so the device can be tracked.\n")
	b.WriteString("2. **Apply the current baseline image**\n")
	b.WriteString("   - Boot to the imaging environment and let the base image run without intervention.\n")
	b.WriteString("3. **Enable patches and policies**\n")
	b.WriteString("   - Run the patch helper, confirm updates finish, and toggle the policy profile to Active.\n")
	b.WriteString("4. **Run the standard installers**\n")
	b.WriteString("   - Follow the [Software installs](../software-installs) guides and verify each version matches the template.\n")
	b.WriteString("5. **Configure accounts and finalize**\n")
	b.WriteString("   - Create admin users, test MFA prompts, and note the handoff summary in the ticket.\n\n")
	b.WriteString("## Verification\n\n")
	b.WriteString("- Checklist every step in your ticket before closing it.\n")
	b.WriteString("- Run `system-checker --run-friendly` and attach the summary if anything looks off.\n\n")
	b.WriteString("## Notes\n\n")
	b.WriteString("- Mention environment-specific details (imaging server, Wi-Fi SSID, rack, etc.) to keep future builds predictable.\n")
	return b.String()
}

func softwareInstallsIndexBody() string {
	var b strings.Builder
	b.WriteString("# Software Installs\n\n")
	b.WriteString("This folder stores the repeatable installers we run after imaging. Each child guide should list the command, verification step, and logging expectation.\n\n")
	b.WriteString("## In this section\n\n")
	b.WriteString("- [[software-installs/install-browser-extensions|Install Browser Extensions]] — load the curated extension pack and confirm the versions.\n")
	b.WriteString("- [[software-installs/install-security-tools|Install Security Tools]] — deploy endpoint protection, phishing filters, and monitoring agents.\n\n")
	b.WriteString("Link new installers here with notes about when they should run (new builds, compliance scans, etc.).\n")
	return b.String()
}

func installBrowserBody() string {
	var b strings.Builder
	b.WriteString("# Install Browser Extensions\n\n")
	b.WriteString("Document the exact steps to load the curated extension pack so every machine matches the template.\n\n")
	b.WriteString("## Procedure\n\n")
	b.WriteString("1. **Open the extensions page**\n")
	b.WriteString("   - Navigate to chrome://extensions (or the equivalent UI in your browser) and keep the tab handy.\n")
	b.WriteString("2. **Enable developer or side-load mode**\n")
	b.WriteString("   - Flip the toggle that allows loading unpacked or packaged extensions from the internal share.\n")
	b.WriteString("3. **Install each approved extension**\n")
	b.WriteString("   - Load the extensions from the shared folder, checking the version string against the tracker.\n")
	b.WriteString("4. **Pin and verify**\n")
	b.WriteString("   - Pin the icons to the toolbar, confirm they appear, and run browser-check --extensions.\n\n")
	b.WriteString("## Notes\n\n")
	b.WriteString("- Attach a screenshot of the pinned toolbar to the ticket.\n")
	b.WriteString("- If an install fails, paste error text from %LOCALAPPDATA%/Browser/ExtensionLog below.\n")
	return b.String()
}

func installSecurityBody() string {
	var b strings.Builder
	b.WriteString("# Install Security Tools\n\n")
	b.WriteString("This guide ensures every endpoint leaves the imaging belt with the same protection posture.\n\n")
	b.WriteString("## Procedure\n\n")
	b.WriteString("1. **Run the security bundle**\n")
	b.WriteString("   - Launch the standard installer (e.g., shield-launch) and let it deploy the agents.\n")
	b.WriteString("2. **Verify protection status**\n")
	b.WriteString("   - Run security-console --status and confirm each agent reports Ready.\n")
	b.WriteString("3. **Enable phishing filters**\n")
	b.WriteString("   - Activate the phishing rule package, note the policy version, and document it here.\n")
	b.WriteString("4. **Log to the dashboard**\n")
	b.WriteString("   - Update the ticket with the machine details, attach the security-hash output, and note the registry field monitoring_tag.\n\n")
	b.WriteString("## Notes\n\n")
	b.WriteString("- If an agent refuses to start, restart, rerun step 1, and paste C:\\\\ProgramData\\\\Security\\\\Logs\\\\agent.log entries here.\n")
	return b.String()
}

func importantLinksBody() string {
	var b strings.Builder
	b.WriteString("# Important Links\n\n")
	b.WriteString("Use this page as the quick-reference hub for the dashboards, catalogues, and policies you visit before editing other documents.\n\n")
	b.WriteString("## Portal and dashboards\n\n")
	b.WriteString("- Internal status portal — review daily incidents and note relevant IDs before editing guides.\n")
	b.WriteString("- Hardware catalogue — confirm warranty, serial ranges, and approved models when tagging new builds.\n\n")
	b.WriteString("## Support and policies\n\n")
	b.WriteString("- Support dashboard — file tickets, attach build evidence, and watch escalations.\n")
	b.WriteString("- Security policy brief — include shortcut instructions for credential handling, approved tools, and emergency contacts.\n\n")
	b.WriteString("Pin the most-used links or reference them in other documents so teammates can find them without jumping around.\n")
	return b.String()
}

func seededDocumentContent(slug, body string) string {
	return seededFrontMatter(slug) + strings.TrimLeft(body, "\n")
}

func seededFrontMatter(slug string) string {
	if slug == "" {
		slug = "home"
	}
	return fmt.Sprintf("---\nstatus: published\nowner: owner\nid: %s\n---\n\n", seedDocID(slug))
}

func seedDocID(slug string) string {
	clean := strings.TrimSpace(slug)
	if clean == "" {
		clean = "home"
	}
	return "doc-" + random.GenerateToken(12)
}
