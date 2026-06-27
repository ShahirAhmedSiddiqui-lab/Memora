import { type KnowledgeItem } from '@/lib/db';

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

const DIRECT_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov', '.m4v'];
const DIRECT_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp', '.svg'];
const DIRECT_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.webm'];
const DIRECT_PDF_EXTENSIONS = ['.pdf'];

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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 MemoraBot/1.0',
      },
      cache: 'no-store',
    });
    clearTimeout(timeout);

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
    const canonicalUrl = resolvePreviewUrl(
      url,
      findMetaContent(html, ['property', 'og:url'])
      || findLinkHref(html, 'canonical')
    ) || parsedUrl.toString();
    const title =
      findMetaContent(html, ['property', 'og:title'])
      || findMetaContent(html, ['name', 'og:title'])
      || findMetaContent(html, ['name', 'twitter:title'])
      || findMetaContent(html, ['property', 'twitter:title'])
      || extractHtmlTag(html, 'title');
    const description =
      findMetaContent(html, ['property', 'og:description'])
      || findMetaContent(html, ['name', 'og:description'])
      || findMetaContent(html, ['name', 'twitter:description'])
      || findMetaContent(html, ['property', 'twitter:description'])
      || findMetaContent(html, ['name', 'description']);
    const authorName =
      findMetaContent(html, ['name', 'author'])
      || findMetaContent(html, ['property', 'article:author'])
      || findMetaContent(html, ['property', 'og:article:author'])
      || findMetaContent(html, ['name', 'twitter:creator']);
    const thumbnailUrl = resolvePreviewUrl(
      url,
      findMetaContent(html, ['property', 'og:image'])
      || findMetaContent(html, ['property', 'og:image:secure_url'])
      || findMetaContent(html, ['name', 'og:image'])
      || findMetaContent(html, ['name', 'twitter:image'])
      || findMetaContent(html, ['property', 'twitter:image'])
      || findMetaContent(html, ['property', 'twitter:image:src'])
      || findMetaContent(html, ['itemprop', 'image'])
    );
    const siteName = findMetaContent(html, ['property', 'og:site_name']);
    const visibleText = stripHtml(html).slice(0, MAX_EXTRACTED_TEXT_LENGTH);

    return {
      title: title || undefined,
      description: description || undefined,
      thumbnailUrl: thumbnailUrl || inferredPreview.thumbnailUrl,
      provider: siteName || detectProviderFromHostname(parsedUrl.hostname, itemType),
      authorName: authorName || undefined,
      canonicalUrl,
      previewUrl: canonicalUrl,
      embedUrl: inferredPreview.embedUrl,
      mediaKind: inferredPreview.mediaKind || inferMediaKindFromItemType(itemType),
      extractedText: visibleText || undefined,
    };
  } catch {
    return null;
  }
}

export function inferPreviewFromUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname.toLowerCase();
    const pathnameSegments = parsedUrl.pathname.split('/').filter(Boolean);

    if (DIRECT_PDF_EXTENSIONS.some((extension) => pathname.endsWith(extension))) {
      return {
        mediaKind: 'pdf' as const,
        previewUrl: parsedUrl.toString(),
        embedUrl: parsedUrl.toString(),
        thumbnailUrl: undefined,
      };
    }

    if (DIRECT_IMAGE_EXTENSIONS.some((extension) => pathname.endsWith(extension))) {
      return {
        mediaKind: 'image' as const,
        previewUrl: parsedUrl.toString(),
        embedUrl: undefined,
        thumbnailUrl: parsedUrl.toString(),
      };
    }

    if (DIRECT_AUDIO_EXTENSIONS.some((extension) => pathname.endsWith(extension))) {
      return {
        mediaKind: 'audio' as const,
        previewUrl: parsedUrl.toString(),
        embedUrl: undefined,
        thumbnailUrl: undefined,
      };
    }

    if (DIRECT_VIDEO_EXTENSIONS.some((extension) => pathname.endsWith(extension))) {
      return {
        mediaKind: 'video' as const,
        previewUrl: parsedUrl.toString(),
        embedUrl: undefined,
        thumbnailUrl: undefined,
      };
    }

    if (hostname.includes('youtu.be')) {
      const videoId = pathnameSegments[0];
      return {
        mediaKind: 'video' as const,
        previewUrl: parsedUrl.toString(),
        embedUrl: videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : undefined,
        thumbnailUrl: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : undefined,
      };
    }

    if (hostname.includes('youtube.com')) {
      const videoId =
        parsedUrl.pathname === '/watch'
          ? parsedUrl.searchParams.get('v')
          : pathnameSegments[1];
      return {
        mediaKind: 'video' as const,
        previewUrl: parsedUrl.toString(),
        embedUrl: videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : undefined,
        thumbnailUrl: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : undefined,
      };
    }

    if (hostname.includes('vimeo.com')) {
      const videoId = pathnameSegments.find((segment) => /^\d+$/.test(segment));
      return {
        mediaKind: 'video' as const,
        previewUrl: parsedUrl.toString(),
        embedUrl: videoId ? `https://player.vimeo.com/video/${videoId}` : undefined,
        thumbnailUrl: undefined,
      };
    }

    if (hostname.includes('loom.com')) {
      const videoId = pathnameSegments[pathnameSegments.length - 1];
      return {
        mediaKind: 'video' as const,
        previewUrl: parsedUrl.toString(),
        embedUrl: videoId ? `https://www.loom.com/embed/${videoId}` : undefined,
        thumbnailUrl: undefined,
      };
    }

    if (hostname === 'dai.ly' || hostname.includes('dailymotion.com')) {
      const videoId = hostname === 'dai.ly'
        ? pathnameSegments[0]
        : pathnameSegments[pathnameSegments.length - 1];
      return {
        mediaKind: 'video' as const,
        previewUrl: parsedUrl.toString(),
        embedUrl: videoId ? `https://www.dailymotion.com/embed/video/${videoId}` : undefined,
        thumbnailUrl: undefined,
      };
    }

    if (hostname.includes('wistia.com') || hostname.includes('fast.wistia.net')) {
      const mediaIndex = pathnameSegments.findIndex((segment) => segment === 'medias');
      const videoId = mediaIndex >= 0 ? pathnameSegments[mediaIndex + 1] : pathnameSegments[pathnameSegments.length - 1];
      return {
        mediaKind: 'video' as const,
        previewUrl: parsedUrl.toString(),
        embedUrl: videoId ? `https://fast.wistia.net/embed/iframe/${videoId}` : undefined,
        thumbnailUrl: undefined,
      };
    }

    if (hostname.includes('drive.google.com')) {
      const fileIndex = pathnameSegments.findIndex((segment) => segment === 'd');
      const fileId = fileIndex >= 0 ? pathnameSegments[fileIndex + 1] : undefined;
      return {
        mediaKind: 'video' as const,
        previewUrl: parsedUrl.toString(),
        embedUrl: fileId ? `https://drive.google.com/file/d/${fileId}/preview` : undefined,
        thumbnailUrl: undefined,
      };
    }

    return {
      mediaKind: 'unknown' as const,
      previewUrl: parsedUrl.toString(),
      embedUrl: undefined,
      thumbnailUrl: undefined,
    };
  } catch {
    return {
      mediaKind: 'unknown' as const,
      previewUrl: url,
      embedUrl: undefined,
      thumbnailUrl: undefined,
    };
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
