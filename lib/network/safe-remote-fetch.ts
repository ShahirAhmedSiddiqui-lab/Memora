import { lookup } from 'dns/promises';
import { isIP } from 'net';

const REMOTE_FETCH_USER_AGENT = 'Mozilla/5.0 MemoraBot/1.0';
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
]);

export class UnsafeRemoteUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeRemoteUrlError';
  }
}

export async function fetchSafeRemoteText(url: string, options?: { timeoutMs?: number }) {
  const response = await fetchSafeRemote(url, options);
  return response.text();
}

export async function fetchSafeRemote(url: string, options?: { timeoutMs?: number }) {
  return fetchSafeRemoteInternal(url, options?.timeoutMs ?? DEFAULT_TIMEOUT_MS, 0);
}

async function fetchSafeRemoteInternal(url: string, timeoutMs: number, redirectCount: number): Promise<Response> {
  const parsedUrl = await assertSafeRemoteUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(parsedUrl.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': REMOTE_FETCH_USER_AGENT,
      },
      cache: 'no-store',
      redirect: 'manual',
    });

    if (isRedirectResponse(response.status)) {
      if (redirectCount >= MAX_REDIRECTS) {
        throw new UnsafeRemoteUrlError('Too many redirects while retrieving the remote URL.');
      }

      const location = response.headers.get('location');
      if (!location) {
        throw new UnsafeRemoteUrlError('Remote URL redirected without a valid location.');
      }

      const nextUrl = new URL(location, parsedUrl).toString();
      return fetchSafeRemoteInternal(nextUrl, timeoutMs, redirectCount + 1);
    }

    return response;
  } finally {
    clearTimeout(timeout);
  }
}

export async function assertSafeRemoteUrl(url: string) {
  const parsedUrl = new URL(url);
  const protocol = parsedUrl.protocol.toLowerCase();

  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new UnsafeRemoteUrlError('Only HTTP and HTTPS URLs are allowed.');
  }

  const hostname = parsedUrl.hostname.trim().toLowerCase();
  if (!hostname) {
    throw new UnsafeRemoteUrlError('URL hostname is required.');
  }

  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
    throw new UnsafeRemoteUrlError('Local network addresses are not allowed.');
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new UnsafeRemoteUrlError('Embedded credentials are not allowed in remote URLs.');
  }

  await assertSafeHostname(hostname);

  return parsedUrl;
}

async function assertSafeHostname(hostname: string) {
  if (isIP(hostname)) {
    if (isBlockedIpAddress(hostname)) {
      throw new UnsafeRemoteUrlError('Private or reserved IP addresses are not allowed.');
    }

    return;
  }

  const resolved = await lookup(hostname, { all: true, verbatim: true });
  if (resolved.length === 0) {
    throw new UnsafeRemoteUrlError('Unable to resolve the remote hostname.');
  }

  for (const record of resolved) {
    if (isBlockedIpAddress(record.address)) {
      throw new UnsafeRemoteUrlError('Remote hostname resolves to a private or reserved network address.');
    }
  }
}

function isRedirectResponse(status: number) {
  return status >= 300 && status < 400;
}

function isBlockedIpAddress(ip: string) {
  if (ip.includes(':')) {
    return isBlockedIpv6(ip);
  }

  return isBlockedIpv4(ip);
}

function isBlockedIpv4(ip: string) {
  const octets = ip.split('.').map((segment) => Number.parseInt(segment, 10));
  if (octets.length !== 4 || octets.some((segment) => Number.isNaN(segment) || segment < 0 || segment > 255)) {
    return true;
  }

  const [a, b] = octets;

  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;

  return false;
}

function isBlockedIpv6(ip: string) {
  const normalized = ip.toLowerCase();

  return normalized === '::1'
    || normalized === '::'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:')
    || normalized.startsWith('::ffff:127.')
    || normalized.startsWith('::ffff:10.')
    || normalized.startsWith('::ffff:192.168.')
    || normalized.startsWith('::ffff:172.16.')
    || normalized.startsWith('::ffff:172.17.')
    || normalized.startsWith('::ffff:172.18.')
    || normalized.startsWith('::ffff:172.19.')
    || normalized.startsWith('::ffff:172.2')
    || normalized.startsWith('::ffff:172.30.')
    || normalized.startsWith('::ffff:172.31.')
    || normalized.startsWith('::ffff:169.254.');
}
