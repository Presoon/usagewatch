// playwright-cli -s=uw-capture run-code --filename=scripts/preview-site.cjs
async (page) => {
  const base = await page.evaluate(() => location.origin + '/');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: '.playwright-cli/site-desktop.png', fullPage: true });
  await page.locator('.hero').screenshot({ path: '.playwright-cli/site-hero.png' });
  await page.locator('.desktop-stage').screenshot({ path: '.playwright-cli/widget-desktop-context.png' });
  const desktop = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, images: [...document.images].every(i => i.complete && i.naturalWidth > 0) }));
  await page.getByRole('link', { name: 'Features', exact: true }).click();
  if (!page.url().endsWith('#features')) throw new Error('Feature navigation failed');
  await page.getByRole('link', { name: 'For contributors', exact: true }).click();
  if (!page.url().endsWith('#contribute')) throw new Error('Contributor navigation failed');
  if (!await page.getByRole('link', { name: 'Open full-size UsageWatch app screenshot' }).getAttribute('href')) throw new Error('Missing screenshot link');
  const [detail] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('link', { name: 'Open full-size widget screenshot with Codex details' }).click(),
  ]);
  await detail.waitForLoadState();
  if (!detail.url().endsWith('widget-detail-screenshot.png')) throw new Error('Widget details failed to open');
  await detail.close();
  for (const width of [390, 320, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(base);
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
    if (scroll > width) throw new Error(`Horizontal overflow at ${width}: ${scroll}`);
    if (width === 390) {
      await page.screenshot({ path: '.playwright-cli/site-mobile.png', fullPage: true });
      await page.locator('.desktop-stage').screenshot({ path: '.playwright-cli/widget-mobile-context.png' });
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (await page.locator('.app-capture').evaluate(el => getComputedStyle(el).animationName) !== 'none') throw new Error('Reduced motion ignored');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base);
  if (desktop.scroll > desktop.width || !desktop.images || errors.length) throw new Error(JSON.stringify({ desktop, errors }));
  return { desktop, mobileWidths: [390, 320, 768], errors };
}
