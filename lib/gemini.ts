import { GoogleGenAI, Type } from '@google/genai';
import { KnowledgeItem, Flashcard } from './db';

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_SOURCE_TEXT_LENGTH = 12000;
const MODEL_RETRY_DELAY_MS = 750;

type UploadedFileData = {
  base64: string;
  mimeType: string;
  name?: string;
  size?: number;
};

function getGeminiApiKey() {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();

  if (!apiKey) {
    return null;
  }

  const normalized = apiKey.toUpperCase();
  if (
    normalized === 'MY_GEMINI_API_KEY' ||
    normalized === 'YOUR_GEMINI_API_KEY' ||
    normalized === 'MY_GOOGLE_API_KEY' ||
    normalized === 'YOUR_GOOGLE_API_KEY' ||
    normalized.includes('PLACEHOLDER')
  ) {
    return null;
  }

  return apiKey;
}

function getGeminiCandidateModels() {
  const configuredModel = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;

  return Array.from(new Set([configuredModel, DEFAULT_GEMINI_MODEL]));
}

// Ensure standard initialization pattern from gemini-api skill
const getAiClient = () => {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return null;
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

export async function summarizeAndExtract(
  content: string,
  sourceUrl?: string,
  customType?: 'Videos' | 'Articles' | 'PDFs' | 'Social Links' | 'Voice Notes',
  fileData?: UploadedFileData
): Promise<{
  title: string;
  summary: string;
  keyPoints: string[];
  type: 'Videos' | 'Articles' | 'PDFs' | 'Social Links' | 'Voice Notes';
  tags: string[];
  readTime: string;
  source: string;
  author?: string;
  flashcards: Omit<Flashcard, 'id'>[];
}> {
  const ai = getAiClient();
  const urlContext = sourceUrl ? await fetchUrlContext(sourceUrl) : '';
  const normalizedContent = normalizeSourceText(content);
  const fileContext = fileData
    ? `Uploaded file metadata:
- mimeType: ${fileData.mimeType}
- fileName: ${fileData.name || 'unknown'}
- attachmentKind: ${classifyAttachment(fileData.mimeType)}

If the uploaded asset contains readable text or speech, extract and use it. If some parts are not accessible, explicitly acknowledge the limitation and avoid inventing missing details.`
    : '';
  const prompt = `Analyze the following saved content or URL as accurately as possible.
Extract/generate:
1. A concise factual title grounded in the source.
2. A precise executive summary in 2-3 sentences using only evidence from the source.
3. 3-5 key points as short bullet-style statements.
4. Classify it into one of these types: "Videos", "Articles", "PDFs", "Social Links", "Voice Notes".
5. A list of 2-4 relevant high-level category tags.
6. An estimated read time (or watch/listen time when appropriate).
7. The source network or publication domain.
8. User handle or author if present.
9. 3 strong learning flashcards with factual answers.

Accuracy rules:
- Use only the evidence provided in the prompt or extracted from the uploaded asset.
- Do not invent facts, quotes, statistics, speaker names, or claims.
- If the available source is partial, reflect that uncertainty briefly in the summary instead of guessing.

Direct user content:
${normalizedContent || 'No direct text content provided.'}

${sourceUrl ? `Original URL: ${sourceUrl}` : 'No source URL provided.'}

Fetched URL context:
${urlContext || 'No URL context could be retrieved.'}

${fileContext}`;

  if (!ai) {
    return buildFallbackSummary(content, sourceUrl, customType);
  }

  const modelContents = fileData?.base64
    ? [
        { text: prompt },
        {
          inlineData: {
            data: fileData.base64,
            mimeType: fileData.mimeType,
          },
        },
      ]
    : prompt;

  try {
    const response = await generateContentWithRetry(ai, {
      contents: modelContents,
      config: {
        systemInstruction:
          'You are AetherVault AI. Produce grounded, source-faithful knowledge summaries. Prefer precision over polish. Never fabricate missing facts.',
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: ['title', 'summary', 'keyPoints', 'type', 'tags', 'readTime', 'source', 'flashcards'],
          properties: {
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            keyPoints: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            type: {
              type: Type.STRING,
              enum: ['Videos', 'Articles', 'PDFs', 'Social Links', 'Voice Notes']
            },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            readTime: { type: Type.STRING },
            source: { type: Type.STRING },
            author: { type: Type.STRING },
            flashcards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['type', 'question', 'answer'],
                properties: {
                  type: { type: Type.STRING, description: 'E.g., Concept, Principle, Formula, Terminology' },
                  question: { type: Type.STRING },
                  answer: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error('Empty response from model');
    }
    const data = JSON.parse(text.trim()) as {
      title?: string;
      summary?: string;
      keyPoints?: string[];
      type?: 'Videos' | 'Articles' | 'PDFs' | 'Social Links' | 'Voice Notes';
      tags?: string[];
      readTime?: string;
      source?: string;
      author?: string;
      flashcards?: Omit<Flashcard, 'id'>[];
    };
    if (customType) {
      data.type = customType;
    }
    return {
      title: data.title?.trim() || 'New Raw Save',
      summary: data.summary?.trim() || buildFallbackSummary(content, sourceUrl, customType).summary,
      keyPoints: normalizeKeyPoints(data.keyPoints),
      type: data.type || customType || 'Articles',
      tags: normalizeTags(data.tags),
      readTime: data.readTime?.trim() || '3 min read',
      source: data.source?.trim() || deriveSourceLabel(sourceUrl, fileData),
      author: data.author?.trim() || undefined,
      flashcards: normalizeFlashcards(data.flashcards, data.title?.trim() || 'New Raw Save', normalizedContent),
    };
  } catch (error) {
    logGeminiFallback('Gemini extraction failed, falling back to heuristic.', error);
    return buildFallbackSummary(content, sourceUrl, customType);
  }
}

export async function askSecondBrain(
  query: string,
  items: KnowledgeItem[],
  chatHistory: { role: 'user' | 'model'; content: string }[]
): Promise<{
  answer: string;
  summaryBlock?: string;
  referencedSources?: { title: string; source: string; type: string }[];
  tags?: string[];
}> {
  if (items.length === 0) {
    return buildEmptyVaultChatResponse();
  }

  const ai = getAiClient();
  if (!ai) {
    return buildFallbackChat(query, items);
  }

  // Format context items for prompt
  const itemsContext = items.map(item => {
    return `[ID: ${item.id}] [Title: ${item.title}] [Type: ${item.type}] [Source: ${item.source}] [Tags: ${item.tags.join(', ')}]
Content: ${item.content}
Summary: ${item.summary}
---`;
  }).join('\n\n');

  const historyContext = chatHistory.map(h => `${h.role === 'user' ? 'User' : 'AetherVault'}: ${h.content}`).join('\n');

  const prompt = `You are the chat interface of AetherVault, the user's AI Second Brain.
The user is asking a question about their saved knowledge items.
Answer their request objectively, conversationally, and accurately based ONLY on their saved digital mind.

Here is the current state of their saved mind (use this as your source of truth):
${itemsContext}

Here is the conversation history:
${historyContext}

Current User Question: "${query}"

Return a response in JSON containing:
1. "answer": A direct, friendly, conversational opening statement pointing them to their saved item (e.g., "You're thinking of 'BistroBot'—a link you saved from TechCrunch about AI-driven kitchen management."). Keep it warm and natural.
2. "summaryBlock": A detailed, structured synthesis/summary card content. This is a stand-alone block that outlines the core answers, metrics, key takeaways, and exact explanations. Provide rich, highly clear layout information here.
3. "referencedSources": An array of elements reflecting the exact documents from the saved mind that you used to compile this answer. Each element must contain "title" (the document title), "source" (the source publication e.g. "techcrunch.com"), and "type" ("article", "video", "tweet", "pdf" or "note" matching the icon types).
4. "tags": An array of up to 3 short key tags for this search result context (e.g. ["TechCrunch", "Oct 12, 2023", "Startup Idea"]).`;

  try {
    const response = await generateContentWithRetry(ai, {
      contents: prompt,
      config: {
        systemInstruction:
          'You are the cognitive heart of AetherVault. You find connections, answer questions on saved articles/videos/tweets/notes, and synthesize insights seamlessly. Always respond structured as JSON.',
        temperature: 0.3,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: ['answer', 'summaryBlock', 'referencedSources', 'tags'],
          properties: {
            answer: { type: Type.STRING },
            summaryBlock: { type: Type.STRING },
            referencedSources: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['title', 'source', 'type'],
                properties: {
                  title: { type: Type.STRING },
                  source: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ['article', 'video', 'tweet', 'pdf', 'note', 'chat'] }
                }
              }
            },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error('Empty response from model');
    }
    return JSON.parse(text.trim());
  } catch (error) {
    logGeminiFallback('Gemini chat lookup failed, falling back to keyword heuristic.', error);
    return buildFallbackChat(query, items);
  }
}

function classifyAttachment(mimeType?: string) {
  if (!mimeType) {
    return 'unknown';
  }

  if (mimeType === 'application/pdf') {
    return 'pdf-document';
  }

  if (mimeType.startsWith('audio/')) {
    return 'audio-recording';
  }

  if (mimeType.startsWith('image/')) {
    return 'image-screenshot';
  }

  if (mimeType.startsWith('video/')) {
    return 'video-file';
  }

  return 'file-upload';
}

function buildFallbackSummary(
  content: string,
  sourceUrl?: string,
  customType?: 'Videos' | 'Articles' | 'PDFs' | 'Social Links' | 'Voice Notes'
) {
  const mockTitle = content.split('\n')[0]?.substring(0, 60) || 'New Raw Save';
  let source = 'Personal Note';

  if (sourceUrl) {
    try {
      source = new URL(sourceUrl).hostname;
    } catch {
      source = sourceUrl;
    }
  }

  return {
    title: mockTitle,
    summary: `${content.substring(0, 180)}...`,
    keyPoints: [content.substring(0, 120) || 'Source content was limited, so this summary was generated from partial data.'],
    type: customType || 'Articles',
    tags: ['General'],
    readTime: '3 min read',
    source,
    flashcards: [
      {
        type: 'Concept',
        question: `What is the core takeaway of ${mockTitle}?`,
        answer: `${content.substring(0, 120)}...`,
      },
    ],
  };
}

function buildFallbackChat(query: string, items: KnowledgeItem[]) {
  if (items.length === 0) {
    return buildEmptyVaultChatResponse();
  }

  const qLower = query.toLowerCase();
  const matched =
    items.find(
      (item) =>
        item.title.toLowerCase().includes(qLower) ||
        item.content.toLowerCase().includes(qLower) ||
        item.summary.toLowerCase().includes(qLower)
    ) || items[0];

  return {
    answer: matched
      ? `I looked through your vault and found your saved content on **'${matched.title}'** from ${matched.source}.`
      : "I couldn't find a direct match in your vault for that, but here is what I can compile from your notes.",
    summaryBlock: matched
      ? matched.summary
      : 'You can save articles, YouTube links, PDFs, or notes to your Vault using the Quick Capture button, and I will summarize them for you.',
    referencedSources: matched
      ? [{ title: matched.title, source: matched.source.toLowerCase(), type: matched.type.toLowerCase().slice(0, -1) }]
      : [],
    tags: matched ? [matched.source, 'Saved', matched.type] : ['System', 'Help'],
  };
}

function buildEmptyVaultChatResponse() {
  return {
    answer: "I couldn't find any ready items in your vault yet.",
    summaryBlock:
      'Save or finish processing an article, video, PDF, social link, or voice note first, then ask again for a grounded answer.',
    referencedSources: [],
    tags: ['No Results', 'Empty Vault'],
  };
}

function logGeminiFallback(message: string, error: unknown) {
  if (isInvalidApiKeyError(error)) {
    console.warn('Gemini API key is missing or invalid. Using heuristic fallback instead.');
    return;
  }

  if (isModelAccessError(error)) {
    console.warn(
      `Configured Gemini model could not be used with the current API key or quota. Using heuristic fallback instead.`
    );
    return;
  }

  if (isRetryableGeminiError(error)) {
    console.warn('Gemini service is temporarily unavailable. Using heuristic fallback instead.');
    return;
  }

  console.warn(message, error);
}

function isInvalidApiKeyError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { message?: string };
  return candidate.message?.includes('API key not valid') ?? false;
}

function isRetryableGeminiError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { message?: string; status?: number };
  const message = candidate.message?.toLowerCase() || '';

  return (candidate.status === 429 && !isModelAccessError(error))
    || [500, 502, 503, 504].includes(candidate.status ?? 0)
    || message.includes('currently experiencing high demand')
    || message.includes('"status":"unavailable"')
    || message.includes('temporarily unavailable')
    || message.includes('resource exhausted')
    || message.includes('overloaded');
}

function isModelAccessError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { message?: string; status?: number };
  const message = candidate.message?.toLowerCase() || '';

  return message.includes('quota exceeded')
    || message.includes('limit: 0')
    || message.includes('model not found')
    || message.includes('is not found for api version')
    || message.includes('does not have access to the model')
    || message.includes('permission denied');
}

async function generateContentWithRetry(
  ai: GoogleGenAI,
  request: {
    contents: string | Array<{ text?: string; inlineData?: { data: string; mimeType: string } }>;
    config: {
      systemInstruction: string;
      temperature: number;
      responseMimeType: 'application/json';
      responseSchema: unknown;
    };
  }
) {
  let lastError: unknown;
  const candidateModels = getGeminiCandidateModels();

  for (const model of candidateModels) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await ai.models.generateContent({
          model,
          ...request,
        });
      } catch (error) {
        lastError = error;

        if (isInvalidApiKeyError(error)) {
          throw error;
        }

        if (isModelAccessError(error)) {
          break;
        }

        if (!isRetryableGeminiError(error)) {
          throw error;
        }

        if (attempt === 0) {
          await sleep(MODEL_RETRY_DELAY_MS);
        }
      }
    }
  }

  throw lastError;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchUrlContext(url: string) {
  try {
    if (isYouTubeUrl(url)) {
      const youtubeContext = await fetchYouTubeContext(url);
      if (youtubeContext) {
        return youtubeContext;
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 AetherVaultBot/1.0',
      },
      cache: 'no-store',
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return '';
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return '';
    }

    const html = await response.text();
    const title = extractHtmlTag(html, 'title');
    const description = extractMetaContent(html, 'name', 'description') || extractMetaContent(html, 'property', 'og:description');
    const articleText = stripHtml(html).slice(0, MAX_SOURCE_TEXT_LENGTH);

    return [`Page title: ${title || 'unknown'}`, description ? `Page description: ${description}` : '', articleText ? `Visible page text:\n${articleText}` : '']
      .filter(Boolean)
      .join('\n\n');
  } catch {
    return '';
  }
}

async function fetchYouTubeContext(url: string) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetch(oembedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 AetherVaultBot/1.0',
      },
      cache: 'no-store',
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return '';
    }

    const data = (await response.json()) as {
      title?: string;
      author_name?: string;
      provider_name?: string;
    };

    return [
      data.title ? `Video title: ${normalizeSourceText(data.title)}` : '',
      data.author_name ? `Channel: ${normalizeSourceText(data.author_name)}` : '',
      data.provider_name ? `Platform: ${normalizeSourceText(data.provider_name)}` : '',
      `Original video URL: ${url}`,
    ]
      .filter(Boolean)
      .join('\n');
  } catch {
    return '';
  }
}

function isYouTubeUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.includes('youtube.com') || hostname.includes('youtu.be');
  } catch {
    return false;
  }
}

function extractHtmlTag(html: string, tagName: string) {
  const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  return normalizeSourceText(match?.[1] || '');
}

function extractMetaContent(html: string, attrName: 'name' | 'property', attrValue: string) {
  const escaped = attrValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`<meta[^>]*${attrName}=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i');
  return normalizeSourceText(html.match(regex)?.[1] || '');
}

function stripHtml(html: string) {
  return normalizeSourceText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
  );
}

function normalizeSourceText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function deriveSourceLabel(sourceUrl?: string, fileData?: UploadedFileData) {
  if (fileData?.name) {
    return fileData.name;
  }

  if (!sourceUrl) {
    return 'Personal Note';
  }

  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return sourceUrl;
  }
}

function normalizeKeyPoints(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) {
    return ['General'];
  }

  const tags = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .slice(0, 4);

  return tags.length > 0 ? tags : ['General'];
}

function normalizeFlashcards(value: unknown, title: string, content: string) {
  if (!Array.isArray(value)) {
    return [
      {
        type: 'Concept',
        question: `What is the main idea of ${title}?`,
        answer: `${content.substring(0, 120)}...`,
      },
    ];
  }

  const cards = value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const card = entry as { type?: string; question?: string; answer?: string };
      if (!card.question?.trim() || !card.answer?.trim()) {
        return null;
      }

      return {
        type: card.type?.trim() || 'Concept',
        question: card.question.trim(),
        answer: card.answer.trim(),
      };
    })
    .filter((entry): entry is Omit<Flashcard, 'id'> => entry !== null)
    .slice(0, 3);

  return cards.length > 0
    ? cards
    : [
        {
          type: 'Concept',
          question: `What is the main idea of ${title}?`,
          answer: `${content.substring(0, 120)}...`,
        },
      ];
}
