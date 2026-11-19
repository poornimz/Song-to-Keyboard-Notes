import express from 'express';
import dns from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB cap
const FETCH_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;

const BLOCKED_STREAMING_HOSTS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /(^|\.)youtube\.com$/i, label: 'YouTube' },
  { pattern: /(^|\.)youtu\.be$/i, label: 'YouTube' },
  { pattern: /(^|\.)music\.youtube\.com$/i, label: 'YouTube Music' },
  { pattern: /(^|\.)open\.spotify\.com$/i, label: 'Spotify' },
  { pattern: /(^|\.)spotify\.com$/i, label: 'Spotify' },
  { pattern: /(^|\.)music\.apple\.com$/i, label: 'Apple Music' },
  { pattern: /(^|\.)soundcloud\.com$/i, label: 'SoundCloud' },
  { pattern: /(^|\.)tidal\.com$/i, label: 'Tidal' },
  { pattern: /(^|\.)deezer\.com$/i, label: 'Deezer' },
  { pattern: /(^|\.)bandcamp\.com$/i, label: 'Bandcamp' },
];

function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split('.').map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 ("this network")
  if (a === 10) return true; // 10.0.0.0/8 (RFC1918)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local / cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (RFC1918)
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24
  if (a === 192 && b === 0 && parts[2] === 2) return true; // TEST-NET-1
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 (RFC1918)
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && parts[2] === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && parts[2] === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast & reserved
  return false;
}

function isPrivateOrReservedIP(ip: string): boolean {
  const normalized = ip.trim().toLowerCase();
  const zoneIndex = normalized.indexOf('%');
  const cleanIp = zoneIndex >= 0 ? normalized.slice(0, zoneIndex) : normalized;

  if (net.isIPv4(cleanIp)) {
    return isPrivateOrReservedIPv4(cleanIp);
  }

  if (net.isIPv6(cleanIp)) {
    if (cleanIp === '::' || cleanIp === '::1') return true;
    // IPv4-mapped IPv6 addresses like ::ffff:127.0.0.1 or ::ffff:7f00:1
    if (cleanIp.startsWith('::ffff:')) {
      const suffix = cleanIp.slice(7);
      if (net.isIPv4(suffix)) {
        return isPrivateOrReservedIPv4(suffix);
      }
      // Handle hex form e.g. ::ffff:7f00:0001
      const hexGroups = suffix.split(':');
      if (hexGroups.length === 2) {
        const hi = parseInt(hexGroups[0], 16);
        const lo = parseInt(hexGroups[1], 16);
        if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
          const ipv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
          return isPrivateOrReservedIPv4(ipv4);
        }
      }
      return true;
    }
    // Unique local (fc00::/7 -> fc.. or fd..)
    if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) return true;
    // Link-local (fe80::/10 -> fe8., fe9., fea., feb.)
    if (/^fe[89ab]/.test(cleanIp)) return true;
    // Multicast (ff00::/8)
    if (cleanIp.startsWith('ff')) return true;
    return false;
  }

  return true;
}

async function validatePublicUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Please enter a valid http:// or https:// audio URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http:// and https:// URLs are supported.');
  }

  if (parsed.username || parsed.password) {
    throw new Error('URLs containing embedded credentials are not allowed.');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname) {
    throw new Error('The URL is missing a valid hostname.');
  }

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Localhost and private internal network addresses cannot be fetched.');
  }

  const streamingMatch = BLOCKED_STREAMING_HOSTS.find((item) => item.pattern.test(hostname));
  if (streamingMatch) {
    throw new Error(
      `${streamingMatch.label} links point to a protected web page or DRM-encrypted stream rather than a direct audio file. Please paste a direct .mp3, .wav, .m4a, or .ogg file URL, or upload an audio file from your computer.`
    );
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIP(hostname)) {
      throw new Error('Private or reserved IP addresses are blocked for security.');
    }
    return parsed;
  }

  let resolvedAddresses: Array<{ address: string; family: number }>;
  try {
    resolvedAddresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error(`Could not resolve hostname "${hostname}". Verify the URL and try again.`);
  }

  if (!resolvedAddresses || resolvedAddresses.length === 0) {
    throw new Error(`Hostname "${hostname}" did not resolve to any IP address.`);
  }

  for (const entry of resolvedAddresses) {
    if (isPrivateOrReservedIP(entry.address)) {
      throw new Error('The target URL resolved to a private or reserved network address and was blocked.');
    }
  }

  return parsed;
}

async function fetchPublicAudioWithRedirects(initialUrl: string): Promise<Response> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const validated = await validatePublicUrl(currentUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(validated.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'audio/*,application/octet-stream;q=0.9,*/*;q=0.5',
          'User-Agent': 'SongToKeyboardNotes/1.0 AudioProxy',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Remote server returned a redirect without a destination URL.');
      }
      currentUrl = new URL(location, validated).toString();
      continue;
    }

    return response;
  }

  throw new Error('Too many redirects while fetching the audio URL.');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/fetch-audio', async (req, res) => {
    const rawUrl = typeof req.body?.url === 'string' ? req.body.url : '';
    if (!rawUrl.trim()) {
      res.status(400).json({ error: 'Please provide an audio URL.' });
      return;
    }

    try {
      const upstream = await fetchPublicAudioWithRedirects(rawUrl);

      if (!upstream.ok) {
        res.status(422).json({
          error: `Remote server returned HTTP ${upstream.status} (${upstream.statusText || 'Error'}). Verify the audio file is publicly accessible without login.`,
        });
        return;
      }

      const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
      const mimeOnly = contentType.split(';')[0].trim();

      if (
        mimeOnly === 'text/html' ||
        mimeOnly === 'application/xhtml+xml' ||
        mimeOnly === 'application/json' ||
        mimeOnly === 'text/plain' ||
        mimeOnly.startsWith('text/')
      ) {
        res.status(422).json({
          error: `This link returned a webpage (${mimeOnly || 'HTML'}) instead of a raw audio file. Paste a direct link ending in .mp3, .wav, .m4a, or .ogg (DRM streaming pages like YouTube, Spotify, or Apple Music cannot be decoded directly).`,
        });
        return;
      }

      const contentLengthHeader = upstream.headers.get('content-length');
      if (contentLengthHeader) {
        const declaredSize = Number(contentLengthHeader);
        if (!Number.isNaN(declaredSize) && declaredSize > MAX_AUDIO_BYTES) {
          res.status(413).json({
            error: `Audio file exceeds the 25 MB limit (${(declaredSize / (1024 * 1024)).toFixed(1)} MB). Please trim the file or upload a shorter clip.`,
          });
          return;
        }
      }

      if (!upstream.body) {
        res.status(422).json({ error: 'Remote server returned an empty response body.' });
        return;
      }

      const reader = upstream.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > MAX_AUDIO_BYTES) {
            await reader.cancel();
            res.status(413).json({
              error: 'Audio download exceeded the 25 MB size limit. Please use a smaller file or upload locally.',
            });
            return;
          }
          chunks.push(value);
        }
      }

      if (totalBytes === 0) {
        res.status(422).json({ error: 'The fetched audio file was empty (0 bytes).' });
        return;
      }

      const buffer = Buffer.concat(chunks, totalBytes);
      // Inspect leading bytes for accidental HTML payload without proper Content-Type
      const headText = buffer.subarray(0, Math.min(256, buffer.length)).toString('utf8').trimStart().toLowerCase();
      if (headText.startsWith('<!doctype html') || headText.startsWith('<html')) {
        res.status(422).json({
          error: 'This URL returned an HTML webpage instead of an audio stream. Please paste a direct .mp3, .wav, .m4a, or .ogg file link.',
        });
        return;
      }

      const outContentType =
        mimeOnly && (mimeOnly.startsWith('audio/') || mimeOnly === 'application/ogg' || mimeOnly === 'video/mp4')
          ? mimeOnly
          : 'application/octet-stream';

      res.setHeader('Content-Type', outContentType);
      res.setHeader('Content-Length', String(buffer.byteLength));
      res.setHeader('Cache-Control', 'no-store');
      res.send(buffer);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.name === 'AbortError'
            ? 'Timed out after 20 seconds while downloading the audio URL.'
            : err.message
          : 'Failed to fetch audio URL.';
      res.status(422).json({ error: message });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Song to Keyboard Notes server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
