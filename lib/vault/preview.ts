import { type KnowledgeItem } from '@/lib/db';
import { inferPreviewFromUrl } from '@/lib/vault/preview-inference';

export type ItemPreviewPortal =
  | { kind: 'video-file'; src: string; mimeType?: string; poster?: string }
  | { kind: 'video-embed'; src: string; title: string }
  | { kind: 'pdf-file'; src: string }
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'audio'; src: string; mimeType?: string }
  | { kind: 'card'; title?: string; description?: string; thumbnailUrl?: string; provider?: string; authorName?: string }
  | { kind: 'external'; label: string; thumbnailUrl?: string; alt: string; openUrl?: string }
  | { kind: 'placeholder'; label: string };

export function resolveItemPreviewPortal(item: KnowledgeItem): ItemPreviewPortal {
  const previewMetadata = item.previewMetadata;
  const sourceUrl = item.url || previewMetadata?.sourceUrl;
  const previewUrl = previewMetadata?.previewUrl || sourceUrl;
  const embedUrl = previewMetadata?.embedUrl;
  const title = previewMetadata?.title || item.title;
  const description = previewMetadata?.description || item.extractedText || item.content;
  const provider = previewMetadata?.provider || item.source;
  const authorName = previewMetadata?.authorName || item.author;
  const thumbnailUrl = item.imageUrl || previewMetadata?.thumbnailUrl;
  const fileMime = item.fileMime || previewMetadata?.mimeType;

  if (item.type === 'Videos') {
    if (item.fileUrl && (fileMime?.startsWith('video/') || isVideoFile(item.fileUrl))) {
      return {
        kind: 'video-file',
        src: item.fileUrl,
        mimeType: fileMime,
        poster: thumbnailUrl,
      };
    }

    if (embedUrl) {
      return {
        kind: 'video-embed',
        src: embedUrl,
        title: item.title || 'Video preview',
      };
    }

    if (previewUrl) {
      const inferred = inferPreviewFromUrl(previewUrl);
      if (inferred.embedUrl) {
        return {
          kind: 'video-embed',
          src: inferred.embedUrl,
          title: item.title || 'Video preview',
        };
      }

      if (inferred.previewUrl && isVideoFile(inferred.previewUrl)) {
        return {
          kind: 'video-file',
          src: inferred.previewUrl,
          mimeType: fileMime,
          poster: thumbnailUrl,
        };
      }

      if (thumbnailUrl) {
        return {
          kind: 'external',
          label: 'Open externally to play',
          thumbnailUrl,
          alt: item.title,
          openUrl: resolveItemOpenUrl(item),
        };
      }
    }

    return { kind: 'placeholder', label: 'Video preview unavailable' };
  }

  if (item.type === 'PDFs') {
    if (item.fileUrl) {
      return { kind: 'pdf-file', src: item.fileUrl };
    }

    if (previewUrl) {
      const inferred = inferPreviewFromUrl(previewUrl);
      if (inferred.mediaKind === 'pdf' && inferred.previewUrl) {
        return { kind: 'pdf-file', src: inferred.previewUrl };
      }
    }

    return {
      kind: 'card',
      title,
      description,
      thumbnailUrl,
      provider,
      authorName,
    };
  }

  if (item.type === 'Images') {
    if (item.fileUrl) {
      return { kind: 'image', src: item.fileUrl, alt: item.title };
    }

    if (previewUrl) {
      const inferred = inferPreviewFromUrl(previewUrl);
      if (inferred.mediaKind === 'image' && inferred.previewUrl) {
        return { kind: 'image', src: inferred.previewUrl, alt: item.title };
      }
    }

    if (thumbnailUrl) {
      return { kind: 'image', src: thumbnailUrl, alt: item.title };
    }

    return { kind: 'placeholder', label: 'Image preview unavailable' };
  }

  if (item.type === 'Voice Notes') {
    if (item.fileUrl) {
      return { kind: 'audio', src: item.fileUrl, mimeType: fileMime };
    }

    if (previewUrl) {
      const inferred = inferPreviewFromUrl(previewUrl);
      if (inferred.mediaKind === 'audio' && inferred.previewUrl) {
        return { kind: 'audio', src: inferred.previewUrl, mimeType: fileMime };
      }
    }

    return {
      kind: 'card',
      title,
      description,
      thumbnailUrl,
      provider,
      authorName,
    };
  }

  if (item.type === 'Articles' || item.type === 'Social Links') {
    if (thumbnailUrl || title || description) {
      return {
        kind: 'card',
        title,
        description,
        thumbnailUrl,
        provider,
        authorName,
      };
    }

    if (sourceUrl) {
      return {
        kind: 'external',
        label: 'Open original source',
        thumbnailUrl,
        alt: item.title,
        openUrl: resolveItemOpenUrl(item),
      };
    }
  }

  return { kind: 'placeholder', label: 'Preview unavailable' };
}

export function resolveItemOpenUrl(item: KnowledgeItem): string | undefined {
  const previewMetadata = item.previewMetadata;

  if (item.type === 'Videos') {
    return (
      item.url ||
      previewMetadata?.sourceUrl ||
      previewMetadata?.canonicalUrl ||
      previewMetadata?.previewUrl ||
      previewMetadata?.embedUrl ||
      item.fileUrl
    );
  }

  if (item.type === 'Articles' || item.type === 'Social Links') {
    return item.url || previewMetadata?.sourceUrl || previewMetadata?.canonicalUrl || previewMetadata?.previewUrl;
  }

  if (item.type === 'PDFs' || item.type === 'Images' || item.type === 'Voice Notes') {
    return item.fileUrl || item.url || previewMetadata?.sourceUrl || previewMetadata?.previewUrl;
  }

  return item.url || previewMetadata?.sourceUrl || previewMetadata?.canonicalUrl || previewMetadata?.previewUrl || item.fileUrl;
}

function isVideoFile(url: string) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return ['.mp4', '.webm', '.ogg', '.mov', '.m4v'].some((extension) => pathname.endsWith(extension));
  } catch {
    return false;
  }
}
