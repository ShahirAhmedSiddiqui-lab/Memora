import { type SupabaseClient } from '@supabase/supabase-js';
import {
  ChatMessage,
  ChatReferencedSource,
  ChatSession,
  Flashcard,
  ItemCaptureKind,
  ItemPreviewMetadata,
  KnowledgeItem,
  formatRelativeDate,
} from '@/lib/db';

export const VAULT_BUCKET = 'vault-files';

type JsonRecord = Record<string, unknown>;

type KnowledgeItemRow = {
  id: string;
  title: string;
  content: string;
  summary: string;
  extracted_text: string | null;
  item_type: KnowledgeItem['type'];
  capture_kind: ItemCaptureKind | null;
  processing_status: KnowledgeItem['processingStatus'];
  failure_reason: string | null;
  tags: string[] | null;
  source: string;
  author: string | null;
  url: string | null;
  preview_metadata: unknown;
  flashcards: unknown;
  image_url: string | null;
  read_time: string | null;
  is_synthesized: boolean;
  bookmarked: boolean;
  file_path: string | null;
  file_mime: string | null;
  file_name: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type ChatMessageRow = {
  id: string;
  session_id: string | null;
  role: ChatMessage['role'];
  content: string;
  summary_block: string | null;
  referenced_sources: unknown;
  tags: string[] | null;
  created_at: string;
};

type ChatSessionRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
};

function normalizeFlashcards(value: unknown): Flashcard[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index) => {
      const card = (entry ?? {}) as JsonRecord;
      const question = typeof card.question === 'string' ? card.question : '';
      const answer = typeof card.answer === 'string' ? card.answer : '';

      if (!question || !answer) {
        return null;
      }

      return {
        id: typeof card.id === 'string' ? card.id : `flashcard-${index}`,
        type: typeof card.type === 'string' ? card.type : 'Concept',
        question,
        answer,
      };
    })
    .filter((entry): entry is Flashcard => entry !== null);
}

function normalizeReferencedSources(value: unknown): ChatReferencedSource[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const source = (entry ?? {}) as JsonRecord;
      const title = typeof source.title === 'string' ? source.title : '';
      const origin = typeof source.source === 'string' ? source.source : '';
      const type = typeof source.type === 'string' ? source.type : 'note';
      const itemId = typeof source.itemId === 'string' ? source.itemId : undefined;

      if (!title || !origin) {
        return null;
      }

      return itemId
        ? { itemId, title, source: origin, type }
        : { title, source: origin, type };
    })
    .filter((entry): entry is ChatReferencedSource => entry !== null);
}

function normalizePreviewMetadata(value: unknown): ItemPreviewMetadata | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const metadata = value as JsonRecord;
  const previewMetadata: ItemPreviewMetadata = {};

  if (typeof metadata.thumbnailUrl === 'string') {
    previewMetadata.thumbnailUrl = metadata.thumbnailUrl;
  }

  if (typeof metadata.faviconUrl === 'string') {
    previewMetadata.faviconUrl = metadata.faviconUrl;
  }

  if (typeof metadata.provider === 'string') {
    previewMetadata.provider = metadata.provider;
  }

  if (typeof metadata.sourceUrl === 'string') {
    previewMetadata.sourceUrl = metadata.sourceUrl;
  }

  if (typeof metadata.previewUrl === 'string') {
    previewMetadata.previewUrl = metadata.previewUrl;
  }

  if (typeof metadata.embedUrl === 'string') {
    previewMetadata.embedUrl = metadata.embedUrl;
  }

  if (typeof metadata.canonicalUrl === 'string') {
    previewMetadata.canonicalUrl = metadata.canonicalUrl;
  }

  if (typeof metadata.title === 'string') {
    previewMetadata.title = metadata.title;
  }

  if (typeof metadata.description === 'string') {
    previewMetadata.description = metadata.description;
  }

  if (typeof metadata.authorName === 'string') {
    previewMetadata.authorName = metadata.authorName;
  }

  if (typeof metadata.fileName === 'string') {
    previewMetadata.fileName = metadata.fileName;
  }

  if (typeof metadata.mimeType === 'string') {
    previewMetadata.mimeType = metadata.mimeType;
  }

  if (typeof metadata.byteSize === 'number') {
    previewMetadata.byteSize = metadata.byteSize;
  }

  if (typeof metadata.mediaKind === 'string') {
    previewMetadata.mediaKind = metadata.mediaKind as ItemPreviewMetadata['mediaKind'];
  }

  if (typeof metadata.captureKind === 'string') {
    previewMetadata.captureKind = metadata.captureKind as ItemCaptureKind;
  }

  return Object.keys(previewMetadata).length > 0 ? previewMetadata : undefined;
}

export function mapKnowledgeItem(row: KnowledgeItemRow, fileUrl?: string): KnowledgeItem {
  const previewMetadata = normalizePreviewMetadata(row.preview_metadata);
  const resolvedImageUrl =
    row.item_type === 'Images' && fileUrl
      ? fileUrl
      : row.image_url ?? previewMetadata?.thumbnailUrl ?? undefined;
  const processingStatus = row.deleted_at ? 'trashed' : row.processing_status;

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    extractedText: row.extracted_text ?? undefined,
    summary: row.summary,
    type: row.item_type,
    captureKind: row.capture_kind ?? undefined,
    processingStatus,
    failureReason: row.failure_reason ?? undefined,
    tags: row.tags ?? [],
    createdAt: formatRelativeDate(row.created_at),
    createdAtDate: row.created_at,
    updatedAtDate: row.updated_at,
    deletedAt: row.deleted_at ?? undefined,
    source: row.source,
    author: row.author ?? undefined,
    url: row.url ?? undefined,
    previewMetadata,
    flashcards: normalizeFlashcards(row.flashcards),
    imageUrl: resolvedImageUrl,
    readTime: row.read_time ?? undefined,
    isSynthesized: row.is_synthesized,
    bookmarked: row.bookmarked,
    filePath: row.file_path ?? undefined,
    fileMime: row.file_mime ?? undefined,
    fileName: row.file_name ?? undefined,
    fileUrl,
  };
}

export function mapChatMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    sessionId: row.session_id ?? undefined,
    role: row.role,
    content: row.content,
    summaryBlock: row.summary_block ?? undefined,
    referencedSources: normalizeReferencedSources(row.referenced_sources),
    tags: row.tags ?? [],
    createdAt: formatRelativeDate(row.created_at),
  };
}

export function mapChatSession(row: ChatSessionRow): ChatSession {
  return {
    id: row.id,
    title: row.title,
    createdAt: formatRelativeDate(row.created_at),
    updatedAt: formatRelativeDate(row.updated_at),
    lastMessageAt: row.last_message_at ? formatRelativeDate(row.last_message_at) : undefined,
  };
}

export async function attachSignedUrls(
  supabase: SupabaseClient,
  rows: KnowledgeItemRow[]
): Promise<KnowledgeItem[]> {
  return Promise.all(
    rows.map(async (row) => {
      if (!row.file_path) {
        return mapKnowledgeItem(row);
      }

      const { data } = await supabase.storage
        .from(VAULT_BUCKET)
        .createSignedUrl(row.file_path, 60 * 60);

      return mapKnowledgeItem(row, data?.signedUrl);
    })
  );
}

export function matchesSearch(item: KnowledgeItem, query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  return (
    item.title.toLowerCase().includes(normalized) ||
    item.content.toLowerCase().includes(normalized) ||
    (item.extractedText?.toLowerCase().includes(normalized) ?? false) ||
    item.summary.toLowerCase().includes(normalized) ||
    item.source.toLowerCase().includes(normalized) ||
    item.tags.some((tag) => tag.toLowerCase().includes(normalized))
  );
}
