# mkt004-ops

GitHub Actions automation for MKT004 CRM user management — allows the operations
team to create and deactivate Salesforce CRM users across three org pairs by
submitting a Google Form or opening a GitHub Issue.

**Repo:** `melanie-pulido/mkt004-ops`
**Local working copy:** `/tmp/mkt004-ops` (re-clone if it disappears)

---

## Orgs

Each "org" in the form corresponds to a Salesforce CRM org. Org-specific IDs
(ProfileId, PermissionSetIds) are hardcoded in `scripts/org-config.js` and must
be updated whenever a new org is added.

| Label in form | CRM alias | Username domain | Auth secret |
|---|---|---|---|
| Org 1 (mkt004-1) | mkt004-1 | mkt004-1.com | `SF_AUTH_URL_ORG1` |
| Org 2 (mkt004-2) | mkt004-2 | mkt004-2.com | `SF_AUTH_URL_ORG2` |
| Org 3 (mkt004-3) | mkt004-3 | mkt004-3.com | `SF_AUTH_URL_ORG3` |

---

## Workflows

Both workflows fire on `issues: labeled` (never `opened`) to avoid double-trigger.
Each workflow:
1. Renames the issue with a PST timestamp
2. Posts a "⏳ in progress" comment
3. Runs the Node script (passing `ISSUE_BODY` as an env var)
4. Posts results as an issue comment
5. Closes the issue on success, fails the job on error

| Workflow file | Label | Script |
|---|---|---|
| `create-users.yml` | `create-users` | `scripts/create-crm-users.js` |
| `deactivate-users.yml` | `deactivate-users` | `scripts/deactivate-crm-users.js` |

---

## User template (hardcoded from ID)

Given an ID like `0001`:

| Field | Value |
|---|---|
| CRM First Name | `NTO_User` |
| CRM Last Name | `0001` |
| CRM Username | `NTO_User_0001@mkt004-1.com` |
| CRM Email | `thorgops@salesforce.com` |
| CRM Alias | `NTU0001` |
| CRM Profile | MKT004 Student |
| CRM Permission Sets | MarketingCloudManager, DataCloudActManager, TableauEinsteinIncludedAppBusinessUser |
| Password | `journey@123` |
| EmailVerified | true (no manual email confirmation needed) |

---

## Key scripts

| File | Purpose |
|---|---|
| `scripts/sf-client.js` | Auth via SFDX auth URL refresh token + REST API wrapper |
| `scripts/org-config.js` | Hardcoded org-specific IDs (profileId, permissionSetIds) |
| `scripts/user-templates.js` | Builds CRM user payload from ID and org config |
| `scripts/parse-issue-body.js` | Extracts Org and User IDs from issue markdown body |
| `scripts/create-crm-users.js` | Create User → set password → assign 3 permission sets |
| `scripts/deactivate-crm-users.js` | Look up user by username → PATCH IsActive=false |

### Notable Salesforce API behaviors
- **User creation** requires `EmailVerified: true` to skip the email confirmation prompt on first login.
- **Password** is set via `POST /services/data/v64.0/sobjects/User/{id}/password` immediately after create.
- **Permission sets** are assigned via `POST /services/data/v64.0/sobjects/PermissionSetAssignment` once per set.
- **Deactivation** queries by `Username` field (globally unique), then PATCHes `IsActive: false`.

---

## Google Form bridge

`.github/google-form-script.js` — paste into the Google Form's Apps Script editor.

Form fields (in this order):
1. **Operation** — Multiple choice: `Create Users` / `Deactivate Users`
2. **Org** — Multiple choice: `Org 1 (mkt004-1)` / `Org 2 (mkt004-2)` / `Org 3 (mkt004-3)`
3. **User IDs** — Paragraph text, one ID per line

The field labels must match exactly (`Operation`, `Org`, `User IDs`) or the script will fail.

Setup steps:
1. In Apps Script editor: Project Settings → Script Properties → add `GITHUB_TOKEN` = GitHub PAT with `repo` scope for this repo
2. Set trigger: `onFormSubmit` → On form submit
3. Enable "Collect email addresses" in the form settings (for confirmation emails)

---

## Secrets & Variables

Credentials are entered directly in GitHub → Settings → Secrets and variables → Actions.
**Never hardcode them.**

| Name | Tab | Value |
|---|---|---|
| `SF_AUTH_URL_ORG1` | Secrets | SFDX auth URL for mkt004-1 |
| `SF_AUTH_URL_ORG2` | Secrets | SFDX auth URL for mkt004-2 |
| `SF_AUTH_URL_ORG3` | Secrets | SFDX auth URL for mkt004-3 |

Generate auth URLs with:
```bash
sf org auth show-sfdx-auth-url --target-org mkt004-1
sf org auth show-sfdx-auth-url --target-org mkt004-2
sf org auth show-sfdx-auth-url --target-org mkt004-3
```

Auth URLs use the PlatformCLI refresh token and expire if the admin user's password is reset
or the session is revoked. Regenerate and update the secret if a workflow starts failing with
auth errors.

---

## Adding a new org (Org 2 / Org 3)

1. Authenticate the SF CLI to the org: `sf org login web --alias mkt004-2`
2. Query the profile and permission set IDs:
   ```bash
   sf data query --target-org mkt004-2 \
     --query "SELECT Id, Name FROM Profile WHERE Name = 'MKT004 Student'"
   sf data query --target-org mkt004-2 \
     --query "SELECT Id, Name FROM PermissionSet WHERE Label IN ('Marketing Cloud Manager','Data Cloud Activation Manager','Tableau Next Included App Business User')"
   ```
3. Update `scripts/org-config.js` with the queried IDs
4. Generate the auth URL and add `SF_AUTH_URL_ORG2` to GitHub Secrets
5. Test by creating a GitHub Issue manually with label `create-users`

---

## Git / CLI setup

```bash
gh auth switch --user melanie-pulido
TOKEN=$(gh auth token --hostname github.com --user melanie-pulido)
git push "https://melanie-pulido:${TOKEN}@github.com/melanie-pulido/mkt004-ops.git" main
```

If `/tmp/mkt004-ops` is gone, re-clone:
```bash
git clone https://github.com/melanie-pulido/mkt004-ops /tmp/mkt004-ops
```
