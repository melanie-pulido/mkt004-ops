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

    console.error(`[browser] navigating to ${LOGIN_URL}`);
    await page.goto(LOGIN_URL, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });

    // Diagnostic: dump all inputs and iframes visible at page load
    const pageState = await page.evaluate(() => ({
      url: window.location.href,
      iframes: document.querySelectorAll('iframe').length,
      inputs: Array.from(document.querySelectorAll('input')).map(i => ({
        id: i.id, name: i.name, type: i.type,
        visible: i.offsetWidth > 0 && i.offsetHeight > 0
      }))
    }));
    console.error(`[browser] page state: ${JSON.stringify(pageState)}`);

    await page.waitForSelector('#username', { timeout: EL_TIMEOUT });
    await page.click('#username');
    await page.type('#username', username);
    console.error(`[browser] typed username`);

    // Diagnostic: dump inputs again after typing username (some pages toggle fields via JS)
    const stateAfterUsername = await page.evaluate(() => ({
      url: window.location.href,
      inputs: Array.from(document.querySelectorAll('input')).map(i => ({
        id: i.id, name: i.name, type: i.type,
        visible: i.offsetWidth > 0 && i.offsetHeight > 0
      }))
    }));
    console.error(`[browser] state after username: ${JSON.stringify(stateAfterUsername)}`);

    await page.waitForSelector('#password', { timeout: EL_TIMEOUT });
    await page.click('#password');
    await page.type('#password', currentPassword);
    console.error(`[browser] typed password`);

    await page.waitForSelector('input[value="Log In"]', { timeout: EL_TIMEOUT });
    await page.click('input[value="Log In"]');
    console.error(`[browser] clicked Log In`);

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
