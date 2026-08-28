'use strict';

const { getMcAccessToken, mcSoapRequest, getMcRoleObjectId } = require('./mc-client');
const { ORG_CONFIG } = require('./org-config');
const { parseIssueBody } = require('./parse-issue-body');

const MC_PASSWORD = 'journey@123';

async function createMcUser(soapEndpoint, accessToken, id, mcConfig, roleObjectId) {
  const username = `NTO_User_${id}@${mcConfig.loginDomain}`;

  const bodyXml = `<CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
    <Objects xsi:type="AccountUser">
      <Client>
        <ID>${mcConfig.parentMid}</ID>
      </Client>
      <Name>NTO_User ${id}</Name>
      <UserID>${username}</UserID>
      <Email>thorgops@salesforce.com</Email>
      <Password>${MC_PASSWORD}</Password>
      <MustChangePassword>false</MustChangePassword>
      <DefaultBusinessUnit>${mcConfig.childMid}</DefaultBusinessUnit>
      <AssociatedBusinessUnits>
        <BusinessUnit>
          <ID>${mcConfig.childMid}</ID>
        </BusinessUnit>
      </AssociatedBusinessUnits>
      <Roles>
        <Role>
          <ObjectID>${roleObjectId}</ObjectID>
          <Name>${mcConfig.roleName}</Name>
        </Role>
      </Roles>
    </Objects>
  </CreateRequest>`;

  const resp = await mcSoapRequest(soapEndpoint, accessToken, 'Create', bodyXml);

  if (resp.status !== 200) throw new Error(`SOAP Create failed (HTTP ${resp.status}): ${resp.body}`);

  if (resp.body.includes('<faultstring>')) {
    const fault = resp.body.match(/<faultstring>([^<]+)<\/faultstring>/)?.[1] || 'Unknown SOAP fault';
    throw new Error(`SOAP fault: ${fault}`);
  }

  const statusCode = resp.body.match(/<StatusCode>([^<]+)<\/StatusCode>/)?.[1];
  const statusMsg = resp.body.match(/<StatusMessage>([^<]+)<\/StatusMessage>/)?.[1];

  if (statusCode && statusCode !== 'OK') {
    throw new Error(`Create failed: ${statusMsg || statusCode}`);
  }

  return username;
}

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
  console.log(`Authenticated. Looking up role "${mcConfig.roleName}"...`);

  const roleObjectId = await getMcRoleObjectId(soapEndpoint, accessToken, mcConfig.roleName);
  console.log(`Role ObjectID: ${roleObjectId}. Creating ${ids.length} user(s)...`);

  const results = [];

  for (const id of ids) {
    const username = `NTO_User_${id}@${mcConfig.loginDomain}`;
    try {
      await createMcUser(soapEndpoint, accessToken, id, mcConfig, roleObjectId);
      results.push({ id, username, statusIcon: '✅', statusText: 'created' });
    } catch (err) {
      results.push({ id, username, statusIcon: '❌', statusText: err.message });
    }
  }

  const successCount = results.filter(r => r.statusIcon === '✅').length;

  const lines = [
    `### MC User Creation — ${mcConfig.label}`,
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
