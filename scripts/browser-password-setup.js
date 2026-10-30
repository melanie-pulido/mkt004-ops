'use strict';

const puppeteer = require('puppeteer-core');

const LOGIN_URL = 'https://login.salesforce.com';
const NAV_TIMEOUT = 60000;

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

    // Identifier-first flow: submit username, then password field appears on same page
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
    await page.locator('#username').fill(username);
    await page.locator('#Login').click();

    // Password field appears after username submit (AJAX, no navigation)
    await page.locator('#password').fill(currentPassword);
    await page.locator('#Login').click();

    // Wait for post-login navigation before looking for Change Your Password screen
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
    } catch (_) { /* may not navigate if already on the right URL */ }

    // Change Your Password screen
    await page.locator('#currentpassword').fill(currentPassword);
    await page.locator('#newpassword').fill(newPassword);
    await page.locator('#confirmpassword').fill(newPassword);
    await page.locator('#answer').fill(securityAnswer);
    await page.locator('button#password-button').click();

    await page.waitForNavigation({ waitUntil: 'load', timeout: NAV_TIMEOUT });

    if (page.url().includes('login.salesforce.com')) {
      throw new Error('Still on login page after password change — form may have errored');
    }
  } finally {
    await browser.close();
  }
}

module.exports = { browserPasswordSetup };
