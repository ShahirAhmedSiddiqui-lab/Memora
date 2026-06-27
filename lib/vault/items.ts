import { ItemCaptureKind, KnowledgeItem } from '@/lib/db';

export const ITEM_PROCESSING_STATUSES = ['pending', 'ready', 'failed', 'trashed'] as const;
export const ITEM_CAPTURE_KINDS = ['url', 'note', 'pdf', 'image', 'audio'] as const;

export type ItemProcessingStatus = (typeof ITEM_PROCESSING_STATUSES)[number];
export type SupportedItemCaptureKind = (typeof ITEM_CAPTURE_KINDS)[number];

export type ItemPreviewMetadata = {
  thumbnailUrl?: string;
  faviconUrl?: string;
  provider?: string;
  sourceUrl?: string;
  previewUrl?: string;
  embedUrl?: string;
  canonicalUrl?: string;
  title?: string;
  description?: string;
  authorName?: string;
  fileName?: string;
  mimeType?: string;
  byteSize?: number;
  mediaKind?: 'video' | 'pdf' | 'image' | 'audio' | 'article' | 'social' | 'unknown';
  captureKind?: ItemCaptureKind;
};

type UploadedFileData = {
  mimeType: string;
  name?: string;
  size?: number;
};

export function inferItemType(
  requestedType: KnowledgeItem['type'] | undefined,
  fileData?: UploadedFileData,
  url?: string
): KnowledgeItem['type'] {
  if (requestedType) {
    return requestedType;
  }

  if (fileData?.mimeType === 'application/pdf') {
    return 'PDFs';
  }

  if (fileData?.mimeType?.startsWith('image/')) {
    return 'Images';
  }

  if (fileData?.mimeType?.startsWith('audio/')) {
    return 'Voice Notes';
  }

  if (url && isYouTubeUrl(url)) {
    return 'Videos';
  }

  return 'Articles';
}

export function inferCaptureKind({
  fileData,
  url,
}: {
  fileData?: UploadedFileData;
  url?: string;
}): SupportedItemCaptureKind {
  if (fileData?.mimeType === 'application/pdf') {
    return 'pdf';
  }

  if (fileData?.mimeType?.startsWith('image/')) {
    return 'image';
  }

  if (fileData?.mimeType?.startsWith('audio/')) {
    return 'audio';
  }

  if (url?.trim()) {
    return 'url';
  }

  return 'note';
}

export function getInitialItemTitle({
  content,
  url,
  fileName,
}: {
  content?: string;
  url?: string;
  fileName?: string;
}) {
  if (fileName?.trim()) {
    return fileName.trim();
  }

  const normalizedContent = content?.trim();
  if (normalizedContent) {
    return normalizedContent.split('\n')[0].trim().slice(0, 80) || 'Untitled capture';
  }

  if (url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url.slice(0, 80);
    }
  }

  return 'Untitled capture';
}

export function deriveSourceLabel(url?: string, fileName?: string) {
  if (fileName?.trim()) {
    return fileName.trim();
  }

  if (!url) {
    return 'Personal Note';
  }

  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function buildPreviewMetadata({
  url,
  fileData,
  thumbnailUrl,
  faviconUrl,
  title,
  description,
  authorName,
  provider,
}: {
  url?: string;
  fileData?: UploadedFileData;
  thumbnailUrl?: string | null;
  faviconUrl?: string | null;
  title?: string | null;
  description?: string | null;
  authorName?: string | null;
  provider?: string | null;
}): ItemPreviewMetadata {
  const metadata: ItemPreviewMetadata = {};

  if (thumbnailUrl) {
    metadata.thumbnailUrl = thumbnailUrl;
  }

  if (faviconUrl) {
    metadata.faviconUrl = faviconUrl;
  }

  if (url) {
    metadata.sourceUrl = url;
    metadata.previewUrl = url;
  }

  if (title) {
    metadata.title = title;
  }

  if (description) {
    metadata.description = description;
  }

  if (authorName) {
    metadata.authorName = authorName;
  }

  if (fileData?.name) {
    metadata.fileName = fileData.name;
  }

  if (fileData?.mimeType) {
    metadata.mimeType = fileData.mimeType;
  }

  if (typeof fileData?.size === 'number') {
    metadata.byteSize = fileData.size;
  }

  metadata.captureKind = inferCaptureKind({ fileData, url });

  if (provider) {
    metadata.provider = provider;
  } else if (url && isYouTubeUrl(url)) {
    metadata.provider = 'youtube';
  }

  return metadata;
}

export function getStoredItemContent({
  content,
  url,
  fileName,
  fileSize,
}: {
  content?: string;
  url?: string;
  fileName?: string;
  fileSize?: number;
}) {
  if (content?.trim()) {
    return content.trim();
  }

  if (fileName) {
    const kbSize = typeof fileSize === 'number' ? ` (${(fileSize / 1024).toFixed(1)} KB)` : '';
    return `Uploaded file: ${fileName}${kbSize}`;
  }

  if (url) {
    return `Saved link or bookmark: ${url}`;
  }

  return 'Captured item';
}

export function getFailureSummary(type: KnowledgeItem['type']) {
  return `This ${type.toLowerCase()} capture could not be processed yet. You can keep it in your vault and retry processing later.`;
}

export function getFileExtension(fileName: string | undefined, mimeType: string | undefined) {
  const fromName = fileName?.split('.').pop()?.toLowerCase();
  if (fromName) {
    return fromName;
  }

  const lookup: Record<string, string> = {
    'application/pdf': 'pdf',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/webm': 'webm',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/ogg': 'ogg',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };

  return lookup[mimeType ?? ''] ?? 'bin';
}

export function getRestoredStatus(item: {
  failureReason?: string | null;
  summary?: string | null;
}): ItemProcessingStatus {
  if (item.failureReason) {
    return 'failed';
  }

  if (!item.summary || item.summary.toLowerCase().includes('could not be processed yet')) {
    return 'pending';
  }

  return 'ready';
}

function isYouTubeUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.includes('youtube.com') || hostname.includes('youtu.be');
  } catch {
    return false;
  }
}
