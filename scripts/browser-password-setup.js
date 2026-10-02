'use strict';

const puppeteer = require('puppeteer-core');

const LOGIN_URL = 'https://login.salesforce.com';
const NAV_TIMEOUT = 60000;
const EL_TIMEOUT  = 30000;

async function browserPasswordSetup(username, currentPassword, newPassword, securityAnswer) {
  const executablePath = process.env.CHROME_PATH;
  if (!executablePath) throw new Error('CHROME_PATH env var is required');

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36'
    );

    // Identifier-first flow: password field only appears after username is submitted
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
    await page.waitForSelector('#username', { timeout: EL_TIMEOUT });
    await page.click('#username');
    await page.type('#username', username);
    await page.click('#Login');

    // Page may navigate (My Domain redirect) or inject password field via AJAX
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
    } catch (_) { /* AJAX flow — no navigation */ }

    await page.waitForSelector('#password', { timeout: EL_TIMEOUT });
    await page.click('#password');
    await page.type('#password', currentPassword);

    const loginBtn = await page.$('#Login') || await page.$('input[type="submit"]');
    if (!loginBtn) throw new Error('No login submit button found after password step');
    await loginBtn.click();

    // Change Your Password screen
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

    await page.waitForNavigation({ waitUntil: 'load', timeout: NAV_TIMEOUT });

    if (page.url().includes('login.salesforce.com')) {
      throw new Error('Still on login page after password change — form may have errored');
    }
  } finally {
    await browser.close();
  }
}

module.exports = { browserPasswordSetup };
