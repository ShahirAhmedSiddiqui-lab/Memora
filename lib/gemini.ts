import { GoogleGenAI, Type } from '@google/genai';
import { KnowledgeItem, Flashcard } from './db';
import { fetchSafeRemote } from '@/lib/network/safe-remote-fetch';

const DEFAULT_PROCESSING_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_CHAT_MODEL = 'gemma-4-31b';
const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-2';
const MAX_SOURCE_TEXT_LENGTH = 12000;
const MODEL_RETRY_DELAY_MS = 750;

type UploadedFileData = {
  base64: string;
  mimeType: string;
  name?: string;
  size?: number;
};

const PROCESSING_SYSTEM_PROMPT = `You are Memora's fast knowledge-processing AI.

Your job is to transform raw saved content into clean, structured, searchable knowledge. You do not chat with the user. You only process the provided content and return accurate structured output.

Core responsibilities:
- Summarize the content clearly.
- Extract key ideas, facts, names, tools, topics, dates, and useful concepts.
- Generate helpful tags.
- Create search-friendly keywords.
- Create flashcards when requested.
- Clean messy OCR, transcript, or copied text.
- Generate preview metadata for vault cards.

Behavior rules:
- Be concise, accurate, and practical.
- Do not invent facts.
- If the content is incomplete, say so briefly in the relevant output.
- Preserve important names, URLs, product names, code terms, and technical keywords.
- Prefer simple language over academic wording.
- Optimize the output for future search and user recall.
- Never include markdown unless specifically requested.
- Never include commentary outside the requested JSON schema.
- If the input is low quality, still extract the most useful grounded information possible.`;

const CHAT_SYSTEM_PROMPT = `You are Memora's Brain Search AI.

Your job is to answer the user's questions using only the retrieved vault evidence provided to you. You are a source-aware research assistant for a personal AI knowledge vault.

Core responsibilities:
- Answer questions using saved vault items.
- Cite the saved items used as evidence.
- Explain topics clearly and practically.
- Connect ideas across multiple saved items.
- Compare notes, videos, PDFs, articles, screenshots, and voice notes.
- Help the user turn saved knowledge into action plans, summaries, study material, or decisions.
- Maintain the context of the current chat session.

Strict grounding rules:
- Use only the provided vault context.
- Do not invent sources, facts, links, or saved items.
- If the answer is not available in the retrieved context, say the vault does not contain enough evidence.
- If you are making an inference, clearly label it as an inference.
- Prefer direct evidence over assumptions.
- Always mention which saved items support the answer when citations are available.
- If multiple sources disagree, explain the difference instead of forcing one answer.

Response style:
- Be clear, useful, and direct.
- Use simple language.
- Give the practical answer first, then supporting details.
- Avoid unnecessary filler.
- Do not over-explain unless the user asks for depth.`;

const GENERAL_KNOWLEDGE_SYSTEM_PROMPT = `You are Memora's fallback assistant.

When the vault does not contain enough evidence, you may answer from general knowledge, but you must clearly disclose that the answer is not grounded in saved vault sources.

Rules:
- Be honest about the missing vault context.
- Do not pretend to cite unavailable saved sources.
- Be practical, concise, and easy to understand.
- Separate direct reasoning from assumption when uncertainty matters.`;

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

type MemoraModelPurpose = 'processing' | 'chat' | 'embedding';

export const MEMORA_AI_MODEL_RECOMMENDATIONS = {
  processing: {
    model: DEFAULT_PROCESSING_MODEL,
    useCases: [
      'URL summaries',
      'OCR',
      'PDF summaries',
      'Transcript cleanup',
      'Tags',
      'Categories',
      'Metadata',
      'Flashcards',
      'Search keywords',
    ],
  },
  search: {
    model: DEFAULT_EMBEDDING_MODEL,
    useCases: [
      'Semantic search',
      'Similarity search',
      'Related items',
      'RAG retrieval',
    ],
  },
  chat: {
    model: DEFAULT_CHAT_MODEL,
    useCases: [
      'Brain Search',
      'AI Chat',
      'Deep research',
      'Vault Q&A',
      'Multi-document reasoning',
      'Citations',
      'Idea generation',
    ],
  },
} as const;

export const MEMORA_AI_PROMPT_STRATEGY = {
  processing: PROCESSING_SYSTEM_PROMPT,
  chat: CHAT_SYSTEM_PROMPT,
  generalKnowledgeFallback: GENERAL_KNOWLEDGE_SYSTEM_PROMPT,
} as const;

function getGeminiCandidateModels(purpose: MemoraModelPurpose) {
  if (purpose === 'embedding') {
    const configuredEmbeddingModel =
      process.env.GEMINI_EMBEDDING_MODEL?.trim()
      || process.env.GEMINI_SEARCH_MODEL?.trim()
      || DEFAULT_EMBEDDING_MODEL;

    return Array.from(new Set([configuredEmbeddingModel, DEFAULT_EMBEDDING_MODEL]));
  }

  if (purpose === 'chat') {
    const configuredChatModel =
      process.env.GEMINI_CHAT_MODEL?.trim()
      || process.env.GEMINI_MODEL?.trim()
      || DEFAULT_CHAT_MODEL;

    return Array.from(new Set([configuredChatModel, DEFAULT_CHAT_MODEL, DEFAULT_PROCESSING_MODEL]));
  }

  const configuredProcessingModel =
    process.env.GEMINI_PROCESSING_MODEL?.trim()
    || process.env.GEMINI_MODEL?.trim()
    || DEFAULT_PROCESSING_MODEL;

  return Array.from(new Set([configuredProcessingModel, DEFAULT_PROCESSING_MODEL]));
}

function buildProcessingPrompt(input: {
  normalizedContent: string;
  sourceUrl?: string;
  urlContext?: string;
  fileContext?: string;
}) {
  return `Process the following saved content into structured vault knowledge.

Return JSON only.

Requested fields:
1. title
2. summary
3. keyPoints
4. type
5. tags
6. readTime
7. source
8. author
9. flashcards

Processing guidance:
- Keep the summary grounded in the source evidence.
- Keep key points short, useful, and searchable.
- Tags should be high-signal retrieval aids, not generic filler.
- Preserve technical entities, product names, tools, frameworks, dates, and URLs when relevant.
- If the source is partial, reflect that briefly in the summary instead of guessing.

Direct user content:
${input.normalizedContent || 'No direct text content provided.'}

${input.sourceUrl ? `Original URL: ${input.sourceUrl}` : 'No source URL provided.'}

Fetched URL context:
${input.urlContext || 'No URL context could be retrieved.'}

${input.fileContext || ''}`.trim();
}

function buildChatPrompt(input: {
  query: string;
  itemsContext: string;
  historyContext: string;
  responseStyleInstruction: string;
}) {
  return `Answer the user's question using only the vault evidence below.
${input.responseStyleInstruction}

Vault evidence:
${input.itemsContext}

Conversation history:
${input.historyContext || 'No prior chat history.'}

User question:
"${input.query}"

Return JSON containing:
1. "answer": direct user-facing answer
2. "summaryBlock": richer structured explanation grounded in the evidence
3. "referencedSources": exact vault items used
4. "tags": up to 3 short context tags`;
}

function buildGeneralKnowledgePrompt(query: string, responseStyleInstruction: string) {
  return `The vault does not contain a reliable match for this request, so answer from general knowledge only after disclosing that limitation.
${responseStyleInstruction}

User question:
"${query}"

Return JSON with:
1. "answer": starts by disclosing the vault mismatch
2. "summaryBlock": a structured practical explanation
3. "tags": up to 3 short tags`;
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
  customType?: 'Videos' | 'Articles' | 'PDFs' | 'Social Links' | 'Voice Notes' | 'Images',
  fileData?: UploadedFileData
): Promise<{
  title: string;
  summary: string;
  keyPoints: string[];
  type: 'Videos' | 'Articles' | 'PDFs' | 'Social Links' | 'Voice Notes' | 'Images';
  tags: string[];
  readTime: string;
  source: string;
  author?: string;
  flashcards: Omit<Flashcard, 'id'>[];
}> {
  const ai = getAiClient();
  const youtubeMetadata = sourceUrl ? await fetchYouTubeMetadata(sourceUrl) : null;
  const urlContext = sourceUrl ? await fetchUrlContext(sourceUrl, youtubeMetadata) : '';
  const normalizedContent = normalizeSourceText(content);
  const fileContext = fileData
    ? `Uploaded file metadata:
- mimeType: ${fileData.mimeType}
- fileName: ${fileData.name || 'unknown'}
- attachmentKind: ${classifyAttachment(fileData.mimeType)}

If the uploaded asset contains readable text or speech, extract and use it. If some parts are not accessible, explicitly acknowledge the limitation and avoid inventing missing details.`
    : '';
  const prompt = buildProcessingPrompt({
    normalizedContent,
    sourceUrl,
    urlContext,
    fileContext,
  });

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
      purpose: 'processing',
      contents: modelContents,
      config: {
        systemInstruction: PROCESSING_SYSTEM_PROMPT,
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
              enum: ['Videos', 'Articles', 'PDFs', 'Social Links', 'Voice Notes', 'Images']
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
      type?: 'Videos' | 'Articles' | 'PDFs' | 'Social Links' | 'Voice Notes' | 'Images';
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
      title: data.title?.trim() || youtubeMetadata?.title || 'New Raw Save',
      summary: data.summary?.trim() || buildFallbackSummary(content, sourceUrl, customType).summary,
      keyPoints: normalizeKeyPoints(data.keyPoints),
      type: data.type || customType || 'Articles',
      tags: normalizeTags(data.tags),
      readTime: data.readTime?.trim() || '3 min read',
      source: data.source?.trim() || youtubeMetadata?.providerName || deriveSourceLabel(sourceUrl, fileData),
      author: data.author?.trim() || youtubeMetadata?.authorName || undefined,
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
  chatHistory: { role: 'user' | 'model'; content: string }[],
  responseStyle: 'concise' | 'balanced' | 'detailed' = 'balanced'
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

  const itemsContext = items.map((item) => {
    return `[ID: ${item.id}] [Title: ${item.title}] [Type: ${item.type}] [Source: ${item.source}] [Tags: ${item.tags.join(', ')}]
Summary: ${item.summary}
Primary content:
${item.content}
Extracted text:
${item.extractedText || 'No extracted text available.'}
---`;
  }).join('\n\n');

  const historyContext = chatHistory.map((h) => `${h.role === 'user' ? 'User' : 'Memora'}: ${h.content}`).join('\n');
  const responseStyleInstruction =
    responseStyle === 'concise'
      ? 'Keep both the opening answer and summary block tight, skimmable, and short.'
      : responseStyle === 'detailed'
        ? 'Be comprehensive. Include more nuance, structured detail, and fuller explanations while staying grounded in the saved items.'
        : 'Keep a balanced level of detail: clear, structured, and useful without becoming overly long.';

  const prompt = buildChatPrompt({
    query,
    itemsContext,
    historyContext,
    responseStyleInstruction,
  });

  try {
    const response = await generateContentWithRetry(ai, {
      purpose: 'chat',
      contents: prompt,
      config: {
        systemInstruction: CHAT_SYSTEM_PROMPT,
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

export async function answerFromGeneralKnowledge(
  query: string,
  responseStyle: 'concise' | 'balanced' | 'detailed' = 'balanced'
): Promise<{
  answer: string;
  summaryBlock?: string;
  tags?: string[];
}> {
  const ai = getAiClient();

  if (!ai) {
    return buildGeneralFallback(query);
  }

  const responseStyleInstruction =
    responseStyle === 'concise'
      ? 'Keep the answer short and crisp.'
      : responseStyle === 'detailed'
        ? 'Be detailed and well-structured.'
        : 'Keep the answer balanced and practical.';

  const prompt = buildGeneralKnowledgePrompt(query, responseStyleInstruction);

  try {
    const response = await generateContentWithRetry(ai, {
      purpose: 'chat',
      contents: prompt,
      config: {
        systemInstruction: GENERAL_KNOWLEDGE_SYSTEM_PROMPT,
        temperature: 0.4,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: ['answer', 'summaryBlock', 'tags'],
          properties: {
            answer: { type: Type.STRING },
            summaryBlock: { type: Type.STRING },
            tags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error('Empty response from model');
    }

    const data = JSON.parse(text.trim()) as {
      answer?: string;
      summaryBlock?: string;
      tags?: string[];
    };

    return {
      answer: data.answer?.trim() || buildGeneralFallback(query).answer,
      summaryBlock: data.summaryBlock?.trim() || buildGeneralFallback(query).summaryBlock,
      tags: (data.tags ?? []).map((tag) => tag.trim()).filter(Boolean).slice(0, 3),
    };
  } catch (error) {
    logGeminiFallback('Gemini general fallback generation failed. Using heuristic general fallback instead.', error);
    return buildGeneralFallback(query);
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
  customType?: 'Videos' | 'Articles' | 'PDFs' | 'Social Links' | 'Voice Notes' | 'Images'
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
        item.summary.toLowerCase().includes(qLower) ||
        (item.extractedText?.toLowerCase().includes(qLower) ?? false)
    ) || items[0];

  return {
    answer: matched
      ? `I looked through your vault and found your saved content on **'${matched.title}'** from ${matched.source}.`
      : "I couldn't find a direct match in your vault for that, but here is what I can compile from your notes.",
    summaryBlock: matched
      ? matched.summary
      : 'You can save articles, videos, PDFs, social links, screenshots, or notes to your vault and then ask me grounded questions about them.',
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
      'Save or finish processing an article, video, PDF, social link, image, or voice note first, then ask again for a grounded answer.',
    referencedSources: [],
    tags: ['No Results', 'Empty Vault'],
  };
}

function buildGeneralFallback(query: string) {
  return {
    answer:
      `I couldn't find anything clearly related to "${query.trim()}" in your vault, so this answer is based on general reasoning rather than saved sources.`,
    summaryBlock:
      'No direct vault match was available for this topic. I am giving a general best-effort explanation based on the request itself, so treat it as an assumption-based answer rather than a citation-backed vault recall.',
    tags: ['No Vault Match', 'General Reasoning', 'Assumption Based'],
  };
}

function logGeminiFallback(message: string, error: unknown) {
  if (isInvalidApiKeyError(error)) {
    console.warn('Gemini API key is missing or invalid. Using heuristic fallback instead.');
    return;
  }

  if (isModelAccessError(error)) {
    console.warn(
      'Configured Gemini model could not be used with the current API key or quota. Using heuristic fallback instead.'
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
    purpose: MemoraModelPurpose;
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
  const candidateModels = getGeminiCandidateModels(request.purpose);
  const { purpose, ...modelRequest } = request;

  for (const model of candidateModels) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await ai.models.generateContent({
          model,
          ...modelRequest,
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

type YouTubeMetadata = {
  title?: string;
  authorName?: string;
  providerName?: string;
};

async function fetchUrlContext(url: string, youtubeMetadata?: YouTubeMetadata | null) {
  try {
    if (isYouTubeUrl(url)) {
      const youtubeContext = buildYouTubeContext(url, youtubeMetadata ?? await fetchYouTubeMetadata(url));
      if (youtubeContext) {
        return youtubeContext;
      }
    }

    const response = await fetchSafeRemote(url, { timeoutMs: 5000 });

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

async function fetchYouTubeMetadata(url: string): Promise<YouTubeMetadata | null> {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response = await fetchSafeRemote(oembedUrl, { timeoutMs: 5000 });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      title?: string;
      author_name?: string;
      provider_name?: string;
    };

    return {
      title: data.title ? normalizeSourceText(data.title) : undefined,
      authorName: data.author_name ? normalizeSourceText(data.author_name) : undefined,
      providerName: data.provider_name ? normalizeSourceText(data.provider_name) : undefined,
    };
  } catch {
    return null;
  }
}

function buildYouTubeContext(url: string, metadata?: YouTubeMetadata | null) {
  if (!metadata) {
    return '';
  }

  return [
    metadata.title ? `Video title: ${metadata.title}` : '',
    metadata.authorName ? `Channel: ${metadata.authorName}` : '',
    metadata.providerName ? `Platform: ${metadata.providerName}` : '',
    `Original video URL: ${url}`,
  ]
    .filter(Boolean)
    .join('\n');
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
