// Run against `npm run dev:mock` with:
// playwright-cli -s=uw-capture run-code --filename=scripts/capture-site.cjs
// These are the production React components and styles, with demo accounts.
async (page) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:1420/');
  await page.locator('.popup').waitFor();
  const size = await page.evaluate(async () => {
    const { POPUP_WIDTH: width, POPUP_HEIGHT: height } = await import('/src/core/popupWindow.ts');
    return { width, height };
  });
  await page.setViewportSize(size);
  await page.evaluate(async () => {
    const { useRuntimeStore } = await import('/src/core/store.ts');
    // Four demo accounts show the current wide layout at its native window size.
    const state = useRuntimeStore.getState();
    state.patchConfig({ theme: 'dark', trackers: state.config.trackers.slice(0, 4) });
  });
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 4);
  const contentFits = await page.locator('.popup__content').evaluate(el => el.scrollHeight <= el.clientHeight);
  if (!contentFits) throw new Error('Demo accounts must fit the native popup without clipping');
  await page.locator('.popup__inner').screenshot({ path: 'web/assets/app-screenshot.png', omitBackground: true, animations: 'disabled', scale: 'css' });
  const popup = await page.locator('.popup__inner').boundingBox();
  await page.reload();
  await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const { WidgetStrip } = await import('/src/components/WidgetStrip.tsx');
    const { mockViews } = await import('/src/fixtures/index.ts');
    document.getElementById('root').remove();
    const root = document.createElement('div');
    document.body.append(root);
    const noop = () => {};
    const captureRoot = createRoot(root);
    window.renderCaptureWidget = (edge, count) => captureRoot.render(React.createElement(WidgetStrip, {
      views: mockViews.slice(0, count), edge, onToggle: noop,
      onExit: noop, onOpenSettings: noop,
      onDrag: noop, onDragEnd: noop,
    }));
    window.renderCaptureWidget('bottom', 6);
  });
  await page.setViewportSize({ width: 498, height: 420 });
  await page.locator('.widget__item').first().waitFor();
  await page.mouse.move(490, 0);
  const horizontal = await page.locator('.widget').boundingBox();
  const silhouette = await page.locator('.widget-shape').boundingBox();
  if (horizontal.width !== 498 || silhouette.width !== horizontal.width || horizontal.x < 0 || horizontal.x + horizontal.width > 498) {
    throw new Error('Horizontal widget and silhouette must fit exactly, including both shoulders');
  }
  await page.locator('.widget').screenshot({ path: 'web/assets/widget-screenshot.png', omitBackground: true, animations: 'disabled', scale: 'css' });
  await page.getByRole('button', { name: /^Codex:/ }).hover();
  await page.locator('.widget-tip').waitFor();
  const tip = await page.locator('.widget-tip').boundingBox();
  if (tip.y < 0 || tip.x < 0 || tip.x + tip.width > 498 || tip.y + tip.height > 420) {
    throw new Error('Expanded widget details must fit completely in the screenshot');
  }
  await page.screenshot({ path: 'web/assets/widget-detail-screenshot.png', omitBackground: true, animations: 'disabled', scale: 'css' });
  await page.mouse.move(0, 0);
  await page.setViewportSize({ width: 96, height: 310 });
  await page.evaluate(() => window.renderCaptureWidget('right', 3));
  await page.locator('.widget-shell--right').waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.widget__item').length === 3);
  const vertical = await page.locator('.widget').boundingBox();
  if (vertical.width !== 62 || vertical.height !== 276) throw new Error('Unexpected three-provider vertical geometry');
  await page.locator('.widget').screenshot({ path: 'web/assets/widget-vertical-screenshot.png', omitBackground: true, animations: 'disabled', scale: 'css' });
  return { popup, horizontal, vertical, screenshots: 4 };
}
