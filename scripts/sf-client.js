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

module.exports = { getAccessToken, sfRequest };
