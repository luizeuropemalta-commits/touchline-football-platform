import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { localLoginBrowserURL, loginRequestAllowed } from './helpers/local-login-browser-policy.ts';
test('login target remains explicit loopback login without redirect query', () => {
  assert.equal(localLoginBrowserURL('http://127.0.0.1:3130/login?lang=en-GB').origin, 'http://127.0.0.1:3130');
  for (const url of ['https://example.com/login', 'http://2130706433/login', 'http://user@localhost/login',
    'http://localhost/arena', 'http://localhost/login#x', 'http://localhost/login#', 'http://localhost/login?returnTo=/admin',
    'http://localhost/login?lang=en&lang=pt', 'http://localhost/login?lang=invalid', 'http://localhost\\login', '', ' http://localhost/login']) {
    assert.throws(() => localLoginBrowserURL(url));
  }
});
test('only same-origin GET and HEAD are eligible', () => {
  const origin = 'http://127.0.0.1:3130';
  for (const method of ['GET', 'HEAD']) assert.equal(loginRequestAllowed(origin, `${origin}/asset`, method), true);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) assert.equal(loginRequestAllowed(origin, `${origin}/asset`, method), false);
  for (const url of ['https://example.com/a', 'http://127.0.0.1:3131/a', 'http://localhost:3130/a', 'data:text/plain,a', 'blob:http://127.0.0.1:3130/x', 'http://user:pass@127.0.0.1:3130/a', 'ws://127.0.0.1:3130/a', 'wss://127.0.0.1:3130/a', 'http://127.0.0.1:3130/a#', 'http://127.0.0.1:3130\\a', 'bad']) {
    assert.equal(loginRequestAllowed(origin, url, 'GET'), false);
  }
});
test('interception precedes page creation and blocked attempts remain failures', async () => {
  const source = await readFile(new URL('./touchline-login-membership-layout.test.mts', import.meta.url), 'utf8');
  const before = (left: string, right: string) => {
    const a = source.indexOf(left), b = source.indexOf(right);
    assert.ok(a >= 0, `missing ${left}`); assert.ok(b >= 0, `missing ${right}`);
    assert.ok(a < b, `${left} must precede ${right}`);
  };
  before('localLoginBrowserURL(process.env', 'webkit.launch');
  before("context.route('**/*'", 'context.newPage()');
  before("context.routeWebSocket('**/*'", 'context.newPage()');
  before('context.newPage()', 'page.goto(loginTarget.href');
  before("t.signal.addEventListener('abort'", 'webkit.launch');
  assert.match(source, /maxRedirects: 0, maxRetries: 0, timeout: 10_000/);
  assert.match(source, /response.status\(\) >= 300 && response.status\(\) < 400/);
  assert.doesNotMatch(source, /route\.continue\(/);
  assert.match(source, /assert\.deepEqual\(blocked, \[\]/);
  assert.match(source, /finally \{ await response.dispose\(\); \}/);
  assert.match(source, /finally \{ await closeBrowser\(\); \}/);
  assert.match(source, /serviceWorkers: 'block'/);
});
