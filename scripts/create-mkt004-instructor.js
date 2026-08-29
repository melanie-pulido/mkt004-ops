'use strict';

const { getAccessToken, sfRequest, apexSetPassword } = require('./sf-client');
const { getMcAccessToken, getMcRoleObjectId, mcSoapRequest, updateUserMustChangePasswordFalse } = require('./mc-client');
const { ORG_CONFIG } = require('./org-config');
const { CRM_PASSWORD } = require('./user-templates');

const MC_PASSWORD = 'journey@123';

// "John Doe" → "john.doe"  |  "Mary Jane Watson" → "mary.watson"
function deriveUsernameBase(fullName) {
  const parts = fullName.trim().toLowerCase().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]}.${parts[parts.length - 1]}`;
}

function parseIssueBody(body) {
  const orgMatch   = body.match(/###\s*Org\s*\n+([^\n]+)/);
  const nameMatch  = body.match(/###\s*Full Name\s*\n+([^\n]+)/);
  const emailMatch = body.match(/###\s*Email\s*\n+([^\n]+)/);

  if (!orgMatch)   throw new Error('Could not parse Org from issue body');
  if (!nameMatch)  throw new Error('Could not parse Full Name from issue body');
  if (!emailMatch) throw new Error('Could not parse Email from issue body');

  const orgLine = orgMatch[1].trim();
  const orgKey  = orgLine.match(/Org \d/)?.[0];
  if (!orgKey) throw new Error(`Unrecognized org value: "${orgLine}"`);

  return {
    orgKey,
    fullName: nameMatch[1].trim(),
    email:    emailMatch[1].trim(),
  };
}

async function createMcUser(soapEndpoint, accessToken, username, fullName, mcConfig, roleObjectId) {
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName  = nameParts.slice(1).join(' ') || firstName;

  const bodyXml = `<CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
    <Objects xsi:type="AccountUser">
      <Client><ID>${mcConfig.parentMid}</ID></Client>
      <Name>${firstName} ${lastName}</Name>
      <UserID>${username}</UserID>
      <Email>${username}</Email>
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

  const { orgKey, fullName, email } = parseIssueBody(issueBody);
  const orgConfig = ORG_CONFIG[orgKey];
  if (!orgConfig) throw new Error(`Unknown org key: "${orgKey}"`);
  if (!orgConfig.mc) throw new Error(`No MC config for org: "${orgKey}"`);

  const mcConfig     = orgConfig.mc;
  const usernameBase = deriveUsernameBase(fullName);
  const crmUsername  = `${usernameBase}@${orgConfig.crmDomain}`;
  const mcUsername   = `${usernameBase}@${mcConfig.loginDomain}`;

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
  console.log(`Authenticated. Creating instructor: ${crmUsername}`);

  let crmIcon = '✅', crmText = 'created';
  let mcIcon  = '✅', mcText  = 'created';

  // CRM
  try {
    const nameParts = fullName.trim().split(/\s+/);
    const userData = {
      FirstName:           nameParts[0],
      LastName:            nameParts.slice(1).join(' ') || nameParts[0],
      Username:            crmUsername,
      Email:               email,
      Alias:               usernameBase.replace('.', '').substring(0, 8),
      ProfileId:           orgConfig.profileId,
      TimeZoneSidKey:      'America/Chicago',
      LocaleSidKey:        'en_US',
      EmailEncodingKey:    'UTF-8',
      LanguageLocaleKey:   'en_US'
    };
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
    await createMcUser(soapEndpoint, mcToken, mcUsername, fullName, mcConfig, roleObjectId);
    await updateUserMustChangePasswordFalse(soapEndpoint, mcToken, mcUsername, mcConfig.parentMid);
  } catch (err) {
    mcIcon = '❌'; mcText = err.message;
  }

  const success = crmIcon === '✅' && mcIcon === '✅';

  const lines = [
    `### MKT004 Instructor Creation — ${orgConfig.label}`,
    '',
    '| Full Name | Username | Password | CRM User | MC User |',
    '|-----------|----------|----------|----------|---------|',
    `| ${fullName} | ${crmUsername} | ${CRM_PASSWORD} | ${crmIcon} ${crmText} | ${mcIcon} ${mcText} |`,
    '',
    success ? '**Instructor created successfully.**' : '**Instructor creation failed — see errors above.**'
  ];

  process.stdout.write(lines.join('\n') + '\n');
  if (!success) process.exit(1);
}

main().catch(err => {
  console.error(`❌ Fatal: ${err.message}`);
  process.exit(1);
});
