'use strict';

const { getMcAccessToken, updateUserMustChangePasswordFalse } = require('./mc-client');
const { ORG_CONFIG } = require('./org-config');
const { parseIssueBody } = require('./parse-issue-body');

async function main() {
  const issueBody = process.env.ISSUE_BODY;
  if (!issueBody) throw new Error('ISSUE_BODY env var is required');

  const { orgKey, ids } = parseIssueBody(issueBody);
  const orgConfig = ORG_CONFIG[orgKey];
  if (!orgConfig || !orgConfig.mc) throw new Error(`No MC config for org: "${orgKey}"`);

  const mcConfig = orgConfig.mc;
  const clientId = process.env[mcConfig.clientIdEnvVar];
  const clientSecret = process.env[mcConfig.clientSecretEnvVar];
  const subdomain = process.env[mcConfig.subdomainEnvVar];

  const { accessToken, soapEndpoint } = await getMcAccessToken(clientId, clientSecret, subdomain);

  const results = [];
  for (const id of ids) {
    const username = `NTO_User_${id}@${mcConfig.loginDomain}`;
    try {
      await updateUserMustChangePasswordFalse(soapEndpoint, accessToken, username, mcConfig.parentMid);
      results.push(`✅ ${username} — MustChangePassword cleared`);
    } catch (err) {
      results.push(`❌ ${username} — ${err.message}`);
    }
  }

  process.stdout.write(results.join('\n') + '\n');
  if (results.some(r => r.startsWith('❌'))) process.exit(1);
}

main().catch(err => {
  console.error(`❌ Fatal: ${err.message}`);
  process.exit(1);
});
