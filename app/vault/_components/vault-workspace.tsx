'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BookOpen,
  Bot,
  CheckCircle,
  FileText,
  Globe,
  ImageIcon,
  Inbox,
  Layers,
  Mic,
  PanelLeft,
  Play,
  Plus,
  RotateCcw,
  Search,
  Send,
  X,
  Bookmark,
  Trash2,
} from 'lucide-react';
import { ChatMessage, KnowledgeItem } from '@/lib/db';
import { matchesSearch } from '@/lib/supabase/vault';
import { cn } from '@/lib/utils';
import { BrandLockup } from '@/app/_components/brand-lockup';
import { FormattedMarkdown } from './formatted-markdown';
import { VaultContentPanel } from './vault-content-panel';
import { VaultDetailPanel } from './vault-detail-panel';

type VaultIdentity = {
  fullName?: string;
  email?: string;
};

type VaultTab =
  | 'Overview'
  | 'Bookmarks'
  | 'Trash'
  | 'Articles'
  | 'Videos'
  | 'PDFs'
  | 'Social Links'
  | 'Voice Notes'
  | 'Images'
  | 'Chat'
  | 'Guide';

const captureCopy: Record<
  Exclude<VaultTab, 'Overview' | 'Bookmarks' | 'Trash' | 'Chat' | 'Guide'>,
  {
    sourceLabel: string;
    sourcePlaceholder: string;
    textLabel: string;
    textPlaceholder: string;
  }
> = {
  Articles: {
    sourceLabel: 'Article or Web Link',
    sourcePlaceholder: 'https://example.com/insightful-article',
    textLabel: 'Article Notes, Quotes, or Pasted Text',
    textPlaceholder: 'Paste article highlights, web excerpts, or your own written notes here...',
  },
  Videos: {
    sourceLabel: 'Video Link',
    sourcePlaceholder: 'https://www.youtube.com/watch?v=...',
    textLabel: 'Video Notes, Timestamps, or Transcript',
    textPlaceholder: 'Add key timestamps, ideas from the video, or any transcript snippets you want stored...',
  },
  PDFs: {
    sourceLabel: 'Supplementary Notes or URL (Optional)',
    sourcePlaceholder: 'https://arxiv.org/abs/2401...',
    textLabel: 'PDF Context Notes',
    textPlaceholder: 'Any additional instructions or specific topics to focus on...',
  },
  Images: {
    sourceLabel: 'Reference URL (Optional)',
    sourcePlaceholder: 'https://example.com/reference-shot',
    textLabel: 'Screenshot Notes or OCR Context',
    textPlaceholder: 'Add any notes about what this screenshot contains or why it matters...',
  },
  'Social Links': {
    sourceLabel: 'Social Link',
    sourcePlaceholder: 'https://x.com/... or https://linkedin.com/...',
    textLabel: 'Post Text, Thread Notes, or Commentary',
    textPlaceholder: 'Paste the post text, thread summary, or your own notes about why this social link matters...',
  },
  'Voice Notes': {
    sourceLabel: 'Voice Source',
    sourcePlaceholder: '',
    textLabel: 'Title or Brief Notes',
    textPlaceholder: 'Give this voice memo a descriptive title or short context note...',
  },
};

export function VaultWorkspace({ identity }: { identity?: VaultIdentity }) {
  const [currentTab, setCurrentTab] = React.useState<VaultTab>('Overview');
  const [items, setItems] = React.useState<KnowledgeItem[]>([]);
  const [chats, setChats] = React.useState<ChatMessage[]>([]);
  const [selectedItemId, setSelectedItemId] = React.useState<string>('');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [chatInput, setChatInput] = React.useState('');
  const [captureUrl, setCaptureUrl] = React.useState('');
  const [captureContent, setCaptureContent] = React.useState('');
  const [captureType, setCaptureType] = React.useState<'Videos' | 'Articles' | 'PDFs' | 'Social Links' | 'Voice Notes' | 'Images'>('Articles');
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [showCaptureModal, setShowCaptureModal] = React.useState(false);
  const [uploadFile, setUploadFile] = React.useState<File | null>(null);
  const [uploadFileBase64, setUploadFileBase64] = React.useState('');
  const [isRecording, setIsRecording] = React.useState(false);
  const [recordingDuration, setRecordingDuration] = React.useState(0);
  const [recorderBlob, setRecorderBlob] = React.useState<Blob | null>(null);
  const [recorderUrl, setRecorderUrl] = React.useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [voiceSpeed, setVoiceSpeed] = React.useState(1.0);
  const [inlineInput, setInlineInput] = React.useState('');
  const [isInlineGenerating, setIsInlineGenerating] = React.useState(false);
  const [localAskQuery, setLocalAskQuery] = React.useState('');
  const [localAskAnswer, setLocalAskAnswer] = React.useState<string | null>(null);
  const [localAskLoading, setLocalAskLoading] = React.useState(false);
  const [flippedCardId, setFlippedCardId] = React.useState<string | null>(null);
  const [isSendingChat, setIsSendingChat] = React.useState(false);
  const [notification, setNotification] = React.useState<string | null>(null);

  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const timerRef = React.useRef<any>(null);
  const chatScrollContainerRef = React.useRef<HTMLDivElement | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const pendingRefreshAttemptsRef = React.useRef<Record<string, number>>({});

  const displayName = identity?.fullName?.trim() || 'Vault User';
  const displayEmail = identity?.email?.trim() || 'your-vault@memora.local';
  const avatarLetter = displayName.charAt(0).toUpperCase() || 'V';
  const activeCaptureCopy = captureCopy[captureType];
  const currentSectionLabel =
    currentTab === 'Overview'
      ? 'Knowledge Workspace'
      : currentTab === 'Bookmarks'
        ? 'Bookmarked Knowledge'
        : currentTab === 'Trash'
          ? 'Trash Recovery'
      : currentTab === 'Guide'
        ? 'Vault Guide'
        : currentTab === 'Chat'
          ? 'AI Chat Search'
          : `${currentTab} Library`;

  React.useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording]);

  React.useEffect(() => {
    if (chatScrollContainerRef.current) {
      chatScrollContainerRef.current.scrollTo({
        top: chatScrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [chats, isSendingChat]);

  React.useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = voiceSpeed;
    }
  }, [voiceSpeed, selectedItemId]);

  const showToast = React.useCallback((message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3000);
  }, []);

  const upsertItem = React.useCallback((nextItem: KnowledgeItem) => {
    setItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === nextItem.id);

      if (existingIndex === -1) {
        return [nextItem, ...prev];
      }

      const updated = [...prev];
      updated[existingIndex] = nextItem;
      return updated;
    });
  }, []);

  const refreshItem = React.useCallback(
    async (itemId: string, fallbackTitle: string) => {
      const delays = [1500, 4000, 9000];

      for (const delay of delays) {
        await new Promise((resolve) => setTimeout(resolve, delay));

        try {
          const res = await fetch(`/api/items/${itemId}`);
          if (!res.ok) {
            continue;
          }

          const updated = await res.json();
          upsertItem(updated);

          if (updated.processingStatus === 'ready') {
            delete pendingRefreshAttemptsRef.current[updated.id];
            setSelectedItemId(updated.id);
            showToast(`Finished processing "${updated.title}"`);
            return;
          }

          if (updated.processingStatus === 'failed') {
            delete pendingRefreshAttemptsRef.current[updated.id];
            setSelectedItemId(updated.id);
            showToast(`Saved "${updated.title}", but AI processing failed.`);
            return;
          }
        } catch (err) {
          console.error(err);
        }
      }

      showToast(`Saved "${fallbackTitle}". Processing is still running in the background.`);
    },
    [showToast, upsertItem]
  );

  const resetCaptureState = React.useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    setIsRecording(false);
    setCaptureUrl('');
    setCaptureContent('');
    setUploadFile(null);
    setUploadFileBase64('');
    setRecorderBlob(null);
    setRecorderUrl(null);
    setRecordingDuration(0);
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const loadItems = async () => {
      try {
        const res = await fetch('/api/items?include_trashed=true');
        const data = await res.json();

        if (!cancelled && Array.isArray(data)) {
          setItems(data);
          setSelectedItemId((prev) => {
            if (data.length === 0) {
              return '';
            }

            const exists = data.some((item) => item.id === prev);
            return !prev || !exists ? data[0].id : prev;
          });
        }
      } catch (err) {
        console.error('Error fetching items:', err);
      }
    };

    void loadItems();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    const pendingItems = items.filter((item) => item.processingStatus === 'pending' && !item.deletedAt);

    if (pendingItems.length === 0) {
      pendingRefreshAttemptsRef.current = {};
      return;
    }

    const refreshableItems = pendingItems.filter((item) => {
      const attempts = pendingRefreshAttemptsRef.current[item.id] ?? 0;
      return attempts < 8;
    });

    if (refreshableItems.length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/items?include_trashed=true');
        if (!res.ok) {
          return;
        }

        const data = await res.json();
        if (!Array.isArray(data)) {
          return;
        }

        refreshableItems.forEach((item) => {
          pendingRefreshAttemptsRef.current[item.id] = (pendingRefreshAttemptsRef.current[item.id] ?? 0) + 1;
        });

        setItems(data);
        setSelectedItemId((prev) => {
          if (data.length === 0) {
            return '';
          }

          const exists = data.some((item) => item.id === prev);
          return !prev || !exists ? data[0].id : prev;
        });
      } catch (err) {
        console.error('Error refreshing pending items:', err);
      }
    }, 4000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [items]);

  React.useEffect(() => {
    if (currentTab !== 'Chat') {
      return;
    }

    let cancelled = false;

    const loadChats = async () => {
      try {
        const res = await fetch('/api/chats');
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) {
          setChats(data);
        }
      } catch (err) {
        console.error('Error fetching chats:', err);
      }
    };

    void loadChats();

    return () => {
      cancelled = true;
    };
  }, [currentTab]);

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const options = { mimeType: 'audio/webm' };
      let mediaRecorder;

      try {
        mediaRecorder = new MediaRecorder(stream, options);
      } catch {
        mediaRecorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = mediaRecorder;
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setRecorderBlob(blob);
        const url = URL.createObjectURL(blob);
        setRecorderUrl(url);

        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          const base64data = reader.result as string;
          const rawBase64 = base64data.split(',')[1] || base64data;
          setUploadFileBase64(rawBase64);
        };
      };

      setRecordingDuration(0);
      setIsRecording(true);
      mediaRecorder.start();
    } catch (err) {
      console.error('Failed to start recording:', err);
      showToast('Microphone access denied or audio recording failed.');
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadFile(file);
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onloadend = () => {
      const base64data = reader.result as string;
      const rawBase64 = base64data.split(',')[1] || base64data;
      setUploadFileBase64(rawBase64);
    };
  };

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) {
        throw new Error('Logout failed');
      }
      window.location.assign('/login');
    } catch (error) {
      console.error(error);
      showToast('Unable to log out right now.');
    }
  };

  const handleCaptureSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captureUrl && !captureContent && !uploadFileBase64) {
      showToast('Please provide a URL, note content, or upload a file.');
      return;
    }

    setIsGenerating(true);
    try {
      const payload: any = {
        url: captureUrl || undefined,
        content: captureContent || (uploadFile ? `Uploaded File: ${uploadFile.name}` : undefined),
        type: captureType,
      };

      if (uploadFileBase64) {
        payload.fileData = {
          base64: uploadFileBase64,
          mimeType: uploadFile ? uploadFile.type : (recorderBlob ? recorderBlob.type : 'audio/webm'),
          name: uploadFile ? uploadFile.name : `Voice Recorded Memo - ${new Date().toLocaleDateString()}`,
          size: uploadFile ? uploadFile.size : (recorderBlob ? recorderBlob.size : 12000),
        };
      }

      const response = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Capture failed');
      }

      const newItem = await response.json();
      upsertItem(newItem);
      setSelectedItemId(newItem.id);
      setShowCaptureModal(false);
      resetCaptureState();
      if (newItem.processingStatus === 'failed') {
        showToast(`Saved "${newItem.title}", but the upload could not be prepared for AI processing.`);
      } else {
        showToast(`Saved "${newItem.title}". Processing started.`);
        void refreshItem(newItem.id, newItem.title);
      }
    } catch (error) {
      console.error(error);
      showToast('Failed to save capture.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInlineCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineInput.trim()) return;

    setIsInlineGenerating(true);
    const isUrl = inlineInput.trim().startsWith('http://') || inlineInput.trim().startsWith('https://');

    try {
      const response = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: isUrl ? inlineInput.trim() : undefined,
          content: isUrl ? undefined : inlineInput.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error('Quick capture failed');
      }

      const newItem = await response.json();
      upsertItem(newItem);
      setSelectedItemId(newItem.id);
      setInlineInput('');
      if (newItem.processingStatus === 'failed') {
        showToast(`Added "${newItem.title}", but the upload could not be prepared for AI processing.`);
      } else {
        showToast(`Added "${newItem.title}" to your library. Processing started.`);
        void refreshItem(newItem.id, newItem.title);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to capture item.');
    } finally {
      setIsInlineGenerating(false);
    }
  };

  const handleRetryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/items/${id}/reprocess`, {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error('Retry failed');
      }

      const updated = await res.json();
      upsertItem(updated);
      setSelectedItemId(updated.id);
      showToast(updated.processingStatus === 'failed' ? `Retry failed for "${updated.title}"` : `Reprocessed "${updated.title}"`);
    } catch (err) {
      console.error(err);
      showToast('Unable to retry processing right now.');
    }
  };

  const handleToggleBookmark = async (id: string, currentStatus: boolean, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`/api/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarked: !currentStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
        showToast(updated.bookmarked ? 'Added to bookmarked items' : 'Removed from bookmarks');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to move this item to trash?')) return;
    try {
      const res = await fetch(`/api/items/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const payload = await res.json();
        const trashedItem = payload?.item as KnowledgeItem | undefined;

        if (trashedItem) {
          upsertItem(trashedItem);
        }

        showToast('Moved item to trash');
        if (selectedItemId === id) {
          const remaining = items.filter((item) => item.id !== id && !item.deletedAt);
          setSelectedItemId(remaining[0]?.id || '');
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRestoreItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      const res = await fetch(`/api/items/${id}/restore`, {
        method: 'POST',
      });

      if (!res.ok) {
        throw new Error('Restore failed');
      }

      const restored = (await res.json()) as KnowledgeItem;
      upsertItem(restored);
      setSelectedItemId(restored.id);
      setCurrentTab('Overview');
      showToast(`Restored "${restored.title}" to your vault`);
    } catch (err) {
      console.error(err);
      showToast('Unable to restore this item right now.');
    }
  };

  const handlePermanentDeleteItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Permanently delete this item from trash? This cannot be undone.')) return;

    try {
      const res = await fetch(`/api/items/${id}?permanent=true`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Permanent delete failed');
      }

      setItems((prev) => prev.filter((item) => item.id !== id));

      if (selectedItemId === id) {
        const remainingTrashItems = items.filter((item) => item.id !== id && !!item.deletedAt);
        setSelectedItemId(remainingTrashItems[0]?.id || '');
      }

      showToast('Item permanently deleted');
    } catch (err) {
      console.error(err);
      showToast('Unable to permanently delete this item right now.');
    }
  };

  const handleChatSubmit = async (e?: React.FormEvent, customQuery?: string) => {
    if (e) e.preventDefault();
    if (isSendingChat) return;

    const query = customQuery || chatInput;
    if (!query.trim()) return;

    setChatInput('');
    setIsSendingChat(true);

    const tempUserMsg: ChatMessage = {
      id: `temp-usr-${chats.length}`,
      role: 'user',
      content: query,
      createdAt: 'Just now',
    };
    setChats((prev) => [...prev, tempUserMsg]);

    try {
      const response = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) {
        throw new Error('Chat failed');
      }

      const data = await response.json();
      setChats((prev) => {
        const filtered = prev.filter((c) => c.id !== tempUserMsg.id);
        const newMsgs = [data.userMessage, data.modelMessage].filter((newMsg) => !filtered.some((m) => m.id === newMsg.id));
        return [...filtered, ...newMsgs];
      });
    } catch (err) {
      console.error(err);
      showToast('Brain query synthesis failed.');
    } finally {
      setIsSendingChat(false);
    }
  };

  const runLocalAskAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (localAskLoading || !localAskQuery.trim()) return;

    setLocalAskLoading(true);
    setLocalAskAnswer(null);
    const relevantContext = items.filter((item) => {
      if (currentTab === 'Trash') {
        return !!item.deletedAt;
      }

      if (item.deletedAt) {
        return false;
      }

      if (currentTab === 'Bookmarks') {
        return !!item.bookmarked;
      }

      return currentTab === 'Overview' || item.type === currentTab;
    });
    const contextText = relevantContext.map((i) => `${i.title}: ${i.summary}`).join('\n\n');

    try {
      const res = await fetch('/api/chats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `Provide a concise synthesis bullet list based on my query: ${localAskQuery}. Context of my saved documents: ${contextText}`,
          persist: false,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setLocalAskAnswer(data.modelMessage.content);
        setLocalAskQuery('');
      }
    } catch {
      setLocalAskAnswer('Unable to query context at this time.');
    } finally {
      setLocalAskLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!confirm('Are you sure you want to clear chat history? Your indexed library items will remain safe.')) return;
    try {
      const response = await fetch('/api/chats', { method: 'DELETE' });
      if (response.ok) {
        setChats([]);
        showToast('Chat history cleared');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const visibleItems = React.useMemo(
    () =>
      items.filter((item) => {
        const matchesTab =
          currentTab === 'Overview'
            ? !item.deletedAt
            : currentTab === 'Bookmarks'
              ? !item.deletedAt && !!item.bookmarked
              : currentTab === 'Trash'
                ? !!item.deletedAt
                : currentTab === 'Chat' || currentTab === 'Guide'
                  ? !item.deletedAt
                  : !item.deletedAt && item.type === currentTab;
        const matchesQuery = !searchQuery.trim() || matchesSearch(item, searchQuery);
        return matchesTab && matchesQuery;
      }),
    [currentTab, items, searchQuery]
  );

  const currentItem =
    visibleItems.find((item) => item.id === selectedItemId) ||
    visibleItems[0] ||
    items.find((item) => item.id === selectedItemId) ||
    items[0];

  const categories = [
    { name: 'Overview', icon: Layers },
    { name: 'Bookmarks', icon: Bookmark },
    { name: 'Articles', icon: FileText },
    { name: 'Videos', icon: Play },
    { name: 'PDFs', icon: BookOpen },
    { name: 'Images', icon: ImageIcon },
    { name: 'Social Links', icon: Globe },
    { name: 'Voice Notes', icon: Mic },
    { name: 'Trash', icon: RotateCcw },
  ];

  return (
    <div className="h-screen overflow-hidden bg-[#fafafc] text-neutral-800 font-sans relative antialiased flex flex-row">
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 15 }}
            className="fixed bottom-6 right-6 z-50 bg-neutral-900 text-white px-4 py-3 rounded-xl text-xs font-medium shadow-xl flex items-center space-x-2.5 border border-neutral-800/50"
          >
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{notification}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {isSidebarOpen && (
        <div className="fixed inset-0 bg-neutral-900/10 backdrop-blur-3xs z-30 md:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      <aside
        className={cn(
          'bg-white border-r border-[#e5e5eb] flex flex-col shrink-0 transition-all duration-300 z-40 h-full overflow-hidden',
          isSidebarOpen ? 'w-64 fixed inset-y-0 left-0 md:relative md:flex' : 'w-0 overflow-hidden border-r-0 !hidden'
        )}
      >
        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-6">
          <div
            onClick={() => window.location.assign('/')}
            className="px-2.5 cursor-pointer group select-none"
            title="Go inside Product Presentation / Landing Page"
          >
            <BrandLockup
              size="sm"
              subtitle="AI SECOND BRAIN"
              className="group-hover:opacity-90 transition"
              titleClassName="text-[1.05rem]"
              subtitleClassName="tracking-[0.22em]"
            />
          </div>

          <button
            onClick={() => setShowCaptureModal(true)}
            className="w-full bg-neutral-900 hover:bg-neutral-800 active:scale-[0.98] text-white text-xs font-semibold py-2.5 px-3 rounded-lg shadow-sm transition flex items-center justify-center space-x-2"
          >
            <Plus className="w-4 h-4 text-white" />
            <span>Quick Capture</span>
          </button>

          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 px-3 py-1 selection:bg-transparent">Vault Contents</div>
            <nav className="space-y-0.5">
              {categories.map((cat) => {
                const Icon = cat.icon;
                const isSelected = currentTab === cat.name;
                const count =
                  cat.name === 'Overview'
                    ? items.filter((item) => !item.deletedAt).length
                    : cat.name === 'Bookmarks'
                      ? items.filter((item) => !item.deletedAt && !!item.bookmarked).length
                      : cat.name === 'Trash'
                        ? items.filter((item) => !!item.deletedAt).length
                        : items.filter((item) => !item.deletedAt && item.type === cat.name).length;

                return (
                  <button
                    key={cat.name}
                    onClick={() => setCurrentTab(cat.name as VaultTab)}
                    className={cn(
                      'w-full px-3 py-2.5 rounded-xl flex items-center space-x-3 text-left transition',
                      isSelected ? 'bg-neutral-100 text-neutral-950 font-semibold' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{cat.name === 'Overview' ? 'All Channels' : cat.name}</span>
                    <span className="ml-auto text-[10px] px-2 py-0.5 rounded-md bg-white border border-neutral-200 font-mono">{count}</span>
                  </button>
                );
              })}

              <button
                onClick={() => setCurrentTab('Chat')}
                className={cn(
                  'w-full px-3 py-2.5 rounded-xl flex items-center space-x-3 text-left transition',
                  currentTab === 'Chat' ? 'bg-neutral-100 text-neutral-950 font-semibold' : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
                )}
              >
                <Bot className={cn('w-4 h-4', currentTab === 'Chat' ? 'text-neutral-900' : 'text-neutral-400')} />
                <span>AI Chat Search</span>
                <span className="ml-auto bg-indigo-50 text-indigo-600 font-medium px-1.5 py-0.5 rounded text-[9px] border border-indigo-100/50">
                  ACTIVE
                </span>
              </button>
            </nav>
          </div>
        </div>

        <div className="mt-auto p-4 border-t border-[#e5e5eb] space-y-3 bg-white">
          <button
            onClick={() => setCurrentTab('Guide')}
            className={cn(
              'w-full px-3 py-2 text-xs font-medium rounded-lg transition text-left',
              currentTab === 'Guide' ? 'bg-neutral-100 text-neutral-950 font-bold' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'
            )}
          >
            <span>Vault Guide tour</span>
          </button>

          <div className="flex items-center space-x-3 px-2 py-1.5 text-left border border-neutral-200/55 rounded-xl bg-neutral-50/50 min-w-0">
            <div className="w-9 h-9 rounded-full bg-neutral-900 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
              {avatarLetter}
            </div>
            <div className="min-w-0">
              <span className="text-xs font-semibold text-neutral-800 block truncate leading-none">{displayName}</span>
              <span className="text-[10px] text-neutral-400 block truncate font-mono">{displayEmail}</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-[#e5e5eb] h-14 shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 z-10 select-none">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
            <button
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="p-1.5 rounded-lg border border-neutral-200 text-neutral-600 hover:border-neutral-900 hover:text-neutral-900 transition"
              aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
              title={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              <PanelLeft className="w-4 h-4" />
            </button>

            <div className="hidden lg:flex items-center gap-4 min-w-0 shrink-0">
              {!isSidebarOpen && (
                <>
                  <BrandLockup
                    size="sm"
                    logoClassName="h-10 w-10 rounded-[14px]"
                    titleClassName="text-[0.98rem]"
                    subtitleClassName="text-[0.5rem] tracking-[0.24em]"
                  />
                  <div className="h-8 w-px bg-neutral-200" />
                </>
              )}
              <span className="text-[10px] font-bold font-mono uppercase tracking-widest text-neutral-700 whitespace-nowrap">
                {currentSectionLabel}
              </span>
            </div>

            <div className="hidden sm:flex lg:hidden items-center text-[10px] font-bold font-mono uppercase tracking-widest text-neutral-900 whitespace-nowrap shrink-0">
              <span>{currentSectionLabel}</span>
            </div>

            <div className="relative flex-1 min-w-[180px] max-w-[720px]">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search concepts, source tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 pl-10 pr-14 py-2 text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-neutral-900 focus:bg-white transition"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 text-[10px] text-neutral-400 hover:text-neutral-900">
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2 md:space-x-4 shrink-0">
            <button onClick={() => setShowCaptureModal(true)} className="sm:hidden bg-neutral-900 text-white p-1.5 rounded-lg flex items-center" title="Add knowledge element">
              <Plus className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                setCurrentTab('Chat');
                void handleChatSubmit(undefined, 'Synthesize a core summary breakdown of my saved knowledge assets.');
              }}
              className="px-3.5 py-1.5 text-[10px] font-bold font-mono uppercase tracking-wider bg-neutral-950 hover:bg-neutral-800 text-white rounded-lg flex items-center transition shadow-xs active:scale-[0.98]"
            >
              <span>Auto-Synthesize</span>
            </button>

            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-[10px] font-bold font-mono uppercase tracking-wider border border-neutral-200 hover:border-neutral-900 text-neutral-700 rounded-lg transition"
            >
              Log Out
            </button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden relative">
          {currentTab === 'Guide' && (
            <div className="flex-1 overflow-y-auto p-10 max-w-4xl mx-auto text-left space-y-12 select-none">
              <div className="space-y-4">
                <div className="inline-block bg-neutral-150 text-neutral-800 text-[10px] font-extrabold px-2 py-0.5 rounded font-mono border border-neutral-300">
                  PRODUCT TOUR
                </div>
                <h2 className="text-3xl font-bold tracking-tight text-neutral-900">Memora Introduction</h2>
                <p className="text-neutral-500 text-sm leading-relaxed max-w-2xl">
                  Memora is an AI-powered personal vault designed specifically for research and high-volume indexing of YouTube
                  lectures, social links, PDFs, and notes. No gimmicks, beautiful minimalist utility.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-5 border border-neutral-200 bg-white rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-neutral-50 flex items-center justify-center border border-neutral-200 text-neutral-850 font-bold text-xs mb-3">1</div>
                  <h4 className="font-semibold text-xs uppercase font-mono tracking-wider text-neutral-900 mb-1">Capture everything</h4>
                  <p className="text-[11px] text-neutral-500 leading-relaxed">Paste URLs or custom paragraphs straight into the quick entry box. Gemini formats, tags, and processes details.</p>
                </div>
                <div className="p-5 border border-neutral-200 bg-white rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-neutral-50 flex items-center justify-center border border-neutral-200 text-neutral-850 font-bold text-xs mb-3">2</div>
                  <h4 className="font-semibold text-xs uppercase font-mono tracking-wider text-neutral-900 mb-1">Study Context Cards</h4>
                  <p className="text-[11px] text-neutral-500 leading-relaxed">Select any item in your dashboard to reveal the AI synopsis and dynamic flip flashcards, designed to foster deep active recall memory loops.</p>
                </div>
                <div className="p-5 border border-neutral-200 bg-white rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-neutral-50 flex items-center justify-center border border-neutral-200 text-neutral-850 font-bold text-xs mb-3">3</div>
                  <h4 className="font-semibold text-xs uppercase font-mono tracking-wider text-neutral-900 mb-1">Synthesizing Chats</h4>
                  <p className="text-[11px] text-neutral-500 leading-relaxed">Chat with your dynamic second mind. Ask, &ldquo;What did I save about supply chain startups?&rdquo; and watch the model cite precise quotes instantly.</p>
                </div>
              </div>

              <div className="pt-6 border-t border-neutral-200">
                <button
                  onClick={() => setCurrentTab('Overview')}
                  className="bg-neutral-900 text-white text-xs px-6 py-2.5 rounded-lg font-semibold hover:bg-neutral-800 transition shadow"
                >
                  Enter Workspace
                </button>
              </div>
            </div>
          )}

          {currentTab !== 'Chat' && currentTab !== 'Guide' && (
            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden w-full">
              <VaultContentPanel
                currentTab={currentTab}
                items={items}
                isTrashView={currentTab === 'Trash'}
                searchQuery={searchQuery}
                selectedItemId={selectedItemId}
                inlineInput={inlineInput}
                isInlineGenerating={isInlineGenerating}
                localAskQuery={localAskQuery}
                localAskAnswer={localAskAnswer}
                localAskLoading={localAskLoading}
                onInlineInputChange={setInlineInput}
                onLocalAskQueryChange={setLocalAskQuery}
                onInlineCapture={handleInlineCapture}
                onRunLocalAskAI={runLocalAskAI}
                onClearLocalAskAnswer={() => setLocalAskAnswer(null)}
                onSelectItem={(id) => {
                  setSelectedItemId(id);
                  setFlippedCardId(null);
                }}
                onToggleBookmark={handleToggleBookmark}
                onDeleteItem={handleDeleteItem}
                onRestoreItem={handleRestoreItem}
                onPermanentDeleteItem={handlePermanentDeleteItem}
                onRetryItem={handleRetryItem}
              />

              <VaultDetailPanel
                currentItem={currentItem}
                isTrashView={currentTab === 'Trash'}
                flippedCardId={flippedCardId}
                voiceSpeed={voiceSpeed}
                audioRef={audioRef}
                onSetVoiceSpeed={setVoiceSpeed}
                onFlipCard={setFlippedCardId}
                onToggleBookmark={handleToggleBookmark}
                onDeleteItem={handleDeleteItem}
                onRestoreItem={handleRestoreItem}
                onPermanentDeleteItem={handlePermanentDeleteItem}
                onRetryItem={handleRetryItem}
              />
            </div>
          )}

          {currentTab === 'Chat' && (
            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden select-none">
              <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-50/50">
                <div className="bg-white border-b border-neutral-200 py-3.5 px-6 flex justify-between items-center shrink-0">
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 bg-emerald-550 rounded-full" />
                    <span className="text-xs font-bold text-neutral-800 font-mono uppercase tracking-widest">Memora Neural Chat</span>
                  </div>

                  <button onClick={handleClearHistory} className="text-[10px] font-mono hover:text-red-600 text-neutral-400 font-bold transition">
                    CLEAR RECORDS
                  </button>
                </div>

                <div ref={chatScrollContainerRef} className="flex-1 overflow-y-auto p-6 space-y-6">
                  {chats.length === 0 ? (
                    <div className="max-w-md mx-auto text-center mt-12 py-10 px-6">
                      <Bot className="w-10 h-10 text-neutral-900 mx-auto mb-4" />
                      <h4 className="font-bold text-xs font-mono uppercase tracking-widest text-neutral-900 mb-1">Conversational Intelligence</h4>
                      <p className="text-xs text-neutral-500 leading-relaxed mb-4">
                        Consult your second mind on startup investments, metrics, thesis statements, or cross-reference facts across your
                        saved elements.
                      </p>
                      <div className="flex flex-wrap justify-center gap-2">
                        <button
                          onClick={() => setChatInput('What was that automated restaurant idea raised seed?')}
                          className="text-[10px] bg-white border border-neutral-200 hover:border-neutral-300 px-3.5 py-1.5 rounded-lg text-neutral-700"
                        >
                          &ldquo;Recall restaurant seed startups&rdquo;
                        </button>
                      </div>
                    </div>
                  ) : (
                    chats.map((chat) => (
                      <div
                        key={chat.id}
                        className={cn(
                          'flex flex-col space-y-1.5 max-w-2xl mx-auto text-left',
                          chat.role === 'user' ? 'items-end' : 'items-start'
                        )}
                      >
                        <div className="flex items-center space-x-2 text-[10px] font-bold font-mono text-neutral-400 uppercase tracking-widest">
                          <span>{chat.role === 'user' ? 'Me' : 'Brain Agent'}</span>
                          <span>&bull;</span>
                          <span>{chat.createdAt}</span>
                        </div>

                        <div
                          className={cn(
                            'px-4.5 py-3 rounded-xl text-xs leading-relaxed relative',
                            chat.role === 'user' ? 'bg-neutral-900 text-white rounded-tr-none' : 'bg-white border border-neutral-200 text-neutral-850 rounded-tl-none shadow-xs'
                          )}
                        >
                          <FormattedMarkdown text={chat.content} />
                        </div>

                        {chat.role === 'model' && chat.summaryBlock && (
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="w-full p-5 bg-white border border-neutral-200 shadow-sm rounded-xl text-left border-l-4 border-l-neutral-900"
                          >
                            <h5 className="text-[10px] font-bold font-mono uppercase tracking-widest text-neutral-450 mb-2">
                              Synthesized Information block:
                            </h5>
                            <div className="text-neutral-700 text-xs leading-relaxed mb-4 font-normal italic">
                              <FormattedMarkdown text={chat.summaryBlock} />
                            </div>

                            {chat.tags && chat.tags.length > 0 && (
                              <div className="flex flex-wrap gap-2 pt-3 border-t border-neutral-100">
                                {chat.tags.map((tag, i) => (
                                  <span key={i} className="text-[9px] font-bold font-mono bg-neutral-100 text-neutral-500 px-2 rounded lowercase">
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </motion.div>
                        )}
                      </div>
                    ))
                  )}

                  {isSendingChat && (
                    <div className="flex flex-col space-y-1 max-w-md mx-auto items-start">
                      <span className="text-[10px] font-bold font-mono text-neutral-400 uppercase">Consulting brain...</span>
                      <div className="bg-white border border-neutral-200 p-4 rounded-xl rounded-tl-none shadow-xs flex items-center space-x-1">
                        <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" />
                        <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                        <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-white border-t border-neutral-200 p-4 shrink-0">
                  <form
                    onSubmit={(e) => void handleChatSubmit(e)}
                    className="max-w-2xl mx-auto flex items-center bg-neutral-50 rounded-xl p-1.5 border border-neutral-200 focus-within:border-neutral-950 focus-within:bg-white transition"
                  >
                    <input
                      type="text"
                      placeholder="Ask your second mind any saved topic questions..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      className="flex-1 px-4 py-2 bg-transparent border-none text-xs text-neutral-950 placeholder-neutral-400 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isSendingChat || !chatInput.trim()}
                      className="bg-neutral-900 text-white p-2.5 rounded-lg disabled:opacity-40 hover:bg-neutral-850 shrink-0 transition"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              </div>

              <div className="w-full lg:w-72 bg-white border-t lg:border-t-0 lg:border-l border-neutral-200 p-6 flex flex-col justify-between shrink-0 overflow-y-auto text-left">
                <div className="space-y-6">
                  <div>
                    <div className="text-[10px] font-bold font-mono uppercase tracking-widest text-neutral-400 mb-3">Cited references</div>
                    <div className="space-y-2.5">
                      {chats
                        .filter((c) => c.role === 'model' && c.referencedSources)
                        .slice(-1)[0]
                        ?.referencedSources?.map((src, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-neutral-50 border border-neutral-200 hover:border-neutral-900 rounded-xl text-left cursor-pointer transition group"
                            onClick={() => {
                              const found = items.find((i) => i.title.toLowerCase().includes(src.title.toLowerCase().substring(0, 10)));
                              if (found) {
                                setSelectedItemId(found.id);
                                setCurrentTab('Overview');
                                showToast(`Loaded referenced sheet: ${src.title}`);
                              } else {
                                showToast(`Original source reference: ${src.title}`);
                              }
                            }}
                          >
                            <div className="flex items-center space-x-1.5 text-[9px] text-neutral-900 font-bold mb-1 font-mono uppercase">
                              {src.type === 'video' ? (
                                <Play className="w-3 h-3 text-red-500" />
                              ) : src.type === 'pdf' ? (
                                <BookOpen className="w-3 h-3 text-purple-500" />
                              ) : (
                                <FileText className="w-3 h-3 text-neutral-900" />
                              )}
                              <span>{src.source}</span>
                            </div>
                            <h5 className="font-semibold text-[11px] text-neutral-800 leading-snug line-clamp-2 group-hover:text-neutral-950 transition">
                              {src.title}
                            </h5>
                          </div>
                        )) || (
                        <div className="text-[10px] text-neutral-400 py-6 text-center border border-dashed border-neutral-200 rounded-xl">
                          No query search citations active.
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-bold font-mono uppercase tracking-widest text-neutral-400 mb-3">Explore hashtags</div>
                    <div className="flex flex-wrap gap-1.5">
                      {['#Startups', '#AI Tools', '#PDF Papers', '#Volumetric', '#Kernel Quant', '#Reasoning Pipelines'].map((tag) => (
                        <button
                          key={tag}
                          onClick={() => {
                            const term = tag.replace('#', '');
                            setChatInput(`Find elements about "${term}"`);
                            showToast(`Search form updated to ${tag}`);
                          }}
                          className="text-[10px] bg-neutral-100 hover:bg-neutral-200 text-neutral-600 font-mono px-2.5 py-1 rounded-lg transition"
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="border-t border-neutral-150 pt-4 text-center select-none">
                  <p className="text-[9px] text-neutral-400 font-mono leading-relaxed uppercase">Memora Studio Edition &bull; TLS SECURE</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <AnimatePresence>
        {showCaptureModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                resetCaptureState();
                setShowCaptureModal(false);
              }}
              className="absolute inset-0 bg-neutral-950"
            />

            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 10 }}
              className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 overflow-hidden z-10 border border-neutral-200 text-left select-none"
            >
              <div className="flex justify-between items-center mb-5 border-b border-neutral-150 pb-3">
                <BrandLockup size="sm" subtitle="AI SECOND BRAIN" />
                <button
                  onClick={() => {
                    resetCaptureState();
                    setShowCaptureModal(false);
                  }}
                  className="p-1 rounded-full text-neutral-400 hover:text-neutral-900 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCaptureSubmit} className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold font-mono text-neutral-400 uppercase tracking-widest mb-2">Classification Category</label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {[
                      { val: 'Articles', label: 'Article', icon: FileText },
                      { val: 'Videos', label: 'Video', icon: Play },
                      { val: 'PDFs', label: 'PDF Paper', icon: BookOpen },
                      { val: 'Images', label: 'Screenshot', icon: ImageIcon },
                      { val: 'Social Links', label: 'Social link', icon: Globe },
                      { val: 'Voice Notes', label: 'Memo', icon: Mic },
                    ].map((btn) => (
                      <button
                        key={btn.val}
                        type="button"
                        onClick={() => {
                          setCaptureType(btn.val as 'Videos' | 'Articles' | 'PDFs' | 'Social Links' | 'Voice Notes' | 'Images');
                          resetCaptureState();
                        }}
                        className={cn(
                          'py-2 px-1 text-[10px] font-bold rounded-lg border flex flex-col items-center gap-1.5 transition text-center',
                          captureType === btn.val ? 'bg-neutral-100 text-neutral-900 border-neutral-900' : 'bg-white text-neutral-500 border-neutral-200 hover:bg-neutral-50'
                        )}
                      >
                        <btn.icon className="w-3.5 h-3.5" />
                        <span>{btn.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {captureType === 'PDFs' ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold font-mono text-neutral-400 uppercase tracking-widest mb-1.5">PDF Upload (Accepts uploaded paper files)</label>
                      <div className="border-2 border-dashed border-neutral-200/80 rounded-xl p-6 bg-neutral-50 hover:bg-neutral-100/50 transition text-center relative group">
                        <input type="file" accept=".pdf" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        <div className="space-y-2">
                          <BookOpen className="w-8 h-8 text-neutral-400 mx-auto" />
                          <div className="text-xs font-semibold text-neutral-700">{uploadFile ? uploadFile.name : 'Click or drag your PDF here'}</div>
                          <p className="text-[10px] text-neutral-400 font-mono">
                            {uploadFile ? `${(uploadFile.size / 1024 / 1024).toFixed(2)} MB` : 'File will be transcribed and categorized by Gemini'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold font-mono text-neutral-400 uppercase tracking-widest mb-1.5">Supplementary Notes or URL (Optional)</label>
                      <input
                        type="url"
                        placeholder={captureCopy.PDFs.sourcePlaceholder}
                        value={captureUrl}
                        onChange={(e) => setCaptureUrl(e.target.value)}
                        className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs placeholder-neutral-400 focus:bg-white focus:outline-none focus:border-neutral-950 transition mb-2"
                      />
                      <textarea
                        rows={2}
                        placeholder={captureCopy.PDFs.textPlaceholder}
                        value={captureContent}
                        onChange={(e) => setCaptureContent(e.target.value)}
                        className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs placeholder-neutral-400 focus:bg-white focus:outline-none focus:border-neutral-950 transition"
                      />
                    </div>
                  </div>
                ) : captureType === 'Images' ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold font-mono text-neutral-400 uppercase tracking-widest mb-1.5">Screenshot or Image Upload</label>
                      <div className="border-2 border-dashed border-neutral-200/80 rounded-xl p-6 bg-neutral-50 hover:bg-neutral-100/50 transition text-center relative group">
                        <input type="file" accept="image/*" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                        <div className="space-y-2">
                          <ImageIcon className="w-8 h-8 text-neutral-400 mx-auto" />
                          <div className="text-xs font-semibold text-neutral-700">{uploadFile ? uploadFile.name : 'Click or drag your screenshot here'}</div>
                          <p className="text-[10px] text-neutral-400 font-mono">
                            {uploadFile ? `${(uploadFile.size / 1024 / 1024).toFixed(2)} MB` : 'Private image capture with AI summary and tags'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold font-mono text-neutral-400 uppercase tracking-widest mb-1.5">Reference URL (Optional)</label>
                      <input
                        type="url"
                        placeholder={captureCopy.Images.sourcePlaceholder}
                        value={captureUrl}
                        onChange={(e) => setCaptureUrl(e.target.value)}
                        className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs placeholder-neutral-400 focus:bg-white focus:outline-none focus:border-neutral-950 transition mb-2"
                      />
                      <textarea
                        rows={2}
                        placeholder={captureCopy.Images.textPlaceholder}
                        value={captureContent}
                        onChange={(e) => setCaptureContent(e.target.value)}
                        className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs placeholder-neutral-400 focus:bg-white focus:outline-none focus:border-neutral-950 transition"
                      />
                    </div>
                  </div>
                ) : captureType === 'Voice Notes' ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold font-mono text-neutral-400 uppercase tracking-widest mb-1.5">Voice Memo Recorder & Upload</label>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="border border-neutral-200 rounded-xl p-4 bg-neutral-55 flex flex-col justify-center items-center text-center">
                          <span className="text-[9px] font-extrabold font-mono text-neutral-400 uppercase tracking-wider mb-2">LIVE MICROPHONE</span>

                          {isRecording ? (
                            <div className="space-y-3">
                              <div className="flex items-center justify-center space-x-2">
                                <span className="w-2.5 h-2.5 bg-red-600 rounded-full animate-ping" />
                                <span className="font-mono text-xs font-semibold text-neutral-900">
                                  {Math.floor(recordingDuration / 60)}:{(recordingDuration % 60).toString().padStart(2, '0')}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={stopVoiceRecording}
                                className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs px-4 py-2 rounded-lg transition hover:scale-105 active:scale-95 flex items-center justify-center space-x-1 shadow-sm mx-auto"
                              >
                                <span>Stop Recording</span>
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <button
                                type="button"
                                onClick={startVoiceRecording}
                                className="w-10 h-10 bg-neutral-900 hover:bg-neutral-800 text-white rounded-full flex items-center justify-center transition shadow-sm mx-auto hover:scale-105"
                              >
                                <Mic className="w-4 h-4 text-white" />
                              </button>
                              <div className="text-[10px] font-semibold text-neutral-700">Record Live Thought</div>
                            </div>
                          )}

                          {recorderUrl && (
                            <div className="mt-3 w-full space-y-1">
                              <span className="text-[8px] font-bold text-neutral-400 font-mono tracking-widest block">REPLAY RECORDED</span>
                              <audio src={recorderUrl} controls className="w-full h-8 rounded accent-neutral-900" />
                            </div>
                          )}
                        </div>

                        <div className="border border-neutral-200 rounded-xl p-4 bg-neutral-55 flex flex-col justify-center items-center text-center relative cursor-pointer min-h-[140px] hover:bg-neutral-50 transition">
                          <span className="text-[9px] font-extrabold font-mono text-neutral-400 uppercase tracking-wider mb-2">UPLOAD AUDIO (MP3)</span>
                          <input type="file" accept="audio/*" onChange={handleFileChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                          <Mic className="w-6 h-6 text-neutral-400 mb-2" />
                          <div className="text-[10px] font-semibold text-neutral-700">{uploadFile ? uploadFile.name : 'Select MP3 File'}</div>
                          {uploadFile && <p className="text-[9px] text-neutral-400 font-mono">{`${(uploadFile.size / 1024 / 1024).toFixed(2)} MB`}</p>}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold font-mono text-neutral-400 uppercase tracking-widest mb-1.5">Title or Brief Notes</label>
                      <input
                        type="text"
                        placeholder={captureCopy['Voice Notes'].textPlaceholder}
                        value={captureContent}
                        onChange={(e) => setCaptureContent(e.target.value)}
                        className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs placeholder-neutral-400 focus:bg-white focus:outline-none focus:border-neutral-950 transition"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold font-mono text-neutral-400 uppercase tracking-widest mb-1.5">
                        {activeCaptureCopy.sourceLabel}
                      </label>
                      <input
                        type="url"
                        placeholder={activeCaptureCopy.sourcePlaceholder}
                        value={captureUrl}
                        onChange={(e) => setCaptureUrl(e.target.value)}
                        className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs placeholder-neutral-400 focus:bg-white focus:outline-none focus:border-neutral-950 transition"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold font-mono text-neutral-400 uppercase tracking-widest mb-1.5">
                        {activeCaptureCopy.textLabel}
                      </label>
                      <textarea
                        rows={4}
                        placeholder={activeCaptureCopy.textPlaceholder}
                        value={captureContent}
                        onChange={(e) => setCaptureContent(e.target.value)}
                        className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-xs placeholder-neutral-400 focus:bg-white focus:outline-none focus:border-neutral-950 transition"
                      />
                    </div>
                  </div>
                )}

                <div className="pt-3 flex justify-end space-x-2 border-t border-neutral-150">
                  <button
                    type="button"
                        onClick={() => {
                          resetCaptureState();
                          setShowCaptureModal(false);
                        }}
                        className="text-xs font-semibold px-4.5 py-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-700 transition"
                      >
                        Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isGenerating || (!captureContent && !captureUrl && !uploadFileBase64)}
                    className="bg-neutral-900 text-white text-xs font-semibold px-6 py-2 rounded-lg hover:bg-neutral-800 disabled:opacity-45 transition flex items-center space-x-2"
                  >
                    {isGenerating ? (
                      <>
                        <LoaderIcon className="w-3.5 h-3.5 animate-spin" />
                        <span>AI Synthesizing...</span>
                      </>
                    ) : (
                      <>
                        <span>Add to Brain</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LoaderIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin h-5 w-5', className)} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
