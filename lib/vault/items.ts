import { KnowledgeItem } from '@/lib/db';

export const ITEM_PROCESSING_STATUSES = ['pending', 'ready', 'failed', 'trashed'] as const;

export type ItemProcessingStatus = (typeof ITEM_PROCESSING_STATUSES)[number];

export type ItemPreviewMetadata = {
  thumbnailUrl?: string;
  faviconUrl?: string;
  provider?: string;
  sourceUrl?: string;
  fileName?: string;
  mimeType?: string;
  byteSize?: number;
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

  if (fileData?.mimeType?.startsWith('audio/')) {
    return 'Voice Notes';
  }

  if (url && isYouTubeUrl(url)) {
    return 'Videos';
  }

  return 'Articles';
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
}: {
  url?: string;
  fileData?: UploadedFileData;
  thumbnailUrl?: string | null;
  faviconUrl?: string | null;
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

  if (url && isYouTubeUrl(url)) {
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
