import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const pagePath = path.join(root, 'src/pages/PrintFormPage.jsx');
const cssPath = path.join(root, 'src/styles/print-form.css');

const page = await fs.readFile(pagePath, 'utf8');
const css = await fs.readFile(cssPath, 'utf8');

const requiredPageMarkers = [
  'window.print()',
  '/log-print',
  'includeReference',
  'printable-form',
  'page-break-label',
  'DATA ENTRY REFERENCE',
];

const requiredCssMarkers = [
  '@media print',
  '@page',
  'size: A4 portrait',
  '.printable-form',
  'page-break-after: always',
  'page-break-inside: avoid',
  '.paper-radio',
  '.paper-checkbox',
];

const missing = [
  ...requiredPageMarkers.filter((marker) => !page.includes(marker)).map((marker) => `PrintFormPage missing ${marker}`),
  ...requiredCssMarkers.filter((marker) => !css.includes(marker)).map((marker) => `print-form.css missing ${marker}`),
];

if (missing.length) {
  console.error(missing.join('\n'));
  process.exit(1);
}

const targetUrl = process.env.PRINT_TEST_URL;
if (!targetUrl) {
  console.log('Static print layout checks passed. Set PRINT_TEST_URL to run browser screenshots.');
  process.exit(0);
}

let playwright;
try {
  playwright = await import('playwright');
} catch {
  console.log('Static print layout checks passed. Browser checks skipped because Playwright is not installed.');
  process.exit(0);
}

const outputDir = path.join(os.tmpdir(), 'dairytrack-print-layout');
await fs.mkdir(outputDir, { recursive: true });

for (const browserName of ['chromium', 'firefox']) {
  const browserType = playwright[browserName];
  if (!browserType) continue;

  const browser = await browserType.launch();
  try {
    const pageContext = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
    await pageContext.goto(targetUrl, { waitUntil: 'load' });
    await pageContext.emulateMedia({ media: 'print' });
    const formCount = await pageContext.locator('.printable-form').count();
    if (formCount < 1) throw new Error(`${browserName} did not render printable forms`);
    await pageContext.screenshot({ path: path.join(outputDir, `${browserName}-print-layout.png`), fullPage: true });
  } finally {
    await browser.close();
  }
}

console.log(`Print browser checks passed. Screenshots saved in ${outputDir}`);
