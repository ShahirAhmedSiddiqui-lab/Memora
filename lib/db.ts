export interface Flashcard {
  id: string;
  type: string;
  question: string;
  answer: string;
}

export type ItemProcessingStatus = 'pending' | 'ready' | 'failed' | 'trashed';

export interface ItemPreviewMetadata {
  thumbnailUrl?: string;
  faviconUrl?: string;
  provider?: string;
  sourceUrl?: string;
  fileName?: string;
  mimeType?: string;
  byteSize?: number;
}

export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  extractedText?: string;
  summary: string;
  type: 'Videos' | 'Articles' | 'PDFs' | 'Social Links' | 'Voice Notes';
  processingStatus: ItemProcessingStatus;
  failureReason?: string;
  tags: string[];
  createdAt: string;
  createdAtDate: string;
  updatedAtDate?: string;
  deletedAt?: string;
  source: string;
  author?: string;
  url?: string;
  previewMetadata?: ItemPreviewMetadata;
  flashcards: Flashcard[];
  imageUrl?: string;
  readTime?: string;
  isSynthesized: boolean;
  bookmarked?: boolean;
  filePath?: string;
  fileMime?: string;
  fileName?: string;
  fileUrl?: string;
}

export interface ChatReferencedSource {
  title: string;
  source: string;
  type: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  summaryBlock?: string;
  referencedSources?: ChatReferencedSource[];
  tags?: string[];
  createdAt: string;
}

export function formatRelativeDate(isoString: string): string {
  const now = Date.now();
  const timestamp = new Date(isoString).getTime();

  if (Number.isNaN(timestamp)) {
    return 'Recently';
  }

  const diffMs = now - timestamp;
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) {
    return 'Just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} min${diffMinutes === 1 ? '' : 's'} ago`;
  }
  if (diffHours < 24) {
    return `${diffHours} hr${diffHours === 1 ? '' : 's'} ago`;
  }
  if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  }

  return new Date(isoString).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getOnboardingItem(): KnowledgeItem {
  const createdAtDate = new Date().toISOString();

  return {
    id: 'onboarding-manual',
    title: 'Welcome to Aether Vault: Your AI Second Brain',
    content:
      'Welcome to Aether Vault! Save notes, articles, tweets, video links, PDFs, and voice memos. The app summarizes each item, organizes tags, and lets you ask your vault contextual questions.',
    summary:
      'This starter guide explains the capture flow, file support, summaries, flashcards, and chat-based recall features inside your vault.',
    processingStatus: 'ready',
    type: 'Articles',
    tags: ['Overview', 'Guide'],
    createdAt: 'Just now',
    createdAtDate,
    updatedAtDate: createdAtDate,
    source: 'Aether Vault',
    flashcards: [
      {
        id: 'fc-welcome-1',
        type: 'Usage',
        question: 'How do you add a new knowledge item?',
        answer:
          'Use Quick Capture to paste a link, write a note, upload a file, or record a voice memo.',
      },
      {
        id: 'fc-welcome-2',
        type: 'Interaction',
        question: 'What is the chat panel used for?',
        answer:
          'It lets you ask questions about your saved items and get a synthesized answer grounded in your vault.',
      },
    ],
    imageUrl:
      'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60',
    previewMetadata: {
      thumbnailUrl:
        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60',
    },
    readTime: '2 min read',
    isSynthesized: true,
    bookmarked: true,
  };
}
