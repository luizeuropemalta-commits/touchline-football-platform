/** Validate before registering browser tests. This is not a network sandbox. */
export function localBrowserBaseURL(override: string | undefined, fallback: string): string {
  const value = override ?? fallback;
  // Strict spelling avoids WHATWG normalization accepting integer/hex IPs,
  // encoded hosts, whitespace, credentials, backslashes or ambiguous paths.
  if (typeof value !== 'string' || !/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?\/?$/i.test(value)) {
    throw new Error('Browser test target must be an HTTP(S) loopback origin without credentials, path, query or fragment');
  }
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new Error('Invalid local browser test target'); }
  if (!['http:', 'https:'].includes(parsed.protocol)
      || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
      || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash
      || parsed.port === '0') {
    throw new Error('Invalid local browser test origin');
  }
  return parsed.origin;
}
