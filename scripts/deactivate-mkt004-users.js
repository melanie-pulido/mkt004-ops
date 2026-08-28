'use strict';

const { getAccessToken, sfRequest } = require('./sf-client');
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

  console.log(`Authenticating to ${orgConfig.label} (CRM + MC)...`);
  const [
    { accessToken: sfToken, instanceUrl },
    { accessToken: mcToken, soapEndpoint }
  ] = await Promise.all([
    getAccessToken(process.env[orgConfig.authUrlEnvVar]),
    getMcAccessToken(
      process.env[mcConfig.clientIdEnvVar],
      process.env[mcConfig.clientSecretEnvVar],
      process.env[mcConfig.subdomainEnvVar]
    )
  ]);

  console.log(`Authenticated. Deactivating ${ids.length} user(s)...`);

  const results = [];

  for (const id of ids) {
    const crmUsername = `NTO_User_${id}@${orgConfig.crmDomain}`;
    const mcUsername  = `NTO_User_${id}@${mcConfig.loginDomain}`;
    let crmIcon = '✅', crmText = 'deactivated';
    let mcIcon  = '✅', mcText  = 'deactivated';

    // CRM
    try {
      const query = `SELECT Id, IsActive FROM User WHERE Username = '${crmUsername}'`;
      const queryResp = await sfRequest(instanceUrl, sfToken, 'GET',
        `/services/data/v64.0/query?q=${encodeURIComponent(query)}`);
      if (queryResp.status !== 200) throw new Error(`Query failed (HTTP ${queryResp.status})`);
      const records = queryResp.body?.records || [];
      if (records.length === 0) throw new Error('User not found');
      if (!records[0].IsActive) {
        crmText = 'already inactive';
      } else {
        const patchResp = await sfRequest(instanceUrl, sfToken, 'PATCH',
          `/services/data/v64.0/sobjects/User/${records[0].Id}`, { IsActive: false });
        if (patchResp.status !== 204) {
          const errs = Array.isArray(patchResp.body) ? patchResp.body.map(e => e.message).join(', ') : JSON.stringify(patchResp.body);
          throw new Error(`HTTP ${patchResp.status}: ${errs}`);
        }
      }
    } catch (err) {
      crmIcon = '❌'; crmText = err.message;
    }

    // MC
    try {
      await deactivateMcUser(soapEndpoint, mcToken, mcUsername, mcConfig.parentMid);
    } catch (err) {
      mcIcon = '❌'; mcText = err.message;
    }

    results.push({ id, crmIcon, crmText, mcIcon, mcText });
  }

  const successCount = results.filter(r => r.crmIcon === '✅' && r.mcIcon === '✅').length;

  const lines = [
    `### MKT004 User Deactivation — ${orgConfig.label}`,
    '',
    '| ID | Username | CRM Org | MC Org |',
    '|----|----------|---------|--------|',
    ...results.map(r => `| ${r.id} | NTO_User_${r.id}@${orgConfig.crmDomain} | ${r.crmIcon} ${r.crmText} | ${r.mcIcon} ${r.mcText} |`),
    '',
    `**${successCount} / ${ids.length} users fully deactivated.**`
  ];

  process.stdout.write(lines.join('\n') + '\n');
  if (successCount < ids.length) process.exit(1);
}

main().catch(err => {
  console.error(`❌ Fatal: ${err.message}`);
  process.exit(1);
});
