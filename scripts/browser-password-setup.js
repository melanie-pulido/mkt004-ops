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
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    // 1. Login — fill both fields then click
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
    await page.locator('#username').fill(username);
    await page.locator('#password').fill(currentPassword);

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAV_TIMEOUT }),
      page.locator('#Login').click(),
    ]);

    // 2. Wait for Change Your Password screen
    await page.waitForSelector('#newpassword', { timeout: NAV_TIMEOUT });

    // Use page.type() with delay so Salesforce's onkeyup validation fires
    await page.type('#currentpassword', currentPassword, { delay: 10 });
    await page.type('#newpassword', newPassword, { delay: 10 });
    await page.type('#confirmpassword', newPassword, { delay: 10 });

    // Select a valid security question if none is pre-selected
    const firstQuestionValue = await page.evaluate(() => {
      const el = document.querySelector('#question');
      if (!el) return null;
      const validOption = Array.from(el.options).find((opt) => opt.value && opt.value !== '0');
      return validOption ? validOption.value : el.value;
    });
    if (firstQuestionValue) {
      await page.select('#question', firstQuestionValue);
    }

    await page.type('#answer', securityAnswer, { delay: 10 });

    // 3. Wait for the save button to become enabled before clicking
    const saveSelector = '#password-button:not([disabled]), button[name="save"]:not([disabled])';
    await page.waitForSelector(saveSelector, { timeout: 10000 });

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: NAV_TIMEOUT }),
      page.click(saveSelector),
    ]);

    // 4. Verify we left both login and ChangePassword screens without errors
    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('ChangePassword')) {
      const errorText = await page.evaluate(() => {
        const el = document.querySelector('#error, .messageText');
        return el ? el.textContent.trim() : '';
      });
      throw new Error(`Password setup did not complete (URL: ${currentUrl})${errorText ? `: ${errorText}` : ''}`);
    }
  } finally {
    await browser.close();
  }
}

module.exports = { browserPasswordSetup };
