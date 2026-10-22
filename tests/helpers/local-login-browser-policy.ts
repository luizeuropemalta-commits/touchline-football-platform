import { localBrowserBaseURL } from './local-browser-target.ts';

export function localLoginBrowserURL(value: string): URL {
  if (typeof value !== 'string' || /[\\\s]/.test(value)) throw Error('Invalid local login target');
  const authority = value.match(/^(https?:\/\/[^/?#]+)(?:[/?#]|$)/i)?.[1];
  if (!authority) throw Error('Invalid local login target');
  const origin = localBrowserBaseURL(authority, authority);
  const url = new URL(value);
  if (url.origin !== origin || url.pathname !== '/login' || value.includes('#')) throw Error('Invalid local login path');
  const entries = [...url.searchParams.entries()];
  if (entries.length > 1 || entries.some(([key, val]) => key !== 'lang' || !/^[a-z]{2}(?:-[A-Za-z]{2})?$/.test(val))) {
    throw Error('Invalid local login query');
  }
  return url;
}

export function loginRequestAllowed(origin: string, requestURL: string, method: string): boolean {
  if ((method !== 'GET' && method !== 'HEAD') || /[\\\s#]/.test(requestURL)) return false;
  try {
    const authority = requestURL.match(/^(https?:\/\/[^/?#]+)(?:[/?#]|$)/i)?.[1];
    if (!authority || localBrowserBaseURL(authority, authority) !== origin) return false;
    const url = new URL(requestURL);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === origin && !url.username && !url.password;
  } catch { return false; }
}

// Browser interception is not backend isolation or an OS network sandbox.
// WebSockets are independently denied by the caller before creating a page.
