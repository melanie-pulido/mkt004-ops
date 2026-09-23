'use strict';

const puppeteer = require('puppeteer-core');

const LOGIN_URL = 'https://login.salesforce.com';
const NAV_TIMEOUT = 60000;
const EL_TIMEOUT  = 30000;

// Completes Salesforce's first-login "Change Your Password" flow via headless
// Chrome. This is the only reliable way to set both the password and the
// security question answer in a single step without triggering the prompt again.
async function browserPasswordSetup(username, currentPassword, newPassword, securityAnswer) {
  const executablePath = process.env.CHROME_PATH;
  if (!executablePath) throw new Error('CHROME_PATH env var is required');

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36'
    );

    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });

    await page.waitForSelector('#username', { visible: true, timeout: EL_TIMEOUT });
    await page.type('#username', username);

    await page.waitForSelector('#password', { visible: true, timeout: EL_TIMEOUT });
    await page.type('#password', currentPassword);

    await page.waitForSelector('input[value="Log In"]', { visible: true, timeout: EL_TIMEOUT });
    await page.click('input[value="Log In"]');

    await page.waitForSelector('#currentpassword', { visible: true, timeout: EL_TIMEOUT });
    await page.type('#currentpassword', currentPassword);

    await page.waitForSelector('#newpassword', { visible: true, timeout: EL_TIMEOUT });
    await page.type('#newpassword', newPassword);

    await page.waitForSelector('#confirmpassword', { visible: true, timeout: EL_TIMEOUT });
    await page.type('#confirmpassword', newPassword);

    await page.waitForSelector('#answer', { visible: true, timeout: EL_TIMEOUT });
    await page.type('#answer', securityAnswer);

    await page.waitForSelector('button#password-button', { visible: true, timeout: EL_TIMEOUT });
    await page.click('button#password-button');

    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });

    if (page.url().includes('login.salesforce.com')) {
      throw new Error('Still on login page after password change — form may have errored');
    }
  } finally {
    await browser.close();
  }
}

module.exports = { browserPasswordSetup };
