import { type SupabaseClient } from '@supabase/supabase-js';
import { generateKnowledgeItemAnalysis } from '@/lib/ai/service';
import { type KnowledgeItem } from '@/lib/db';
import { VAULT_BUCKET } from '@/lib/supabase/vault';
import { normalizeVaultMimeType, validateVaultUpload } from '@/lib/vault/uploads';
import { extractRemoteSourceData, inferPreviewFromFile } from '@/lib/vault/extraction';
import {
  buildPreviewMetadata,
  deriveSourceLabel,
  getFailureSummary,
  getFileExtension,
  getInitialItemTitle,
  getStoredItemContent,
  inferCaptureKind,
  inferItemType,
  type ItemPreviewMetadata,
  type SupportedItemCaptureKind,
} from '@/lib/vault/items';

export type UploadedFileData = {
  base64: string;
  mimeType: string;
  name?: string;
  size?: number;
};

type ItemDraftInput = {
  url?: string;
  content?: string;
  requestedType?: KnowledgeItem['type'];
  fileData?: UploadedFileData;
};

type KnowledgeItemRow = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  summary: string;
  extracted_text: string | null;
  item_type: KnowledgeItem['type'];
  capture_kind: SupportedItemCaptureKind | null;
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

type PreparedDraft = {
  captureKind: SupportedItemCaptureKind;
  itemType: KnowledgeItem['type'];
  url?: string;
  content?: string;
  previewMetadata: ItemPreviewMetadata;
  initialTitle: string;
  initialSource: string;
  storedContent: string;
  extractedText?: string;
  initialImageUrl: string;
};

type RemotePreviewData = {
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

const GENERATED_FLASHCARD_LIMIT = 3;

export async function createAndProcessItem(
  supabase: SupabaseClient,
  userId: string,
  input: ItemDraftInput
) {
  validateVaultUpload(input.fileData);
  const draft = await prepareItemDraft(input);
  const insertedRow = await insertPendingItem(supabase, userId, draft, input.fileData);

  try {
    const filePath = await uploadSourceAsset(supabase, userId, insertedRow.id, input.fileData, draft.previewMetadata);

    return await processItem(supabase, userId, insertedRow, {
      fileData: input.fileData,
      filePath,
      overrideContent: draft.extractedText,
      previewMetadata: draft.previewMetadata,
      initialSource: draft.initialSource,
      initialImageUrl: draft.initialImageUrl,
    });
  } catch (error) {
    return markItemFailed(supabase, userId, insertedRow, {
      fileData: input.fileData,
      previewMetadata: draft.previewMetadata,
      initialSource: draft.initialSource,
      initialImageUrl: draft.initialImageUrl,
      error,
    });
  }
}

export async function createPendingItem(
  supabase: SupabaseClient,
  userId: string,
  input: ItemDraftInput
) {
  validateVaultUpload(input.fileData);
  const draft = await prepareItemDraft(input);
  const insertedRow = await insertPendingItem(supabase, userId, draft, input.fileData);

  try {
    const filePath = await uploadSourceAsset(supabase, userId, insertedRow.id, input.fileData, draft.previewMetadata);

    if (!filePath) {
      return insertedRow;
    }

    const { data: updatedRow, error } = await supabase
      .from('knowledge_items')
      .update({
        file_path: filePath,
        file_mime: input.fileData?.mimeType ?? insertedRow.file_mime ?? null,
        file_name: input.fileData?.name ?? insertedRow.file_name ?? null,
      })
      .eq('id', insertedRow.id)
      .eq('user_id', userId)
      .select('*')
      .single<KnowledgeItemRow>();

    if (error || !updatedRow) {
      throw error ?? new Error('Failed to attach uploaded file to item.');
    }

    return updatedRow;
  } catch (error) {
    return markItemFailed(supabase, userId, insertedRow, {
      fileData: input.fileData,
      previewMetadata: draft.previewMetadata,
      initialSource: draft.initialSource,
      initialImageUrl: draft.initialImageUrl,
      error,
    });
  }
}

export async function retryItemProcessing(
  supabase: SupabaseClient,
  userId: string,
  itemId: string
) {
  const { data: existingItem, error } = await supabase
    .from('knowledge_items')
    .select('*')
    .eq('id', itemId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single<KnowledgeItemRow>();

  if (error || !existingItem) {
    throw error ?? new Error('Item not found.');
  }

  const previewMetadata = normalizePreviewMetadata(existingItem.preview_metadata, existingItem);
  const fileData = existingItem.file_path
    ? await readStoredFileData(supabase, existingItem.file_path, existingItem.file_mime, existingItem.file_name)
    : undefined;

  const { data: pendingItem, error: pendingError } = await supabase
    .from('knowledge_items')
    .update({
      processing_status: 'pending',
      failure_reason: null,
      summary: 'Reprocessing this capture now...',
    })
    .eq('id', itemId)
    .eq('user_id', userId)
    .select('*')
    .single<KnowledgeItemRow>();

  if (pendingError || !pendingItem) {
    throw pendingError ?? new Error('Failed to update item for reprocessing.');
  }

  return processItem(supabase, userId, pendingItem, {
    fileData,
    filePath: pendingItem.file_path ?? undefined,
    overrideContent: pendingItem.extracted_text ?? undefined,
    previewMetadata,
    initialSource: pendingItem.source,
    initialImageUrl: pendingItem.image_url ?? getDefaultPreviewImage(pendingItem.item_type),
  });
}

export async function processPendingItem(
  supabase: SupabaseClient,
  userId: string,
  itemId: string
) {
  const { data: existingItem, error } = await supabase
    .from('knowledge_items')
    .select('*')
    .eq('id', itemId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .single<KnowledgeItemRow>();

  if (error || !existingItem) {
    throw error ?? new Error('Item not found.');
  }

  const previewMetadata = normalizePreviewMetadata(existingItem.preview_metadata, existingItem);
  const fileData = existingItem.file_path
    ? await readStoredFileData(supabase, existingItem.file_path, existingItem.file_mime, existingItem.file_name)
    : undefined;

  return processItem(supabase, userId, existingItem, {
    fileData,
    filePath: existingItem.file_path ?? undefined,
    overrideContent: existingItem.extracted_text ?? undefined,
    previewMetadata,
    initialSource: existingItem.source,
    initialImageUrl: existingItem.image_url ?? getDefaultPreviewImage(existingItem.item_type),
  });
}

async function prepareItemDraft(input: ItemDraftInput): Promise<PreparedDraft> {
  const url = input.url?.trim() || undefined;
  const content = input.content?.trim() || undefined;
  const itemType = inferItemType(input.requestedType, input.fileData, url);
  const captureKind = inferCaptureKind({
    fileData: input.fileData,
    url,
  });
  const remotePreview = url ? await extractRemoteSourceData(url, itemType) : null;
  const initialSource = deriveSourceLabel(url, input.fileData?.name);
  const previewMetadata = buildPreviewMetadata({
    url,
    fileData: input.fileData,
    thumbnailUrl: getYouTubeThumbnail(url || '') || remotePreview?.thumbnailUrl,
    faviconUrl: getPreviewFavicon(url || '', captureKind),
    title: remotePreview?.title,
    description: remotePreview?.description,
    authorName: remotePreview?.authorName,
    provider: remotePreview?.provider,
  });
  previewMetadata.previewUrl = remotePreview?.previewUrl || url;
  previewMetadata.embedUrl = remotePreview?.embedUrl;
  previewMetadata.canonicalUrl = remotePreview?.canonicalUrl || url;
  previewMetadata.mediaKind = remotePreview?.mediaKind || inferPreviewFromFile(input.fileData);
  const initialTitle = remotePreview?.title?.trim()
    || getInitialItemTitle({
      content,
      url,
      fileName: input.fileData?.name,
    });
  const storedContent = getStoredItemContent({
    content,
    url,
    fileName: input.fileData?.name,
    fileSize: input.fileData?.size,
  });

  return {
    captureKind,
    itemType,
    url,
    content,
    previewMetadata,
    initialTitle,
    initialSource,
    storedContent,
    extractedText: content?.trim() || remotePreview?.extractedText || buildRemotePreviewSeedText(remotePreview, url),
    initialImageUrl: itemType === 'Images'
      ? ''
      : previewMetadata.thumbnailUrl || getDefaultPreviewImage(itemType),
  };
}

function buildRemotePreviewSeedText(remotePreview: RemotePreviewData | null, url?: string) {
  if (!remotePreview && !url) {
    return undefined;
  }

  const seeded = [
    remotePreview?.title ? `Title: ${remotePreview.title}` : '',
    remotePreview?.description ? `Description: ${remotePreview.description}` : '',
    remotePreview?.authorName ? `Author: ${remotePreview.authorName}` : '',
    remotePreview?.provider ? `Provider: ${remotePreview.provider}` : '',
    remotePreview?.mediaKind ? `Media type: ${remotePreview.mediaKind}` : '',
    remotePreview?.canonicalUrl || url ? `Source URL: ${remotePreview?.canonicalUrl || url}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return seeded || undefined;
}

async function insertPendingItem(
  supabase: SupabaseClient,
  userId: string,
  draft: PreparedDraft,
  fileData?: UploadedFileData
) {
  const { data, error } = await supabase
    .from('knowledge_items')
    .insert({
      user_id: userId,
      title: draft.initialTitle,
      content: draft.storedContent,
      extracted_text: draft.extractedText ?? null,
      summary: 'Processing this capture now...',
      item_type: draft.itemType,
      capture_kind: draft.captureKind,
      processing_status: 'pending',
      failure_reason: null,
      tags: [],
      source: draft.initialSource,
      author: null,
      url: draft.url ?? null,
      preview_metadata: draft.previewMetadata,
      flashcards: [],
      image_url: draft.initialImageUrl || null,
      read_time: null,
      is_synthesized: false,
      bookmarked: false,
      file_path: null,
      file_mime: fileData?.mimeType ?? null,
      file_name: fileData?.name ?? null,
      deleted_at: null,
    })
    .select('*')
    .single<KnowledgeItemRow>();

  if (error || !data) {
    throw error ?? new Error('Failed to create item.');
  }

  return data;
}

async function uploadSourceAsset(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  fileData: UploadedFileData | undefined,
  previewMetadata: ItemPreviewMetadata
) {
  if (!fileData?.base64 || !fileData.mimeType) {
    return undefined;
  }

  const extension = getFileExtension(fileData.name, fileData.mimeType);
  const filePath = `${userId}/${itemId}.${extension}`;
  const fileBuffer = Buffer.from(fileData.base64, 'base64');

  const { error: uploadError } = await supabase.storage.from(VAULT_BUCKET).upload(filePath, fileBuffer, {
    contentType: fileData.mimeType,
    upsert: true,
  });

  if (uploadError) {
    throw uploadError;
  }

  const { error: fileRecordError } = await supabase.from('vault_files').upsert({
    user_id: userId,
    item_id: itemId,
    storage_path: filePath,
    mime_type: fileData.mimeType,
    file_name: fileData.name ?? null,
    byte_size: fileData.size ?? null,
    preview_metadata: previewMetadata,
    deleted_at: null,
  });

  if (fileRecordError) {
    throw fileRecordError;
  }

  return filePath;
}

async function processItem(
  supabase: SupabaseClient,
  userId: string,
  item: KnowledgeItemRow,
  options: {
    fileData?: UploadedFileData;
    filePath?: string;
    overrideContent?: string;
    previewMetadata: ItemPreviewMetadata;
    initialSource: string;
    initialImageUrl: string;
  }
) {
  try {
    const analysisText = getProcessingSourceText(item, options.overrideContent, options.fileData);
    const aiAnalysis = await generateKnowledgeItemAnalysis(
      analysisText,
      item.url ?? undefined,
      item.item_type,
      options.fileData
    );
    const summaryWithKeyPoints = [aiAnalysis.summary, ...aiAnalysis.keyPoints.map((point) => `- ${point}`)]
      .filter(Boolean)
      .join('\n');

    const { data: updatedRow, error: updateError } = await supabase
      .from('knowledge_items')
      .update({
        title: aiAnalysis.title,
        summary: summaryWithKeyPoints,
        item_type: aiAnalysis.type,
        capture_kind: item.capture_kind ?? options.previewMetadata.captureKind ?? inferCaptureKind({ url: item.url ?? undefined }),
        processing_status: 'ready',
        failure_reason: null,
        tags: aiAnalysis.tags,
        source: options.fileData?.name ?? (aiAnalysis.source || options.previewMetadata.provider || options.initialSource),
        author: aiAnalysis.author ?? options.previewMetadata.authorName ?? null,
        preview_metadata: options.previewMetadata,
        flashcards: aiAnalysis.flashcards.slice(0, GENERATED_FLASHCARD_LIMIT).map((card, index) => ({
          ...card,
          id: `fc-gen-${index}-${Date.now()}`,
        })),
        image_url: options.previewMetadata.thumbnailUrl || options.initialImageUrl || null,
        read_time: aiAnalysis.readTime,
        is_synthesized: true,
        file_path: options.filePath ?? item.file_path ?? null,
        file_mime: options.fileData?.mimeType ?? item.file_mime ?? null,
        file_name: options.fileData?.name ?? item.file_name ?? null,
        deleted_at: null,
      })
      .eq('id', item.id)
      .eq('user_id', userId)
      .select('*')
      .single<KnowledgeItemRow>();

    if (updateError || !updatedRow) {
      throw updateError ?? new Error('Failed to finalize item.');
    }

    return updatedRow;
  } catch (error) {
    return markItemFailed(supabase, userId, item, {
      fileData: options.fileData,
      filePath: options.filePath,
      previewMetadata: options.previewMetadata,
      initialSource: options.initialSource,
      initialImageUrl: options.initialImageUrl,
      error,
    });
  }
}

async function markItemFailed(
  supabase: SupabaseClient,
  userId: string,
  item: KnowledgeItemRow,
  options: {
    fileData?: UploadedFileData;
    filePath?: string;
    previewMetadata: ItemPreviewMetadata;
    initialSource: string;
    initialImageUrl: string;
    error: unknown;
  }
) {
  const { data: failedRow, error: failedUpdateError } = await supabase
    .from('knowledge_items')
    .update({
      processing_status: 'failed',
      failure_reason: getFailureReason(options.error),
      summary: getFailureSummary(item.item_type),
      preview_metadata: options.previewMetadata,
      source: options.initialSource,
      image_url: options.initialImageUrl || null,
      file_path: options.filePath ?? item.file_path ?? null,
      file_mime: options.fileData?.mimeType ?? item.file_mime ?? null,
      file_name: options.fileData?.name ?? item.file_name ?? null,
      deleted_at: null,
    })
    .eq('id', item.id)
    .eq('user_id', userId)
    .select('*')
    .single<KnowledgeItemRow>();

  if (failedUpdateError || !failedRow) {
    throw options.error;
  }

  return failedRow;
}

function getProcessingSourceText(
  item: KnowledgeItemRow,
  overrideContent?: string,
  fileData?: UploadedFileData
) {
  if (overrideContent?.trim()) {
    return overrideContent.trim();
  }

  if (item.extracted_text?.trim()) {
    return item.extracted_text.trim();
  }

  if (fileData?.name) {
    return `Uploaded file: ${fileData.name}`;
  }

  if (item.url) {
    return item.url;
  }

  return item.content;
}

async function readStoredFileData(
  supabase: SupabaseClient,
  filePath: string,
  fileMime: string | null,
  fileName: string | null
): Promise<UploadedFileData> {
  const { data, error } = await supabase.storage.from(VAULT_BUCKET).download(filePath);

  if (error || !data) {
    throw error ?? new Error('Failed to read stored file.');
  }

  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return {
    base64: buffer.toString('base64'),
    mimeType: fileMime || data.type || 'application/octet-stream',
    name: fileName ?? undefined,
    size: buffer.byteLength,
  };
}

function normalizePreviewMetadata(value: unknown, item: KnowledgeItemRow): ItemPreviewMetadata {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as ItemPreviewMetadata;
  }

  return buildPreviewMetadata({
    url: item.url ?? undefined,
    fileData: item.file_mime
      ? {
          mimeType: normalizeVaultMimeType(item.file_mime),
          name: item.file_name ?? undefined,
        }
      : undefined,
    thumbnailUrl: getYouTubeThumbnail(item.url || ''),
    faviconUrl: getPreviewFavicon(item.url || '', item.capture_kind ?? inferCaptureKind({ url: item.url ?? undefined })),
  });
}

function getDefaultPreviewImage(type: KnowledgeItem['type']) {
  const imagePlaceholders: Record<KnowledgeItem['type'], string> = {
    Articles: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800&auto=format&fit=crop&q=60',
    Videos: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=60',
    PDFs: 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?w=800&auto=format&fit=crop&q=60',
    'Social Links': 'https://images.unsplash.com/photo-1611605698335-8b15d27e03f2?w=800&auto=format&fit=crop&q=60',
    'Voice Notes': 'https://images.unsplash.com/photo-1484712401471-05c7215a39eb?w=800&auto=format&fit=crop&q=60',
    Images: 'https://images.unsplash.com/photo-1493612276216-ee3925520721?w=800&auto=format&fit=crop&q=60',
  };

  return imagePlaceholders[type] || imagePlaceholders.Articles;
}

function getFailureReason(error: unknown) {
  if (!error || typeof error !== 'object') {
    return 'Unknown processing error';
  }

  const candidate = error as { message?: string };
  return candidate.message?.trim() || 'Unknown processing error';
}

function getYouTubeThumbnail(url: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? `https://img.youtube.com/vi/${match[2]}/hqdefault.jpg` : null;
}

function getPreviewFavicon(urlInput: string, captureKind: SupportedItemCaptureKind): string | null {
  if (!urlInput || captureKind !== 'url') {
    return null;
  }

  try {
    const urlObj = new URL(urlInput);
    const domain = urlObj.hostname.replace('www.', '');
    return `https://www.google.com/s2/favicons?sz=128&domain=${domain}`;
  } catch {
    return null;
  }
}
