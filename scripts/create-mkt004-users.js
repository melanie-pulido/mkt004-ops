'use strict';

const { getAccessToken, sfRequest, apexSetPassword } = require('./sf-client');
const { getMcAccessToken, getMcRoleObjectId, mcSoapRequest, updateUserMustChangePasswordFalse } = require('./mc-client');
const { ORG_CONFIG } = require('./org-config');
const { buildCrmUser, CRM_PASSWORD } = require('./user-templates');
const { parseIssueBody } = require('./parse-issue-body');

const MC_PASSWORD = 'journey@123';

async function createMcUser(soapEndpoint, accessToken, id, mcConfig, roleObjectId) {
  const username = `NTO_User_${id}@${mcConfig.loginDomain}`;

  const bodyXml = `<CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
    <Objects xsi:type="AccountUser">
      <Client><ID>${mcConfig.parentMid}</ID></Client>
      <Name>NTO_User ${id}</Name>
      <UserID>${username}</UserID>
      <Email>thorgops@salesforce.com</Email>
      <Password>${MC_PASSWORD}</Password>
      <MustChangePassword>false</MustChangePassword>
      <DefaultBusinessUnit>${mcConfig.childMid}</DefaultBusinessUnit>
      <AssociatedBusinessUnits>
        <BusinessUnit><ID>${mcConfig.childMid}</ID></BusinessUnit>
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
  if (resp.status !== 200) throw new Error(`SOAP Create failed (HTTP ${resp.status})`);
  if (resp.body.includes('<faultstring>')) {
    const fault = resp.body.match(/<faultstring>([^<]+)<\/faultstring>/)?.[1] || 'Unknown SOAP fault';
    throw new Error(fault);
  }
  const statusCode = resp.body.match(/<StatusCode>([^<]+)<\/StatusCode>/)?.[1];
  const statusMsg  = resp.body.match(/<StatusMessage>([^<]+)<\/StatusMessage>/)?.[1];
  if (statusCode && statusCode !== 'OK') throw new Error(statusMsg || statusCode);
}

async function main() {
  const issueBody = process.env.ISSUE_BODY;
  if (!issueBody) throw new Error('ISSUE_BODY env var is required');

  const { orgKey, ids } = parseIssueBody(issueBody);
  const orgConfig = ORG_CONFIG[orgKey];
  if (!orgConfig) throw new Error(`Unknown org key: "${orgKey}"`);
  if (!orgConfig.mc) throw new Error(`No MC config for org: "${orgKey}"`);

  const mcConfig = orgConfig.mc;

  // Authenticate to both systems up front
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

  const roleObjectId = await getMcRoleObjectId(soapEndpoint, mcToken, mcConfig.roleName);
  console.log(`Authenticated. Creating ${ids.length} user(s)...`);

  const results = [];

  for (const id of ids) {
    const userData = buildCrmUser(id, orgConfig);
    let crmIcon = '✅', crmText = 'created';
    let mcIcon  = '✅', mcText  = 'created';

    // CRM
    try {
      const createResp = await sfRequest(instanceUrl, sfToken, 'POST', '/services/data/v64.0/sobjects/User', userData);
      if (createResp.status !== 201) {
        const errs = Array.isArray(createResp.body) ? createResp.body.map(e => e.message).join(', ') : JSON.stringify(createResp.body);
        throw new Error(`HTTP ${createResp.status}: ${errs}`);
      }
      const userId = createResp.body.id;
      await apexSetPassword(instanceUrl, sfToken, userId, CRM_PASSWORD);
      for (const psId of orgConfig.permissionSetIds) {
        await sfRequest(instanceUrl, sfToken, 'POST', '/services/data/v64.0/sobjects/PermissionSetAssignment',
          { AssigneeId: userId, PermissionSetId: psId });
      }
    } catch (err) {
      crmIcon = '❌'; crmText = err.message;
    }

    // MC
    try {
      await createMcUser(soapEndpoint, mcToken, id, mcConfig, roleObjectId);
      await updateUserMustChangePasswordFalse(soapEndpoint, mcToken, `NTO_User_${id}@${mcConfig.loginDomain}`, mcConfig.parentMid);
    } catch (err) {
      mcIcon = '❌'; mcText = err.message;
    }

    results.push({ id, crmIcon, crmText, mcIcon, mcText });
  }

  const successCount = results.filter(r => r.crmIcon === '✅' && r.mcIcon === '✅').length;

  const lines = [
    `### MKT004 User Creation — ${orgConfig.label}`,
    '',
    '| ID | Username | Password | CRM User | MC User |',
    '|----|----------|----------|----------|---------|',
    ...results.map(r => `| ${r.id} | NTO_User_${r.id}@${mcConfig.loginDomain} | ${CRM_PASSWORD} | ${r.crmIcon} ${r.crmText} | ${r.mcIcon} ${r.mcText} |`),
    '',
    `**${successCount} / ${ids.length} users fully created.**`
  ];

  process.stdout.write(lines.join('\n') + '\n');
  if (successCount < ids.length) process.exit(1);
}

main().catch(err => {
  console.error(`❌ Fatal: ${err.message}`);
  process.exit(1);
});
