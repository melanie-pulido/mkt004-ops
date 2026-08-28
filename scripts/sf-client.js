'use strict';

const https = require('https');
const querystring = require('querystring');

// Parse SFDX auth URL: force://clientId:clientSecret:refreshToken@instanceHost
function parseSfdxAuthUrl(authUrl) {
  const match = authUrl.trim().match(/^force:\/\/([^:]*):([^:]*):([^@]+)@(.+)$/);
  if (!match) throw new Error('Invalid SFDX auth URL format');
  return {
    clientId: match[1],
    clientSecret: match[2],
    refreshToken: match[3],
    instanceUrl: 'https://' + match[4]
  };
}

async function getAccessToken(authUrl) {
  const { clientId, clientSecret, refreshToken, instanceUrl } = parseSfdxAuthUrl(authUrl);

  const body = querystring.stringify({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret } : {})
  });

  const url = new URL('/services/oauth2/token', instanceUrl);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const parsed = JSON.parse(data);
        if (parsed.error) {
          reject(new Error(`Auth failed: ${parsed.error} — ${parsed.error_description}`));
        } else {
          resolve({ accessToken: parsed.access_token, instanceUrl: parsed.instance_url });
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sfRequest(instanceUrl, accessToken, method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, instanceUrl);
    const reqBody = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(reqBody ? { 'Content-Length': Buffer.byteLength(reqBody) } : {})
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          body: data ? JSON.parse(data) : null
        });
      });
    });

    req.on('error', reject);
    if (reqBody) req.write(reqBody);
    req.end();
  });
}

// SOAP login as a specific user. Returns { sessionId, serverUrl, passwordExpired }.
// Works even when passwordExpired is true — Salesforce returns a restricted session
// that only allows changeOwnPassword to be called.
async function soapLogin(instanceUrl, username, password) {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com">
  <soapenv:Body>
    <urn:login>
      <urn:username>${username}</urn:username>
      <urn:password>${password}</urn:password>
    </urn:login>
  </soapenv:Body>
</soapenv:Envelope>`;

  const url = new URL('/services/Soap/u/64.0', instanceUrl);
  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=UTF-8',
        SOAPAction: 'login',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        const fault = data.match(/<faultstring>(.*?)<\/faultstring>/s);
        if (fault) return reject(new Error(`SOAP login failed: ${fault[1].trim()}`));
        const sessionId = (data.match(/<sessionId>(.*?)<\/sessionId>/) || [])[1];
        const serverUrl = (data.match(/<serverUrl>(.*?)<\/serverUrl>/) || [])[1];
        const passwordExpired = data.includes('<passwordExpired>true</passwordExpired>');
        if (!sessionId) return reject(new Error('SOAP login: no sessionId in response'));
        resolve({ sessionId, serverUrl, passwordExpired });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Change a user's own password using their SOAP session.
// This clears the Salesforce "must change password" flag, unlike admin password resets.
async function soapChangeOwnPassword(serverUrl, sessionId, oldPassword, newPassword) {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com">
  <soapenv:Header>
    <urn:SessionHeader><urn:sessionId>${sessionId}</urn:sessionId></urn:SessionHeader>
  </soapenv:Header>
  <soapenv:Body>
    <urn:changeOwnPassword>
      <urn:oldPassword>${oldPassword}</urn:oldPassword>
      <urn:newPassword>${newPassword}</urn:newPassword>
    </urn:changeOwnPassword>
  </soapenv:Body>
</soapenv:Envelope>`;

  const url = new URL(serverUrl);
  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=UTF-8',
        SOAPAction: 'changeOwnPassword',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        const fault = data.match(/<faultstring>(.*?)<\/faultstring>/s);
        if (fault) return reject(new Error(`SOAP changeOwnPassword failed: ${fault[1].trim()}`));
        resolve(true);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { getAccessToken, sfRequest, soapLogin, soapChangeOwnPassword };
