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
    page.setDefaultTimeout(NAV_TIMEOUT);
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    // 1. Login — fill both fields then click
    console.log('[browser] Navigating to login page...');
    await page.goto(LOGIN_URL, { waitUntil: 'load', timeout: NAV_TIMEOUT });
    console.log('[browser] Login page loaded:', page.url());

    // Fill username — Salesforce may use identifier-first flow (typing username
    // triggers a redirect to the org login page before showing the password field).
    console.log('[browser] Filling username...');
    await page.waitForSelector('#username', { timeout: NAV_TIMEOUT });
    await page.evaluate((val) => {
      const el = document.querySelector('#username');
      el.value = val;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, username);

    // Click Next/Login — if only #username is present it's identifier-first,
    // so we click whatever submit button exists and wait for navigation.
    const hasPassword = await page.$('#password');
    if (!hasPassword) {
      console.log('[browser] Identifier-first flow detected, clicking Next...');
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'load', timeout: NAV_TIMEOUT }),
        page.click('#Login, [type="submit"]'),
      ]);
      console.log('[browser] After Next URL:', page.url());
    }

    // Now fill password and submit
    console.log('[browser] Filling password...');
    await page.waitForSelector('#password', { timeout: NAV_TIMEOUT });
    await page.type('#password', currentPassword, { delay: 10 });
    console.log('[browser] Clicking login button...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: NAV_TIMEOUT }),
      page.click('#Login'),
    ]);
    console.log('[browser] Post-login URL:', page.url());

    // 2. Wait for Change Your Password screen
    console.log('[browser] Waiting for #newpassword...');
    await page.waitForSelector('#newpassword', { timeout: NAV_TIMEOUT });
    console.log('[browser] Change password screen visible');

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

    console.log('[browser] Clicking save...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: NAV_TIMEOUT }),
      page.click(saveSelector),
    ]);

    // 4. Verify we left both login and ChangePassword screens without errors
    const currentUrl = page.url();
    console.log('[browser] Post-save URL:', currentUrl);
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
