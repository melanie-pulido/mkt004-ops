'use strict';

const { getAccessToken, sfRequest, apexSetPassword, soapLogin, soapChangeOwnPassword } = require('./sf-client');
const { ORG_CONFIG } = require('./org-config');
const { CRM_PASSWORD, TEMP_PASSWORD } = require('./user-templates');

async function main() {
  const issueBody = process.env.ISSUE_BODY;
  if (!issueBody) throw new Error('ISSUE_BODY env var is required');

  const orgMatch       = issueBody.match(/###\s*Org\s*\n+([^\n]+)/);
  const usernamesMatch = issueBody.match(/###\s*Usernames\s*\n+([\s\S]+?)(?:\n###|$)/);
  if (!orgMatch)       throw new Error('Could not parse Org from issue body');
  if (!usernamesMatch) throw new Error('Could not parse Usernames from issue body');

  const orgLine = orgMatch[1].trim();
  const orgKey  = orgLine.match(/Org \d/)?.[0];
  if (!orgKey) throw new Error(`Unrecognized org value: "${orgLine}"`);

  const usernames = usernamesMatch[1].trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (usernames.length === 0) throw new Error('No usernames found in issue body');

  const orgConfig = ORG_CONFIG[orgKey];
  if (!orgConfig) throw new Error(`Unknown org key: "${orgKey}"`);

  const authUrl = process.env[orgConfig.authUrlEnvVar];
  if (!authUrl) throw new Error(`Missing env var: ${orgConfig.authUrlEnvVar}`);

  console.log(`Authenticating to ${orgConfig.label}...`);
  const { accessToken, instanceUrl } = await getAccessToken(authUrl);
  console.log(`Authenticated. Resetting passwords for ${usernames.length} user(s)...`);

  const results = [];

  for (const username of usernames) {
    let statusIcon = '✅';
    let statusText = 'password reset';

    try {
      // 1. Resolve username → userId
      const queryResp = await sfRequest(instanceUrl, accessToken, 'GET',
        `/services/data/v64.0/query?q=${encodeURIComponent(`SELECT Id FROM User WHERE Username = '${username}'`)}`);
      if (!queryResp.body || !queryResp.body.records || queryResp.body.records.length === 0) {
        throw new Error(`User not found: ${username}`);
      }
      const userId = queryResp.body.records[0].Id;

      // 2. Admin sets temp password so the current password slot is no longer journey@123
      await apexSetPassword(instanceUrl, accessToken, userId, TEMP_PASSWORD);

      // 3. SOAP login as the user and change own password to the final value.
      //    Salesforce records this as a user-initiated change, so a future reset
      //    to journey@123 won't be rejected as "old password".
      const { sessionId, serverUrl } = await soapLogin(instanceUrl, username, TEMP_PASSWORD);
      await soapChangeOwnPassword(serverUrl, sessionId, TEMP_PASSWORD, CRM_PASSWORD);
    } catch (err) {
      statusIcon = '❌';
      statusText = err.message;
    }

    results.push({ username, statusIcon, statusText });
  }

  const successCount = results.filter(r => r.statusIcon === '✅').length;

  const lines = [
    `### CRM Password Reset — ${orgConfig.label}`,
    '',
    '| Username | Status |',
    '|----------|--------|',
    ...results.map(r => `| ${r.username} | ${r.statusIcon} ${r.statusText} |`),
    '',
    `**${successCount} / ${usernames.length} passwords reset successfully.**`
  ];

  process.stdout.write(lines.join('\n') + '\n');
  if (successCount < usernames.length) process.exit(1);
}

main().catch(err => {
  console.error(`❌ Fatal: ${err.message}`);
  process.exit(1);
});
