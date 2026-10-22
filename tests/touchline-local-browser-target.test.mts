import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { localBrowserBaseURL } from './helpers/local-browser-target.ts';

test('accepts only explicit loopback origins and preserves defaults/routes', () => {
  assert.equal(localBrowserBaseURL(undefined, 'http://127.0.0.1:3130'), 'http://127.0.0.1:3130');
  assert.equal(localBrowserBaseURL(undefined, 'http://127.0.0.1:3123'), 'http://127.0.0.1:3123');
  for (const input of ['http://localhost:3319', 'http://127.0.0.1:3123/', 'http://[::1]:3130', 'https://localhost:443/', 'HTTP://LOCALHOST:80', 'https://127.0.0.1:65535']) {
    const origin = localBrowserBaseURL(input, 'http://127.0.0.1:3130');
    assert.equal(origin, new URL(input).origin);
    assert.equal(new URL(`${origin}/visual-qa/player-leader-crown?lang=en-GB`).pathname, '/visual-qa/player-leader-crown');
  }
});

test('rejects remote, credentials, malformed and normalized-host bypasses without fallback', () => {
  for (const input of [
    '', ' ', 'https://touchline.example', 'https://qa.example', '//localhost:3130', '/local', 'localhost:3130',
    'file:///localhost', 'javascript:alert(1)', 'ftp://localhost', 'ws://localhost', 'data:text/plain,test',
    'http://user@localhost', 'http://user:password@127.0.0.1', 'http://localhost@remote.example',
    'http://localhost.evil.example', 'http://localhost.', 'http://0.0.0.0', 'http://127.0.0.2',
    'http://2130706433', 'http://0x7f000001', 'http://127.1', 'http://0177.0.0.1', 'http://%6cocalhost',
    'http://[::ffff:127.0.0.1]', 'http://localhost:65536', 'http://localhost:0', 'http://localhost:-1',
    'http://localhost/path', 'http://localhost//', 'http://localhost/?target=remote', 'http://localhost/#fragment',
    'http://localhost?', 'http://localhost#', ' http://localhost', 'http://localhost\n', 'http://local\thost',
    'http://localhost\\@remote.example', 'http://localhost/%2e%2e', 'http://[::1',
  ]) assert.throws(() => localBrowserBaseURL(input, 'http://127.0.0.1:3130'), undefined, input);
  assert.throws(() => localBrowserBaseURL(undefined, 'https://remote.example'));
});

test('all three specs resolve environment at declaration before network calls', () => {
  for (const [file, variable, port] of [
    ['touchline-public-launch-gate.spec.ts', 'TOUCHLINE_TEST_BASE_URL', '3130'],
    ['touchline-card-frame-decode.spec.ts', 'TOUCHLINE_VISUAL_QA_BASE_URL', '3123'],
    ['touchline-player-leader-crown.spec.ts', 'TOUCHLINE_VISUAL_QA_BASE_URL', '3123'],
  ]) {
    const source = readFileSync(new URL(`./browser/${file}`, import.meta.url), 'utf8');
    const resolution = source.indexOf(`localBrowserBaseURL(process.env.${variable}, "http://127.0.0.1:${port}")`);
    assert.ok(resolution > 0);
    for (const call of ['request.get(', 'page.goto(']) {
      const first = source.indexOf(call);
      if (first !== -1) assert.ok(resolution < first);
    }
    assert.equal((source.match(/process\.env\./g) ?? []).length, 1);
  }
});
