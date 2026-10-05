import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { generic_webpage } from '../app-scripts/generic.mjs';

// Puppeteer v20 wraps once callbacks without off(original) unwrapping.
class BrowserEmitter extends EventEmitter {
  once(event, callback) {
    const wrapper = (...args) => { callback(...args); this.off(event, wrapper); };
    return this.on(event, wrapper);
  }
}

function fixture() {
  const page = new BrowserEmitter();
  const browser = new BrowserEmitter();
  let closed = false;
  let connected = true;
  page.setBypassCSP = async () => {};
  page.goto = async (url) => { page.visited = url; };
  page.isClosed = () => closed;
  page.waitForTimeout = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  browser.pages = async () => [page];
  browser.isConnected = () => connected;
  return {
    page, browser,
    close() { closed = true; page.emit('close'); },
    disconnect() { connected = false; browser.emit('disconnected'); },
  };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 15));
const app = { url: new URL('https://example.invalid/') };

for (const end of ['close', 'disconnect']) {
  test(`remains active after ready and settles on ${end}`, async () => {
    const f = fixture();
    let ready = 0;
    let settled = false;
    const pending = generic_webpage(f.browser, app, () => { ready++; }).then(() => { settled = true; });
    await tick();
    assert.equal(f.page.visited, app.url.toString());
    assert.equal(ready, 1);
    assert.equal(settled, false, 'loading a generic page must not end the stream');
    f[end]();
    await pending;
    assert.equal(settled, true);
    assert.equal(f.page.listenerCount('close'), 0);
    assert.equal(f.browser.listenerCount('disconnected'), 0);
    f.close(); f.disconnect();
  });
  test(`handles ${end} inside ready without hanging`, async () => {
    const f = fixture();
    await generic_webpage(f.browser, app, () => f[end]());
    assert.equal(f.page.listenerCount('close'), 0);
    assert.equal(f.browser.listenerCount('disconnected'), 0);
  });
}
test('optional ready callback and a closed page are supported', async () => {
  const f = fixture();
  f.page.goto = async () => f.close();
  await generic_webpage(f.browser, app);
  assert.equal(f.browser.listenerCount('disconnected'), 0);
});
test('navigation rejection is preserved', async () => {
  const f = fixture();
  const failure = new Error('navigation failed');
  f.page.goto = async () => { throw failure; };
  let ready = false;
  await assert.rejects(generic_webpage(f.browser, app, () => { ready = true; }), failure);
  assert.equal(ready, false);
  assert.equal(f.page.listenerCount('close'), 0);
  assert.equal(f.browser.listenerCount('disconnected'), 0);
});
