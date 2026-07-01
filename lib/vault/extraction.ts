import { type KnowledgeItem } from '@/lib/db';
import { inferPreviewFromUrl } from '@/lib/vault/preview-inference';
import { fetchSafeRemote } from '@/lib/network/safe-remote-fetch';

type UploadedFileData = {
  mimeType?: string;
  name?: string;
  size?: number;
};

export type ExtractedRemoteSourceData = {
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  provider?: string;
  authorName?: string;
  canonicalUrl?: string;
  previewUrl?: string;
  embedUrl?: string;
  mediaKind?: 'video' | 'pdf' | 'image' | 'audio' | 'article' | 'social' | 'unknown';
  extractedText?: string;
};

const MAX_EXTRACTED_TEXT_LENGTH = 12000;
const MAX_SCHEMA_OBJECTS = 12;
const MAX_TEXT_BLOCKS = 18;

export async function extractRemoteSourceData(
  url: string,
  itemType?: KnowledgeItem['type']
): Promise<ExtractedRemoteSourceData | null> {
  try {
    const parsedUrl = new URL(url);
    const inferredPreview = inferPreviewFromUrl(url);
    const isDirectAsset = inferredPreview.mediaKind === 'video'
      || inferredPreview.mediaKind === 'pdf'
      || inferredPreview.mediaKind === 'image'
      || inferredPreview.mediaKind === 'audio';

    if (isDirectAsset) {
      return {
        provider: detectProviderFromHostname(parsedUrl.hostname, itemType),
        canonicalUrl: parsedUrl.toString(),
        previewUrl: parsedUrl.toString(),
        embedUrl: inferredPreview.embedUrl,
        thumbnailUrl: inferredPreview.thumbnailUrl,
        mediaKind: inferredPreview.mediaKind,
        title: parsedUrl.pathname.split('/').filter(Boolean).pop(),
      };
    }

    const response = await fetchSafeRemote(url, { timeoutMs: 5000 });

    if (!response.ok) {
      return {
        provider: detectProviderFromHostname(parsedUrl.hostname, itemType),
        canonicalUrl: parsedUrl.toString(),
        previewUrl: parsedUrl.toString(),
        embedUrl: inferredPreview.embedUrl,
        thumbnailUrl: inferredPreview.thumbnailUrl,
        mediaKind: inferredPreview.mediaKind,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return {
        provider: detectProviderFromHostname(parsedUrl.hostname, itemType),
        canonicalUrl: parsedUrl.toString(),
        previewUrl: parsedUrl.toString(),
        embedUrl: inferredPreview.embedUrl,
        thumbnailUrl: inferredPreview.thumbnailUrl,
        mediaKind: inferMediaKindFromContentType(contentType) ?? inferredPreview.mediaKind,
      };
    }

    const html = await response.text();
    const schema = extractPrimarySchemaData(html, url);
    const canonicalUrl = resolvePreviewUrl(
      url,
      findMetaContent(html, ['property', 'og:url'])
      || findLinkHref(html, 'canonical')
      || schema.canonicalUrl
    ) || parsedUrl.toString();
    const title =
      findMetaContent(html, ['property', 'og:title'])
      || findMetaContent(html, ['name', 'og:title'])
      || findMetaContent(html, ['name', 'twitter:title'])
      || findMetaContent(html, ['property', 'twitter:title'])
      || schema.title
      || extractHtmlTag(html, 'title');
    const description =
      findMetaContent(html, ['property', 'og:description'])
      || findMetaContent(html, ['name', 'og:description'])
      || findMetaContent(html, ['name', 'twitter:description'])
      || findMetaContent(html, ['property', 'twitter:description'])
      || findMetaContent(html, ['name', 'description'])
      || schema.description;
    const authorName =
      findMetaContent(html, ['name', 'author'])
      || findMetaContent(html, ['property', 'article:author'])
      || findMetaContent(html, ['property', 'og:article:author'])
      || findMetaContent(html, ['name', 'twitter:creator'])
      || schema.authorName;
    const thumbnailUrl = resolvePreviewUrl(
      url,
      pickBestThumbnailCandidate(url, [
        schema.thumbnailUrl,
        findMetaContent(html, ['property', 'og:image']),
        findMetaContent(html, ['property', 'og:image:secure_url']),
        findMetaContent(html, ['name', 'og:image']),
        findMetaContent(html, ['name', 'twitter:image']),
        findMetaContent(html, ['property', 'twitter:image']),
        findMetaContent(html, ['property', 'twitter:image:src']),
        findMetaContent(html, ['itemprop', 'image']),
      ])
    );
    const embedUrl = resolvePreviewUrl(
      url,
      schema.embedUrl
      || findMetaContent(html, ['property', 'og:video:url'])
      || findMetaContent(html, ['property', 'og:video:secure_url'])
      || findMetaContent(html, ['property', 'og:video'])
      || findMetaContent(html, ['name', 'twitter:player'])
      || findMetaContent(html, ['itemprop', 'embedUrl'])
      || findMetaContent(html, ['itemprop', 'contentUrl'])
    );
    const siteName = findMetaContent(html, ['property', 'og:site_name']);
    const visibleText = extractMeaningfulText(html, {
      fallbackDescription: description,
      fallbackTitle: title,
      hostname: parsedUrl.hostname,
    }).slice(0, MAX_EXTRACTED_TEXT_LENGTH);
    const mediaKind =
      schema.mediaKind
      || inferMediaKindFromEmbedUrl(embedUrl)
      || inferredPreview.mediaKind
      || inferMediaKindFromItemType(itemType);

    return {
      title: title || undefined,
      description: description || undefined,
      thumbnailUrl: thumbnailUrl || inferredPreview.thumbnailUrl,
      provider: siteName || detectProviderFromHostname(parsedUrl.hostname, itemType),
      authorName: authorName || undefined,
      canonicalUrl,
      previewUrl: canonicalUrl,
      embedUrl: embedUrl || inferredPreview.embedUrl,
      mediaKind,
      extractedText: visibleText || buildMetadataSummaryText({
        title,
        description,
        authorName,
        provider: siteName || detectProviderFromHostname(parsedUrl.hostname, itemType),
        canonicalUrl,
        mediaKind,
      }),
    };
  } catch {
    return null;
  }
}

export function inferPreviewFromFile(fileData?: UploadedFileData) {
  const mimeType = fileData?.mimeType?.toLowerCase() || '';

  if (mimeType === 'application/pdf') {
    return 'pdf' as const;
  }
  if (mimeType.startsWith('image/')) {
    return 'image' as const;
  }
  if (mimeType.startsWith('audio/')) {
    return 'audio' as const;
  }
  if (mimeType.startsWith('video/')) {
    return 'video' as const;
  }

  return 'unknown' as const;
}

function inferMediaKindFromItemType(itemType?: KnowledgeItem['type']) {
  switch (itemType) {
    case 'Videos':
      return 'video';
    case 'PDFs':
      return 'pdf';
    case 'Images':
      return 'image';
    case 'Voice Notes':
      return 'audio';
    case 'Social Links':
      return 'social';
    case 'Articles':
      return 'article';
    default:
      return 'unknown';
  }
}

function inferMediaKindFromContentType(contentType: string) {
  const normalized = contentType.toLowerCase();
  if (normalized.includes('application/pdf')) return 'pdf';
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('audio/')) return 'audio';
  if (normalized.startsWith('video/')) return 'video';
  return undefined;
}

function inferMediaKindFromEmbedUrl(embedUrl: string) {
  if (!embedUrl) {
    return undefined;
  }

  const normalized = embedUrl.toLowerCase();
  if (
    normalized.includes('/embed/')
    || normalized.includes('player')
    || normalized.endsWith('.m3u8')
    || normalized.endsWith('.mp4')
  ) {
    return 'video' as const;
  }

  return undefined;
}

function detectProviderFromHostname(hostname: string, itemType?: KnowledgeItem['type']) {
  const normalized = hostname.replace(/^www\./, '').toLowerCase();
  if (normalized === 'x.com' || normalized === 'twitter.com') return 'X';
  if (normalized.includes('linkedin.com')) return 'LinkedIn';
  if (normalized.includes('instagram.com')) return 'Instagram';
  if (normalized.includes('youtube.com') || normalized.includes('youtu.be')) return 'YouTube';
  if (normalized.includes('vimeo.com')) return 'Vimeo';
  if (normalized.includes('loom.com')) return 'Loom';
  if (normalized.includes('dailymotion.com') || normalized === 'dai.ly') return 'Dailymotion';
  if (normalized.includes('wistia')) return 'Wistia';
  if (normalized.includes('drive.google.com')) return 'Google Drive';
  if (itemType === 'Social Links') return 'Social Feed';
  return normalized;
}

function extractPrimarySchemaData(html: string, baseUrl: string) {
  const objects = extractJsonLdObjects(html);
  const candidates = objects
    .map((entry) => normalizeSchemaEntry(entry))
    .filter((entry): entry is ReturnType<typeof normalizeSchemaEntry> & NonNullable<unknown> => Boolean(entry));

  const scored = candidates
    .map((entry) => ({
      entry,
      score: scoreSchemaEntry(entry),
    }))
    .sort((left, right) => right.score - left.score);

  const best = scored[0]?.entry;

  return {
    title: best?.title || '',
    description: best?.description || '',
    authorName: best?.authorName || '',
    thumbnailUrl: resolvePreviewUrl(baseUrl, best?.thumbnailUrl || ''),
    embedUrl: resolvePreviewUrl(baseUrl, best?.embedUrl || ''),
    canonicalUrl: resolvePreviewUrl(baseUrl, best?.canonicalUrl || ''),
    mediaKind: best?.mediaKind,
  };
}

function extractJsonLdObjects(html: string) {
  const matches = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const results: unknown[] = [];

  for (const match of matches.slice(0, MAX_SCHEMA_OBJECTS)) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw);
      flattenJsonLd(parsed, results);
    } catch {
      continue;
    }
  }

  return results;
}

function flattenJsonLd(value: unknown, results: unknown[]) {
  if (!value || results.length >= MAX_SCHEMA_OBJECTS) {
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      flattenJsonLd(entry, results);
    }
    return;
  }

  if (typeof value !== 'object') {
    return;
  }

  const record = value as Record<string, unknown>;

  if (Array.isArray(record['@graph'])) {
    flattenJsonLd(record['@graph'], results);
  }

  results.push(record);
}

function normalizeSchemaEntry(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const typeValues = normalizeSchemaType(record['@type']);
  const primaryType = typeValues[0] || '';

  const title = readSchemaString(record.name) || readSchemaString(record.headline);
  const description = readSchemaString(record.description);
  const authorName = readSchemaPerson(record.author) || readSchemaPerson(record.creator);
  const thumbnailUrl = readSchemaImage(record.thumbnailUrl) || readSchemaImage(record.image);
  const embedUrl = readSchemaString(record.embedUrl) || readSchemaString(record.contentUrl);
  const canonicalUrl = readSchemaString(record.mainEntityOfPage) || readSchemaString(record.url);
  const mediaKind = inferMediaKindFromSchemaType(primaryType, embedUrl);

  if (!title && !description && !thumbnailUrl && !embedUrl) {
    return null;
  }

  return {
    primaryType,
    title,
    description,
    authorName,
    thumbnailUrl,
    embedUrl,
    canonicalUrl,
    mediaKind,
  };
}

function normalizeSchemaType(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return [value.trim()];
  }

  return [];
}

function readSchemaString(value: unknown): string {
  if (typeof value === 'string') {
    return normalizeExtractedText(value);
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const candidate = typeof record.url === 'string' ? record.url : typeof record['@id'] === 'string' ? record['@id'] : '';
    return normalizeExtractedText(candidate);
  }

  return '';
}

function readSchemaPerson(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => readSchemaPerson(entry)).find(Boolean) || '';
  }

  if (typeof value === 'string') {
    return normalizeExtractedText(value);
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return normalizeExtractedText(typeof record.name === 'string' ? record.name : '');
  }

  return '';
}

function readSchemaImage(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => readSchemaImage(entry)).find(Boolean) || '';
  }

  if (typeof value === 'string') {
    return normalizeExtractedText(value);
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    return normalizeExtractedText(
      typeof record.url === 'string'
        ? record.url
        : typeof record.contentUrl === 'string'
          ? record.contentUrl
          : ''
    );
  }

  return '';
}

function inferMediaKindFromSchemaType(schemaType: string, embedUrl: string) {
  const normalized = schemaType.toLowerCase();
  if (!normalized && !embedUrl) {
    return undefined;
  }

  if (normalized.includes('video') || normalized.includes('episode') || normalized.includes('movie')) {
    return 'video' as const;
  }
  if (normalized.includes('article') || normalized.includes('posting') || normalized.includes('blog')) {
    return 'article' as const;
  }
  if (normalized.includes('image')) {
    return 'image' as const;
  }

  return inferMediaKindFromEmbedUrl(embedUrl);
}

function scoreSchemaEntry(entry: NonNullable<ReturnType<typeof normalizeSchemaEntry>>) {
  let score = 0;
  const type = entry.primaryType.toLowerCase();

  if (type.includes('video')) score += 10;
  if (type.includes('episode')) score += 9;
  if (type.includes('movie')) score += 9;
  if (type.includes('socialmediaposting')) score += 8;
  if (type.includes('article')) score += 7;
  if (entry.embedUrl) score += 8;
  if (entry.thumbnailUrl) score += 4;
  if (entry.title) score += 4;
  if (entry.description) score += 3;

  return score;
}

function pickBestThumbnailCandidate(baseUrl: string, candidates: Array<string | undefined>) {
  for (const candidate of candidates) {
    const resolved = resolvePreviewUrl(baseUrl, candidate || '');
    if (!resolved) {
      continue;
    }

    if (looksLikeAvatarImage(resolved)) {
      continue;
    }

    return resolved;
  }

  return '';
}

function looksLikeAvatarImage(url: string) {
  const normalized = url.toLowerCase();
  return normalized.includes('profile_images')
    || normalized.includes('/avatar')
    || normalized.includes('avatar_')
    || normalized.includes('/profile/')
    || normalized.includes('/pfp/');
}

function extractMeaningfulText(
  html: string,
  options: {
    fallbackTitle: string;
    fallbackDescription: string;
    hostname: string;
  }
) {
  const preferredSections = [
    extractSectionText(html, 'article'),
    extractSectionText(html, 'main'),
  ].filter(Boolean);

  const paragraphMatches = [...html.matchAll(/<(p|h1|h2|h3|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => normalizeExtractedText(match[2] || ''))
    .filter(Boolean)
    .filter((entry) => entry.length > 30)
    .slice(0, MAX_TEXT_BLOCKS);

  const textBlocks = [...preferredSections, ...paragraphMatches];
  const combined = dedupeTextBlocks(textBlocks).join('\n\n').trim();

  if (combined) {
    return combined;
  }

  if (options.hostname.includes('x.com') || options.hostname.includes('twitter.com')) {
    return normalizeExtractedText([options.fallbackTitle, options.fallbackDescription].filter(Boolean).join(' '));
  }

  const stripped = stripHtml(html);
  if (stripped) {
    return stripped;
  }

  return buildMetadataSummaryText({
    title: options.fallbackTitle,
    description: options.fallbackDescription,
  });
}

function extractSectionText(html: string, tagName: string) {
  const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return normalizeExtractedText(match?.[1] || '');
}

function dedupeTextBlocks(blocks: string[]) {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const block of blocks) {
    const normalized = block.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    results.push(block);
  }

  return results;
}

function buildMetadataSummaryText(input: {
  title?: string;
  description?: string;
  authorName?: string;
  provider?: string;
  canonicalUrl?: string;
  mediaKind?: string;
}) {
  return [
    input.title ? `Title: ${input.title}` : '',
    input.description ? `Description: ${input.description}` : '',
    input.authorName ? `Author: ${input.authorName}` : '',
    input.provider ? `Provider: ${input.provider}` : '',
    input.mediaKind ? `Media type: ${input.mediaKind}` : '',
    input.canonicalUrl ? `Source URL: ${input.canonicalUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function findMetaContent(html: string, attribute: [string, string]) {
  const [name, value] = attribute;
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]*${name}=["']${escapedValue}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${name}=["']${escapedValue}["'][^>]*>`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const content = normalizeExtractedText(match?.[1] || '');
    if (content) {
      return content;
    }
  }

  return '';
}

function findLinkHref(html: string, rel: string) {
  const escapedValue = rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<link[^>]*rel=["'][^"']*${escapedValue}[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<link[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*${escapedValue}[^"']*["'][^>]*>`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const href = normalizeExtractedText(match?.[1] || '');
    if (href) {
      return href;
    }
  }

  return '';
}

function extractHtmlTag(html: string, tagName: string) {
  const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return normalizeExtractedText(match?.[1] || '');
}

function stripHtml(html: string) {
  return normalizeExtractedText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
  );
}

function normalizeExtractedText(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolvePreviewUrl(baseUrl: string, candidate: string) {
  if (!candidate) {
    return '';
  }

  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return candidate;
  }
}
