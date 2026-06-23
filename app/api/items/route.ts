import { NextRequest, NextResponse } from 'next/server';
import { summarizeAndExtract } from '@/lib/gemini';
import { KnowledgeItem } from '@/lib/db';
import { createClient } from '@/lib/supabase/server';
import { attachSignedUrls, mapKnowledgeItem, matchesSearch, VAULT_BUCKET } from '@/lib/supabase/vault';
import {
  buildPreviewMetadata,
  deriveSourceLabel,
  getFailureSummary,
  getInitialItemTitle,
  getStoredItemContent,
  inferItemType,
} from '@/lib/vault/items';

function getYouTubeThumbnail(url: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? `https://img.youtube.com/vi/${match[2]}/hqdefault.jpg` : null;
}

function getFaviconOrLogo(urlInput: string): string | null {
  try {
    if (!urlInput) return null;
    const urlObj = new URL(urlInput);
    const domain = urlObj.hostname.replace('www.', '');
    return `https://www.google.com/s2/favicons?sz=128&domain=${domain}`;
  } catch {
    return null;
  }
}

function getFileExtension(fileName: string | undefined, mimeType: string | undefined) {
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
  };

  return lookup[mimeType ?? ''] ?? 'bin';
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const status = searchParams.get('status');
    const search = searchParams.get('q')?.trim();
    const includeTrashed = searchParams.get('include_trashed') === 'true';

    let query = supabase
      .from('knowledge_items')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (type && type !== 'All Knowledge') {
      query = query.eq('item_type', type);
    }

    if (status) {
      query = query.eq('processing_status', status);
    } else if (!includeTrashed) {
      query = query.is('deleted_at', null);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    let items = await attachSignedUrls(supabase, data ?? []);

    if (search) {
      items = items.filter((item) => matchesSearch(item, search));
    }

    return NextResponse.json(items);
  } catch (error) {
    console.error('Failed to fetch items:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { url, content, type: requestedType, fileData } = await req.json();

    if (!content && !url && !fileData) {
      return NextResponse.json({ error: 'Content, URL or File is required' }, { status: 400 });
    }

    const itemType = inferItemType(requestedType, fileData, url);
    const ytThumb = getYouTubeThumbnail(url || '');
    const brandLogo = !ytThumb && url ? getFaviconOrLogo(url) : null;
    const previewMetadata = buildPreviewMetadata({
      url,
      fileData,
      thumbnailUrl: ytThumb,
      faviconUrl: brandLogo,
    });
    const initialImageUrl = ytThumb || brandLogo || getDefaultPreviewImage(itemType);
    const storedContent = getStoredItemContent({
      content,
      url,
      fileName: fileData?.name,
      fileSize: fileData?.size,
    });
    const extractedText = content?.trim() || undefined;
    const initialTitle = getInitialItemTitle({
      content,
      url,
      fileName: fileData?.name,
    });
    const initialSource = deriveSourceLabel(url, fileData?.name);

    const { data: insertedRow, error: insertError } = await supabase
      .from('knowledge_items')
      .insert({
        user_id: user.id,
        title: initialTitle,
        content: storedContent,
        extracted_text: extractedText ?? null,
        summary: 'Processing this capture now...',
        item_type: itemType,
        processing_status: 'pending',
        failure_reason: null,
        tags: [],
        source: initialSource,
        author: null,
        url: url || null,
        preview_metadata: previewMetadata,
        flashcards: [],
        image_url: initialImageUrl,
        read_time: null,
        is_synthesized: false,
        bookmarked: false,
        file_path: null,
        file_mime: fileData?.mimeType ?? null,
        file_name: fileData?.name ?? null,
        deleted_at: null,
      })
      .select('*')
      .single();

    if (insertError || !insertedRow) {
      throw insertError ?? new Error('Failed to insert knowledge item.');
    }

    let workingRow = insertedRow;
    let filePath: string | undefined;

    try {
      if (fileData?.base64 && fileData?.mimeType) {
        const extension = getFileExtension(fileData.name, fileData.mimeType);
        filePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
        const fileBuffer = Buffer.from(fileData.base64, 'base64');

        const { error: uploadError } = await supabase.storage.from(VAULT_BUCKET).upload(filePath, fileBuffer, {
          contentType: fileData.mimeType,
          upsert: false,
        });

        if (uploadError) {
          throw uploadError;
        }

        const { error: fileRecordError } = await supabase.from('vault_files').upsert({
          user_id: user.id,
          item_id: insertedRow.id,
          storage_path: filePath,
          mime_type: fileData.mimeType,
          file_name: fileData.name ?? null,
          byte_size: fileData.size ?? null,
          preview_metadata: previewMetadata,
        });

        if (fileRecordError) {
          throw fileRecordError;
        }
      }

      const analysisText = content || (fileData ? `File upload: ${fileData.name}` : '') || url;
      const aiAnalysis = await summarizeAndExtract(analysisText, url, itemType, fileData);
      const summaryWithKeyPoints = [aiAnalysis.summary, ...aiAnalysis.keyPoints.map((point) => `- ${point}`)]
        .filter(Boolean)
        .join('\n');
      const finalImageUrl = initialImageUrl || getDefaultPreviewImage(aiAnalysis.type);

      const { data: updatedRow, error: updateError } = await supabase
        .from('knowledge_items')
        .update({
          title: aiAnalysis.title,
          summary: summaryWithKeyPoints,
          item_type: aiAnalysis.type,
          processing_status: 'ready',
          failure_reason: null,
          tags: aiAnalysis.tags,
          source: fileData ? fileData.name : aiAnalysis.source || initialSource,
          author: aiAnalysis.author ?? null,
          preview_metadata: previewMetadata,
          flashcards: aiAnalysis.flashcards.map((card, index) => ({
            ...card,
            id: `fc-gen-${index}-${Date.now()}`,
          })),
          image_url: finalImageUrl,
          read_time: aiAnalysis.readTime,
          is_synthesized: true,
          file_path: filePath ?? null,
          file_mime: fileData?.mimeType ?? null,
          file_name: fileData?.name ?? null,
          deleted_at: null,
        })
        .eq('id', insertedRow.id)
        .eq('user_id', user.id)
        .select('*')
        .single();

      if (updateError || !updatedRow) {
        throw updateError ?? new Error('Failed to finalize knowledge item.');
      }

      workingRow = updatedRow;
    } catch (processingError) {
      const { data: failedRow, error: failedUpdateError } = await supabase
        .from('knowledge_items')
        .update({
          processing_status: 'failed',
          failure_reason: getFailureReason(processingError),
          summary: getFailureSummary(itemType),
          source: initialSource,
          image_url: initialImageUrl,
          preview_metadata: previewMetadata,
          file_path: filePath ?? null,
          file_mime: fileData?.mimeType ?? null,
          file_name: fileData?.name ?? null,
          deleted_at: null,
        })
        .eq('id', insertedRow.id)
        .eq('user_id', user.id)
        .select('*')
        .single();

      if (failedUpdateError || !failedRow) {
        throw processingError;
      }

      workingRow = failedRow;
    }

    let signedUrl: string | undefined;
    if (workingRow.file_path) {
      const { data } = await supabase.storage.from(VAULT_BUCKET).createSignedUrl(workingRow.file_path, 60 * 60);
      signedUrl = data?.signedUrl;
    }

    return NextResponse.json(mapKnowledgeItem(workingRow, signedUrl), { status: 201 });
  } catch (error) {
    console.error('Failed to create item:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

function getDefaultPreviewImage(type: KnowledgeItem['type']) {
  const imagePlaceholders: Record<KnowledgeItem['type'], string> = {
    Articles: 'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800&auto=format&fit=crop&q=60',
    Videos: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=800&auto=format&fit=crop&q=60',
    PDFs: 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?w=800&auto=format&fit=crop&q=60',
    'Social Links': 'https://images.unsplash.com/photo-1611605698335-8b15d27e03f2?w=800&auto=format&fit=crop&q=60',
    'Voice Notes': 'https://images.unsplash.com/photo-1484712401471-05c7215a39eb?w=800&auto=format&fit=crop&q=60',
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
