'use strict';

const { getMcAccessToken, deactivateMcUser } = require('./mc-client');
const { ORG_CONFIG } = require('./org-config');
const { parseIssueBody } = require('./parse-issue-body');

async function main() {
  const issueBody = process.env.ISSUE_BODY;
  if (!issueBody) throw new Error('ISSUE_BODY env var is required');

  const { orgKey, ids } = parseIssueBody(issueBody);
  const orgConfig = ORG_CONFIG[orgKey];
  if (!orgConfig) throw new Error(`Unknown org key: "${orgKey}"`);
  if (!orgConfig.mc) throw new Error(`No MC config for org: "${orgKey}"`);

  const mcConfig = orgConfig.mc;
  const clientId = process.env[mcConfig.clientIdEnvVar];
  const clientSecret = process.env[mcConfig.clientSecretEnvVar];
  const subdomain = process.env[mcConfig.subdomainEnvVar];

  if (!clientId || !clientSecret || !subdomain) {
    throw new Error(`Missing MC credentials. Expected env vars: ${mcConfig.clientIdEnvVar}, ${mcConfig.clientSecretEnvVar}, ${mcConfig.subdomainEnvVar}`);
  }

  console.log(`Authenticating to ${mcConfig.label}...`);
  const { accessToken, soapEndpoint } = await getMcAccessToken(clientId, clientSecret, subdomain);
  console.log(`Authenticated. Deactivating ${ids.length} user(s)...`);

  const results = [];

  for (const id of ids) {
    const username = `NTO_User_${id}@${mcConfig.loginDomain}`;
    try {
      await deactivateMcUser(soapEndpoint, accessToken, username, mcConfig.parentMid);
      results.push({ id, username, statusIcon: '✅', statusText: 'deactivated' });
    } catch (err) {
      results.push({ id, username, statusIcon: '❌', statusText: err.message });
    }
  }

  const successCount = results.filter(r => r.statusIcon === '✅').length;

  const lines = [
    `### MC User Deactivation — ${mcConfig.label}`,
    '',
    '| ID | Username | Status |',
    '|----|----------|--------|',
    ...results.map(r => `| ${r.id} | ${r.username} | ${r.statusIcon} ${r.statusText} |`),
    '',
    `**${successCount} / ${ids.length} users deactivated successfully.**`
  ];

  process.stdout.write(lines.join('\n') + '\n');

  if (successCount < ids.length) process.exit(1);
}

main().catch(err => {
  console.error(`❌ Fatal: ${err.message}`);
  process.exit(1);
});
