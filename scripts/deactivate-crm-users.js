'use strict';

const { getAccessToken, sfRequest } = require('./sf-client');
const { ORG_CONFIG } = require('./org-config');
const { parseIssueBody } = require('./parse-issue-body');

async function main() {
  const issueBody = process.env.ISSUE_BODY;
  if (!issueBody) throw new Error('ISSUE_BODY env var is required');

  const { orgKey, ids } = parseIssueBody(issueBody);
  const orgConfig = ORG_CONFIG[orgKey];
  if (!orgConfig) throw new Error(`Unknown org key: "${orgKey}"`);

  const authUrl = process.env[orgConfig.authUrlEnvVar];
  if (!authUrl) throw new Error(`Missing env var: ${orgConfig.authUrlEnvVar}`);

  console.log(`Authenticating to ${orgConfig.label}...`);
  const { accessToken, instanceUrl } = await getAccessToken(authUrl);
  console.log(`Authenticated. Deactivating ${ids.length} user(s)...`);

  const results = [];

  for (const id of ids) {
    const username = `NTO_User_${id}@${orgConfig.crmDomain}`;
    let statusIcon = '✅';
    let statusText = 'deactivated';

    try {
      // Look up the user by username
      const query = `SELECT Id, IsActive FROM User WHERE Username = '${username}'`;
      const queryResp = await sfRequest(instanceUrl, accessToken, 'GET',
        `/services/data/v64.0/query?q=${encodeURIComponent(query)}`
      );

      if (queryResp.status !== 200) {
        throw new Error(`Query failed (HTTP ${queryResp.status})`);
      }

      const records = queryResp.body?.records || [];
      if (records.length === 0) {
        throw new Error('User not found');
      }

      const userId = records[0].Id;

      if (!records[0].IsActive) {
        statusText = 'already inactive';
      } else {
        const patchResp = await sfRequest(instanceUrl, accessToken, 'PATCH',
          `/services/data/v64.0/sobjects/User/${userId}`,
          { IsActive: false }
        );
        if (patchResp.status !== 204) {
          const errs = Array.isArray(patchResp.body)
            ? patchResp.body.map(e => e.message).join(', ')
            : JSON.stringify(patchResp.body);
          throw new Error(`Deactivate failed (HTTP ${patchResp.status}): ${errs}`);
        }
      }
    } catch (err) {
      statusIcon = '❌';
      statusText = err.message;
    }

    results.push({ id, username, statusIcon, statusText });
  }

  const successCount = results.filter(r => r.statusIcon === '✅').length;

  const lines = [
    `### CRM User Deactivation — ${orgConfig.label}`,
    '',
    '| ID | Username | Status |',
    '|----|----------|--------|',
    ...results.map(r => `| ${r.id} | ${r.username} | ${r.statusIcon} ${r.statusText} |`),
    '',
    `**${successCount} / ${ids.length} users processed.**`
  ];

  process.stdout.write(lines.join('\n') + '\n');

  if (successCount < ids.length) process.exit(1);
}

main().catch(err => {
  console.error(`❌ Fatal: ${err.message}`);
  process.exit(1);
});
