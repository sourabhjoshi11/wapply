import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

const BASE = 'https://www.wapply.store';
const errors = [];

page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text());
});

page.on('response', (resp) => {
  if (resp.status() >= 400) {
    errors.push(`HTTP ${resp.status()}: ${resp.url()}`);
  }
});

// Step 1: Landing page
console.log('=== Step 1: Landing page ===');
await page.goto(BASE, { waitUntil: 'networkidle' });
console.log('Title:', await page.title());
console.log('Errors:', errors.splice(0));

// Step 2: Click Get Started → goes to /login
console.log('\n=== Step 2: Login page ===');
await page.getByRole('link', { name: /Get Started/i }).first().click();
await page.waitForURL('**/login**', { timeout: 10000 });
console.log('URL:', page.url());
console.log('Errors:', errors.splice(0));

// Step 3: Click Sign Up tab
console.log('\n=== Step 3: Sign Up form ===');
await page.getByText('Sign Up').click();
await page.waitForTimeout(1000);
console.log('Signup form visible:', await page.getByText('Create Account').isVisible());

// Step 4: Fill signup form
console.log('\n=== Step 4: Fill signup ===');
await page.getByRole('textbox', { name: /email/i }).fill('test-client@wapply.store');
await page.getByRole('textbox', { name: /^password$/i }).fill('Test123!');
const confirmInput = page.getByRole('textbox', { name: /confirm/i });
await confirmInput.fill('Test123!');

// Listen for the signup API call
const [resp] = await Promise.all([
  page.waitForResponse((r) => r.url().includes('supabase') && r.request().method() === 'POST', { timeout: 15000 }),
  page.getByRole('button', { name: /Create Account/i }).click(),
]);

console.log('Supabase signup response:', resp.status());

// Step 5: Check if redirected after signup
await page.waitForTimeout(3000);
console.log('URL after signup:', page.url());

// Step 6: Test middleware — try /onboarding
console.log('\n=== Step 6: Middleware check ===');
await page.goto(BASE + '/onboarding', { waitUntil: 'networkidle' });
console.log('URL at /onboarding:', page.url());
console.log('Errors:', errors.splice(0));

// Step 7: Check /dashboard
await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
console.log('URL at /dashboard:', page.url());
console.log('Errors:', errors.splice(0));

console.log('\n=== Summary ===');
console.log('Total errors:', errors.length);
if (errors.length > 0) {
  console.log('Errors:', errors);
}

await browser.close();
