'use strict';

const { getAccessToken, sfRequest, soapLogin, soapChangeOwnPassword } = require('./sf-client');
const { ORG_CONFIG } = require('./org-config');
const { buildCrmUser, CRM_PASSWORD, TEMP_PASSWORD } = require('./user-templates');
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
  console.log(`Authenticated. Creating ${ids.length} user(s)...`);

  const results = [];

  for (const id of ids) {
    const userData = buildCrmUser(id, orgConfig);
    let statusIcon = '✅';
    let statusText = 'created';
    let notes = [];

    try {
      // 1. Create User
      const createResp = await sfRequest(instanceUrl, accessToken, 'POST', '/services/data/v64.0/sobjects/User', userData);

      if (createResp.status !== 201) {
        const errs = Array.isArray(createResp.body)
          ? createResp.body.map(e => e.message).join(', ')
          : JSON.stringify(createResp.body);
        throw new Error(`Create failed (HTTP ${createResp.status}): ${errs}`);
      }

      const userId = createResp.body.id;

      // 2. Set a temp password as admin, then immediately change it as the user.
      //    Salesforce marks admin-set passwords as "must change on first login".
      //    By logging in via SOAP as the user and calling changeOwnPassword, we
      //    clear that flag so students can log in directly without being prompted.
      const pwResp = await sfRequest(instanceUrl, accessToken, 'POST',
        `/services/data/v64.0/sobjects/User/${userId}/password`,
        { NewPassword: TEMP_PASSWORD }
      );
      if (pwResp.status !== 200 && pwResp.status !== 204) {
        notes.push(`temp password failed (${pwResp.status})`);
      } else {
        try {
          const { sessionId, serverUrl } = await soapLogin(instanceUrl, userData.Username, TEMP_PASSWORD);
          await soapChangeOwnPassword(serverUrl, sessionId, TEMP_PASSWORD, CRM_PASSWORD);
        } catch (soapErr) {
          notes.push(`password activation failed: ${soapErr.message}`);
        }
      }

      // 3. Assign permission sets
      for (const psId of orgConfig.permissionSetIds) {
        const psResp = await sfRequest(instanceUrl, accessToken, 'POST',
          '/services/data/v64.0/sobjects/PermissionSetAssignment',
          { AssigneeId: userId, PermissionSetId: psId }
        );
        if (psResp.status !== 201) {
          notes.push(`PS ${psId} failed (${psResp.status})`);
        }
      }

      if (notes.length) statusText += ' — ' + notes.join('; ');
    } catch (err) {
      statusIcon = '❌';
      statusText = err.message;
    }

    results.push({ id, username: userData.Username, statusIcon, statusText });
  }

  const successCount = results.filter(r => r.statusIcon === '✅').length;

  const lines = [
    `### CRM User Creation — ${orgConfig.label}`,
    '',
    '| ID | Username | Status |',
    '|----|----------|--------|',
    ...results.map(r => `| ${r.id} | ${r.username} | ${r.statusIcon} ${r.statusText} |`),
    '',
    `**${successCount} / ${ids.length} users created successfully.**`
  ];

  process.stdout.write(lines.join('\n') + '\n');

  if (successCount < ids.length) process.exit(1);
}

main().catch(err => {
  console.error(`❌ Fatal: ${err.message}`);
  process.exit(1);
});
