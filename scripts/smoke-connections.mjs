import { chromium } from 'playwright';

const chatUrl = process.env.SMOKE_CHAT_URL ?? 'http://127.0.0.1:5173';
const customerUrl = process.env.SMOKE_CUSTOMER_URL ?? 'http://localhost:5174';
const token = process.env.SMOKE_CUSTOMER_TOKEN ?? 'contract-discovery-smoke-token';

const browser = await chromium.launch({ channel: 'chrome', headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${chatUrl}/connections`);

  await page.getByLabel('Customer app URL').fill(customerUrl);
  await page.getByLabel('User access token').fill(token);
  await page.getByRole('button', { name: 'Connect app' }).click();
  await page.getByText(/tools discovered\./).waitFor({ timeout: 20_000 });

  const discoveredBeforeReload = await page.getByText('8 tools').count();
  if (!discoveredBeforeReload) throw new Error('Expected eight tools after connecting the customer app.');

  await page.reload();
  await page.getByText('8 tools discovered.').waitFor({ timeout: 25_000 });
  if (await page.getByLabel('User access token').inputValue() !== token) {
    throw new Error('The browser-session token was not restored after reload.');
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  if (hasHorizontalOverflow) throw new Error('Connections page has horizontal overflow on mobile.');

  const disconnectButtons = page.getByRole('button', { name: 'Disconnect' });
  if (await disconnectButtons.count()) await disconnectButtons.last().click();

  console.log('Connections smoke test passed: discovery, reload restoration, and mobile layout.');
  await context.close();
} finally {
  await browser.close();
}
