'use strict';

const https = require('https');

function httpsPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getMcAccessToken(clientId, clientSecret, subdomain) {
  const url = `https://${subdomain}.auth.marketingcloudapis.com/v2/token`;
  const payload = JSON.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret });
  const resp = await httpsPost(url, { 'Content-Type': 'application/json' }, payload);
  if (resp.status !== 200) throw new Error(`MC auth failed (HTTP ${resp.status}): ${resp.body}`);
  const data = JSON.parse(resp.body);
  return {
    accessToken: data.access_token,
    soapEndpoint: `https://${subdomain}.soap.marketingcloudapis.com/Service.asmx`
  };
}

async function mcSoapRequest(soapEndpoint, accessToken, action, bodyXml) {
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
  <s:Header>
    <a:Action s:mustUnderstand="1">${action}</a:Action>
    <a:To s:mustUnderstand="1">${soapEndpoint}</a:To>
    <fueloauth xmlns="http://exacttarget.com">${accessToken}</fueloauth>
  </s:Header>
  <s:Body xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
    ${bodyXml}
  </s:Body>
</s:Envelope>`;

  const resp = await httpsPost(soapEndpoint, {
    'Content-Type': 'text/xml; charset=utf-8',
    'SOAPAction': action
  }, envelope);

  return { status: resp.status, body: resp.body };
}

async function getMcRoleObjectId(soapEndpoint, accessToken, roleName) {
  const bodyXml = `<RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
    <RetrieveRequest>
      <ObjectType>Role</ObjectType>
      <Properties>ObjectID</Properties>
      <Properties>Name</Properties>
      <Filter xsi:type="SimpleFilterPart">
        <Property>Name</Property>
        <SimpleOperator>equals</SimpleOperator>
        <Value>${roleName}</Value>
      </Filter>
    </RetrieveRequest>
  </RetrieveRequestMsg>`;

  const resp = await mcSoapRequest(soapEndpoint, accessToken, 'Retrieve', bodyXml);
  if (resp.status !== 200) throw new Error(`Role lookup failed (HTTP ${resp.status}): ${resp.body}`);

  if (resp.body.includes('<faultstring>')) {
    const fault = resp.body.match(/<faultstring>([^<]+)<\/faultstring>/)?.[1] || 'Unknown SOAP fault';
    throw new Error(`SOAP fault during role lookup: ${fault}`);
  }

  const match = resp.body.match(/<ObjectID>([^<]+)<\/ObjectID>/);
  if (!match) throw new Error(`Role "${roleName}" not found in MC. Full response:\n${resp.body}`);
  return match[1];
}

async function updateUserMustChangePasswordFalse(soapEndpoint, accessToken, userId, parentMid) {
  const bodyXml = `<UpdateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
    <Objects xsi:type="AccountUser">
      <Client><ID>${parentMid}</ID></Client>
      <UserID>${userId}</UserID>
      <MustChangePassword>false</MustChangePassword>
    </Objects>
  </UpdateRequest>`;

  const resp = await mcSoapRequest(soapEndpoint, accessToken, 'Update', bodyXml);
  if (resp.status !== 200) throw new Error(`MustChangePassword update failed (HTTP ${resp.status}): ${resp.body}`);

  if (resp.body.includes('<faultstring>')) {
    const fault = resp.body.match(/<faultstring>([^<]+)<\/faultstring>/)?.[1] || 'Unknown SOAP fault';
    throw new Error(`SOAP fault on update: ${fault}`);
  }

  const statusCode = resp.body.match(/<StatusCode>([^<]+)<\/StatusCode>/)?.[1];
  const statusMsg = resp.body.match(/<StatusMessage>([^<]+)<\/StatusMessage>/)?.[1];
  if (statusCode && statusCode !== 'OK') {
    throw new Error(`MustChangePassword update failed: ${statusMsg || statusCode}`);
  }
}

module.exports = { getMcAccessToken, mcSoapRequest, getMcRoleObjectId, updateUserMustChangePasswordFalse };
