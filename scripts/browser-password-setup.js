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

    // Step 1: Enter username and submit (identifier-first flow — password field
    // only appears after the username form is submitted)
    console.error(`[browser] navigating to ${LOGIN_URL}`);
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });

    await page.waitForSelector('#username', { timeout: EL_TIMEOUT });
    await page.click('#username');
    await page.type('#username', username);
    console.error(`[browser] typed username, submitting identifier form`);

    await page.click('#Login');

    // The page may navigate (My Domain redirect) or stay and inject the
    // password field via AJAX. Handle both.
    try {
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
      console.error(`[browser] navigated after username submit: ${page.url()}`);
    } catch (_) {
      console.error(`[browser] no navigation after username submit (AJAX flow): ${page.url()}`);
    }

    // Step 2: Enter password
    await page.waitForSelector('#password', { timeout: EL_TIMEOUT });
    console.error(`[browser] password field found at: ${page.url()}`);
    await page.click('#password');
    await page.type('#password', currentPassword);

    // Click whichever login/submit button is present
    const loginBtn = await page.$('#Login') || await page.$('input[type="submit"]');
    if (!loginBtn) throw new Error('No login submit button found after password step');
    await loginBtn.click();
    console.error(`[browser] submitted login`);

    // Step 3: Change Your Password screen
    await page.waitForSelector('#currentpassword', { visible: true, timeout: EL_TIMEOUT });
    console.error(`[browser] on Change Your Password screen: ${page.url()}`);
    await page.type('#currentpassword', currentPassword);

    await page.waitForSelector('#newpassword', { visible: true, timeout: EL_TIMEOUT });
    await page.type('#newpassword', newPassword);

    await page.waitForSelector('#confirmpassword', { visible: true, timeout: EL_TIMEOUT });
    await page.type('#confirmpassword', newPassword);

    await page.waitForSelector('#answer', { visible: true, timeout: EL_TIMEOUT });
    await page.type('#answer', securityAnswer);

    await page.waitForSelector('button#password-button', { visible: true, timeout: EL_TIMEOUT });
    await page.click('button#password-button');
    console.error(`[browser] submitted Change Your Password form`);

    await page.waitForNavigation({ waitUntil: 'load', timeout: NAV_TIMEOUT });
    console.error(`[browser] final url: ${page.url()}`);

    if (page.url().includes('login.salesforce.com')) {
      throw new Error('Still on login page after password change — form may have errored');
    }
  } finally {
    await browser.close();
  }
}

module.exports = { browserPasswordSetup };
