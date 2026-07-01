'use client';

import * as React from 'react';
import Fuse from 'fuse.js';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import { motion } from 'motion/react';
import { Activity, ArrowRight, Bookmark, ChevronDown, Inbox, LoaderCircle, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react';
import { ChatPreviewResult, ChatReferencedSource, KnowledgeItem } from '@/lib/db';
import { cn } from '@/lib/utils';
import { FormattedMarkdown } from './formatted-markdown';

type VaultContentPanelProps = {
  currentTab: 'Overview' | 'Bookmarks' | 'Trash' | 'Articles' | 'Videos' | 'PDFs' | 'Social Links' | 'Voice Notes' | 'Images';
  items: KnowledgeItem[];
  isTrashView: boolean;
  isMobile: boolean;
  searchQuery: string;
  filterReferenceTime: number;
  typeFilter: 'All' | KnowledgeItem['type'];
  recencyFilter: 'any' | 'today' | '7d' | '30d' | '90d';
  bookmarkFilter: 'all' | 'bookmarked' | 'unbookmarked';
  selectedItemId: string;
  compactMode: boolean;
  reduceMotion: boolean;
  inlineInput: string;
  isInlineGenerating: boolean;
  localAskQuery: string;
  localAskResult: ChatPreviewResult | null;
  localAskLoading: boolean;
  onInlineInputChange: (value: string) => void;
  onLocalAskQueryChange: (value: string) => void;
  onTypeFilterChange: (value: 'All' | KnowledgeItem['type']) => void;
  onRecencyFilterChange: (value: 'any' | 'today' | '7d' | '30d' | '90d') => void;
  onBookmarkFilterChange: (value: 'all' | 'bookmarked' | 'unbookmarked') => void;
  onInlineCapture: (event: React.FormEvent) => void;
  onRunLocalAskAI: (event: React.FormEvent) => void;
  onClearLocalAskAnswer: () => void;
  onOpenReferencedItem: (source: ChatReferencedSource) => void;
  onSelectItem: (id: string) => void;
  onToggleBookmark: (id: string, currentStatus: boolean, event?: React.MouseEvent) => void;
  onDeleteItem: (id: string, event: React.MouseEvent) => void;
  onRestoreItem: (id: string, event: React.MouseEvent) => void;
  onPermanentDeleteItem: (id: string, event: React.MouseEvent) => void;
  onRetryItem: (id: string, event: React.MouseEvent) => void;
};

export function VaultContentPanel({
  currentTab,
  items,
  isTrashView,
  isMobile,
  searchQuery,
  filterReferenceTime,
  typeFilter,
  recencyFilter,
  bookmarkFilter,
  selectedItemId,
  compactMode,
  reduceMotion,
  inlineInput,
  isInlineGenerating,
  localAskQuery,
  localAskResult,
  localAskLoading,
  onInlineInputChange,
  onLocalAskQueryChange,
  onTypeFilterChange,
  onRecencyFilterChange,
  onBookmarkFilterChange,
  onInlineCapture,
  onRunLocalAskAI,
  onClearLocalAskAnswer,
  onOpenReferencedItem,
  onSelectItem,
  onToggleBookmark,
  onDeleteItem,
  onRestoreItem,
  onPermanentDeleteItem,
  onRetryItem,
}: VaultContentPanelProps) {
  const [isFiltersOpen, setIsFiltersOpen] = React.useState(false);
  const [listAutoAnimateRef] = useAutoAnimate<HTMLDivElement>();
  const itemTabs: KnowledgeItem['type'][] = ['Articles', 'Videos', 'PDFs', 'Images', 'Social Links', 'Voice Notes'];
  const effectiveTypeFilter = itemTabs.includes(currentTab as KnowledgeItem['type'])
    ? (currentTab as KnowledgeItem['type'])
    : typeFilter === 'All'
      ? null
      : typeFilter;
  const effectiveBookmarkFilter = currentTab === 'Bookmarks' ? 'bookmarked' : bookmarkFilter;

  const filteredItems = React.useMemo(
    () => {
      const baseItems = items.filter((item) => {
        const matchesTab =
          currentTab === 'Overview'
            ? !item.deletedAt
            : currentTab === 'Bookmarks'
              ? !item.deletedAt && !!item.bookmarked
              : currentTab === 'Trash'
                ? !!item.deletedAt
                : !item.deletedAt && item.type === currentTab;
        const matchesType = !effectiveTypeFilter || item.type === effectiveTypeFilter;
        const matchesBookmark =
          effectiveBookmarkFilter === 'all'
            ? true
            : effectiveBookmarkFilter === 'bookmarked'
              ? !!item.bookmarked
              : !item.bookmarked;
        const itemAgeMs = filterReferenceTime - new Date(item.createdAtDate).getTime();
        const matchesRecency =
          recencyFilter === 'any'
            ? true
            : recencyFilter === 'today'
              ? itemAgeMs <= 24 * 60 * 60 * 1000
              : recencyFilter === '7d'
                ? itemAgeMs <= 7 * 24 * 60 * 60 * 1000
                : recencyFilter === '30d'
                  ? itemAgeMs <= 30 * 24 * 60 * 60 * 1000
                  : itemAgeMs <= 90 * 24 * 60 * 60 * 1000;
        return matchesTab && matchesType && matchesBookmark && matchesRecency;
      });

      const normalizedQuery = searchQuery.trim();
      if (!normalizedQuery) {
        return baseItems;
      }

      const fuse = new Fuse(baseItems, {
        threshold: 0.34,
        ignoreLocation: true,
        minMatchCharLength: 2,
        keys: [
          { name: 'title', weight: 0.35 },
          { name: 'summary', weight: 0.24 },
          { name: 'content', weight: 0.18 },
          { name: 'extractedText', weight: 0.14 },
          { name: 'source', weight: 0.08 },
          { name: 'author', weight: 0.04 },
          { name: 'tags', weight: 0.16 },
        ],
      });

      return fuse.search(normalizedQuery).map((result) => result.item);
    },
    [currentTab, effectiveBookmarkFilter, effectiveTypeFilter, filterReferenceTime, items, recencyFilter, searchQuery]
  );

  const weeklyActivity = React.useMemo(() => {
    const today = new Date();
    const labels = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const dailyCounts = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setHours(0, 0, 0, 0);
      date.setDate(today.getDate() - (6 - index));

      const nextDate = new Date(date);
      nextDate.setDate(date.getDate() + 1);

      const count = items.filter((item) => {
        if (item.deletedAt) {
          return false;
        }

        const createdAt = new Date(item.createdAtDate);
        return createdAt >= date && createdAt < nextDate;
      }).length;

      return {
        label: labels[date.getDay()],
        count,
        dateLabel: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      };
    });

    const maxCount = dailyCounts.reduce((currentMax, entry) => Math.max(currentMax, entry.count), 0);
    const total = dailyCounts.reduce((sum, entry) => sum + entry.count, 0);
    const busiestDay = dailyCounts.reduce((top, entry) => (entry.count > top.count ? entry : top), dailyCounts[0]);

    return {
      points: dailyCounts.map((entry) => ({
        ...entry,
        heightPx: maxCount === 0 ? 8 : Math.max(8, Math.round((entry.count / maxCount) * 72)),
      })),
      total,
      maxCount,
      busiestDay,
    };
  }, [items]);

  return (
    <div
      className={cn(
        'app-scrollbar flex flex-1 flex-col overflow-y-auto bg-[#fafafc]',
        isMobile ? 'border-r-0 px-4 py-4' : 'border-r border-neutral-200/80',
        !isMobile && (compactMode ? 'px-4 py-4' : 'px-6 py-6')
      )}
    >
      <div className={cn('flex items-center justify-between', compactMode ? 'mb-4' : 'mb-6')}>
        <div>
          <h2 className="text-base font-bold tracking-tight text-neutral-900">
            {currentTab === 'Overview'
              ? 'Your Personal Vault'
              : currentTab === 'Bookmarks'
                ? 'Bookmarked Items'
                : currentTab === 'Trash'
                  ? 'Trash Recovery'
                  : `Saved ${currentTab}`}
          </h2>
          <p className="text-neutral-500 text-[11px] font-medium leading-relaxed font-mono">
            {filteredItems.length} total elements saved
          </p>
        </div>

        {currentTab === 'Overview' && (
          <button
            type="button"
            onClick={() => setIsFiltersOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-700 shadow-sm transition hover:border-neutral-300 hover:text-neutral-950"
          >
            <span>Filters</span>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-mono tracking-normal text-neutral-500">{filteredItems.length}</span>
            <ChevronDown className={cn('h-3.5 w-3.5 transition', isFiltersOpen ? 'rotate-180' : '')} />
          </button>
        )}
      </div>

      {currentTab === 'Overview' && isFiltersOpen && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 rounded-2xl border border-neutral-200/90 bg-white p-3 shadow-sm"
        >
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <label className="space-y-1 text-left">
              <span className="block text-[9px] font-bold font-mono uppercase tracking-wider text-neutral-400">Type</span>
              <select
                value={effectiveTypeFilter ?? 'All'}
                onChange={(e) => onTypeFilterChange(e.target.value as 'All' | KnowledgeItem['type'])}
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-[11px] text-neutral-800 focus:border-neutral-900 focus:bg-white focus:outline-none"
              >
                <option value="All">All capture types</option>
                {itemTabs.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-left">
              <span className="block text-[9px] font-bold font-mono uppercase tracking-wider text-neutral-400">Recency</span>
              <select
                value={recencyFilter}
                onChange={(e) => onRecencyFilterChange(e.target.value as 'any' | 'today' | '7d' | '30d' | '90d')}
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-[11px] text-neutral-800 focus:border-neutral-900 focus:bg-white focus:outline-none"
              >
                <option value="any">All time</option>
                <option value="today">Today</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
            </label>

            <label className="space-y-1 text-left">
              <span className="block text-[9px] font-bold font-mono uppercase tracking-wider text-neutral-400">Bookmarks</span>
              <select
                value={effectiveBookmarkFilter}
                onChange={(e) => onBookmarkFilterChange(e.target.value as 'all' | 'bookmarked' | 'unbookmarked')}
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 text-[11px] text-neutral-800 focus:border-neutral-900 focus:bg-white focus:outline-none"
              >
                <option value="all">All items</option>
                <option value="bookmarked">Bookmarked only</option>
                <option value="unbookmarked">Not bookmarked</option>
              </select>
            </label>
          </div>
        </motion.div>
      )}

      {currentTab === 'Overview' && (
        <form
          onSubmit={onInlineCapture}
          className={cn(
            'mb-6 flex items-center gap-2 rounded-xl border border-neutral-200/90 bg-white shadow-sm transition hover:border-neutral-300 focus-within:border-neutral-950',
            compactMode ? 'p-1' : 'p-1.5'
          )}
        >
          <Inbox className="w-4 h-4 text-neutral-400 shrink-0 ml-3" />
          <input
            type="text"
            placeholder="Fast save: paste a YouTube link, social link, research paper, or note..."
            value={inlineInput}
            onChange={(e) => onInlineInputChange(e.target.value)}
            className="memora-flat-input min-w-0 flex-1 appearance-none border-0 bg-transparent py-1.5 text-xs text-neutral-800 placeholder-neutral-400 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0"
          />
          <button
            type="submit"
            disabled={isInlineGenerating || !inlineInput.trim()}
            className="bg-neutral-900 text-white px-4 py-1.5 rounded-lg text-[10px] font-bold font-mono tracking-wider uppercase flex items-center space-x-1 hover:bg-neutral-800 disabled:opacity-40 shrink-0 transition"
          >
            {isInlineGenerating ? (
              <>
                <LoaderIcon className="w-3 h-3 animate-spin" />
                <span>PROCESSING...</span>
              </>
            ) : (
              <>
                <span>ADD VIA AI</span>
                <ArrowRight className="w-3 h-3" />
              </>
            )}
          </button>
        </form>
      )}

      {currentTab === 'Overview' && !isMobile && (
        <>
          <form
            onSubmit={onRunLocalAskAI}
            className={cn(
              'mb-6 flex flex-col gap-3 rounded-xl border border-emerald-150/70 bg-emerald-50/50 text-left md:flex-row md:items-center',
              compactMode ? 'p-2.5' : 'p-3'
            )}
          >
            <div className="flex items-center gap-2 md:shrink-0">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-550 shrink-0 block" />
              <span className="text-[10px] font-bold font-mono text-emerald-700 uppercase tracking-widest block select-none">
                Brain Search:
              </span>
            </div>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <input
                type="text"
                placeholder='Ask instant questions across these overview items... e.g., "What was the supply chain idea?"'
                value={localAskQuery}
                onChange={(e) => onLocalAskQueryChange(e.target.value)}
                className="memora-flat-input min-w-0 flex-1 appearance-none border-0 bg-transparent text-xs text-neutral-800 placeholder-emerald-700/50 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0"
              />
              <button
                type="submit"
                disabled={localAskLoading || !localAskQuery.trim()}
                className="shrink-0 rounded-lg bg-neutral-900 px-3.5 py-1 text-[10px] font-mono text-white transition hover:bg-neutral-800 disabled:opacity-50"
              >
                {localAskLoading ? 'CONSULTING...' : 'QUERY'}
              </button>
            </div>
          </form>

          {localAskResult && (
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative mt-1 mb-6 rounded-xl border border-neutral-200 bg-white p-5 text-left shadow-sm"
            >
              <button onClick={onClearLocalAskAnswer} className="absolute top-3.5 right-3.5 p-1 text-neutral-400 transition hover:text-neutral-700">
                <X className="w-4 h-4" />
              </button>
              <h5 className="mb-2 font-mono text-[9px] font-bold uppercase tracking-wider text-neutral-500">
                Local brain compilation results:
              </h5>
              <div className="text-xs font-normal leading-relaxed text-neutral-700">
                <FormattedMarkdown text={localAskResult.answer} />
              </div>
              {localAskResult.summaryBlock && (
                <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                  <div className="mb-2 font-mono text-[9px] font-bold uppercase tracking-wider text-neutral-500">Detailed synthesis</div>
                  <div className="text-xs leading-relaxed text-neutral-700">
                    <FormattedMarkdown text={localAskResult.summaryBlock} />
                  </div>
                </div>
              )}
              {localAskResult.referencedSources && localAskResult.referencedSources.length > 0 && (
                <div className="mt-4 space-y-2">
                  <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-neutral-500">Attached references</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {localAskResult.referencedSources.map((source, index) => (
                      <button
                        key={`${source.itemId ?? source.title}-${index}`}
                        type="button"
                        onClick={() => onOpenReferencedItem(source)}
                        className="rounded-xl border border-neutral-200 bg-white p-3 text-left transition hover:border-neutral-300 hover:bg-neutral-50"
                      >
                        <div className="font-mono text-[9px] font-bold uppercase tracking-wider text-neutral-500">{source.source}</div>
                        <div className="mt-1 text-[11px] font-semibold leading-snug text-neutral-800">{source.title}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {localAskResult.tags && localAskResult.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {localAskResult.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-neutral-100 px-2 py-1 text-[9px] font-mono text-neutral-600">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </>
      )}

      <div
        ref={listAutoAnimateRef}
        className={cn(
          'grid gap-4',
          isMobile ? 'grid-cols-1' : compactMode ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'
        )}
      >
        {filteredItems.map((item) => {
          const isSelected = selectedItemId === item.id;
          const providerLabel = item.previewMetadata?.provider || item.source || item.previewMetadata?.sourceUrl || 'Saved source';
          const creatorLabel = item.author || item.previewMetadata?.authorName || '';
          const metaLabel = creatorLabel ? `${providerLabel} | ${creatorLabel}` : providerLabel;

          return (
            <motion.div
              key={item.id}
              onClick={() => onSelectItem(item.id)}
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              whileHover={reduceMotion ? undefined : { y: -3 }}
              className={cn(
                'memora-soft-outline relative flex cursor-pointer flex-col justify-between rounded-xl border bg-white text-left transition-premium group',
                compactMode ? 'p-4' : 'p-5',
                isSelected ? 'memora-selected-card' : 'border-neutral-200 hover:border-neutral-300 shadow-sm'
              )}
            >
              <div className="flex justify-between items-start mb-3">
                <span
                  className={cn(
                    'text-[9px] font-bold font-mono tracking-wider uppercase px-2 py-0.5 rounded border',
                    item.type === 'Videos'
                      ? 'bg-red-50 text-red-600 border-red-100'
                      : item.type === 'Articles'
                        ? 'bg-indigo-50 text-indigo-600 border-indigo-100'
                        : item.type === 'PDFs'
                          ? 'bg-purple-50 text-purple-600 border-purple-100'
                          : item.type === 'Images'
                            ? 'bg-amber-50 text-amber-700 border-amber-100'
                          : item.type === 'Social Links'
                            ? 'bg-sky-50 text-sky-600 border-sky-100'
                            : 'bg-[#f0fdf4] text-emerald-600 border-emerald-100'
                  )}
                >
                  {item.type === 'Voice Notes' ? 'Voice memo' : item.type}
                </span>

                <div className="flex items-center space-x-1.5 opacity-100 transition shrink-0 z-10">
                  {!isTrashView && item.processingStatus === 'failed' && (
                    <button
                      onClick={(e) => onRetryItem(item.id, e)}
                      className="text-amber-600 hover:text-amber-700 p-0.5"
                      title="Retry processing"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={(e) => onToggleBookmark(item.id, !!item.bookmarked, e)}
                    className="text-neutral-400 hover:text-neutral-900 p-0.5"
                    title="Bookmark asset"
                  >
                    <Bookmark className={cn('w-3.5 h-3.5', item.bookmarked ? 'fill-neutral-900 text-neutral-900' : 'text-neutral-300')} />
                  </button>
                  {isTrashView ? (
                    <>
                      <button
                        onClick={(e) => onRestoreItem(item.id, e)}
                        className="text-neutral-400 hover:text-emerald-600 p-0.5"
                        title="Restore entry"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => onPermanentDeleteItem(item.id, e)}
                        className="text-neutral-400 hover:text-red-500 p-0.5"
                        title="Delete forever"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={(e) => onDeleteItem(item.id, e)}
                      className="text-neutral-400 hover:text-red-500 p-0.5"
                      title="Delete entry"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="min-w-0 space-y-1.5">
                <h3 className={cn('font-bold text-neutral-900 leading-snug line-clamp-2', compactMode ? 'text-[11px]' : 'text-xs')}>{item.title}</h3>
                <p className="text-neutral-500 text-[11px] leading-relaxed line-clamp-3">
                  {item.previewMetadata?.description && (item.type === 'Articles' || item.type === 'Social Links')
                    ? item.previewMetadata.description
                    : item.summary}
                </p>
              </div>

              {!isTrashView && item.processingStatus !== 'ready' && item.processingStatus !== 'trashed' && (
                <div
                  className={cn(
                    'mt-3 flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-mono',
                    item.processingStatus === 'failed'
                      ? 'bg-amber-50 text-amber-700 border border-amber-100'
                      : 'bg-neutral-100 text-neutral-600 border border-neutral-200'
                  )}
                >
                  {item.processingStatus === 'failed' ? (
                    <RefreshCw className="w-3 h-3" />
                  ) : (
                    <LoaderCircle className="w-3 h-3 animate-spin" />
                  )}
                  <span>{item.processingStatus === 'failed' ? 'Processing failed. Retry available.' : 'Ingestion in progress.'}</span>
                </div>
              )}

              <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-neutral-105/10 pt-4">
                <span className="line-clamp-2 break-words text-[10px] text-neutral-400 font-mono tracking-wide uppercase">{metaLabel}</span>
              </div>
            </motion.div>
          );
        })}

        {filteredItems.length === 0 && (
          <div className="col-span-full py-16 text-center border border-dashed border-neutral-200 bg-white rounded-xl select-none">
            <Inbox className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
            <p className="text-xs font-semibold text-neutral-600 mb-1">No items discovered in {currentTab}</p>
            <p className="text-[10.5px] text-neutral-400 max-w-xs mx-auto">
              {currentTab === 'Trash'
                ? 'Deleted captures stay here until you restore them back into your active vault.'
                : currentTab === 'Bookmarks'
                  ? 'Bookmark an item from the vault list or detail view to keep it in this section.'
                  : 'Paste research parameters in the bar at the top to auto-synthesize raw content.'}
            </p>
          </div>
        )}
      </div>

      {currentTab === 'Overview' && !isMobile && (
        <div className="mt-10 pt-6 border-t border-[#e2e2ec] text-left select-none">
          <div className="flex items-center space-x-2 text-neutral-400 uppercase text-[10px] tracking-widest font-mono font-bold mb-4">
            <Activity className="w-4 h-4 text-neutral-900" />
            <span>Activity Pulse</span>
          </div>

          <div className="bg-white border border-neutral-200/90 rounded-xl p-5 flex flex-col md:flex-row gap-6 justify-between items-center shadow-xs">
            <div className="space-y-1 md:w-1/3">
              <div className="text-2xl font-bold tracking-tight text-neutral-900 leading-none">{items.filter((item) => !item.deletedAt).length}</div>
              <p className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider">active second mind assets</p>
              <p className="text-[11px] text-neutral-500 max-w-xs">Dynamic count of notes, links, PDFs, images, audio, and saved research assets indexed.</p>
              <div className="pt-2 space-y-1 text-[10px] font-mono text-neutral-400">
                <div>{weeklyActivity.total} captures added in the last 7 days</div>
                <div>
                  Peak day: {weeklyActivity.busiestDay.label} ({weeklyActivity.busiestDay.count})
                </div>
              </div>
            </div>

            <div className="flex-1 w-full bg-neutral-50/50 p-4 rounded-lg border border-neutral-100">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[10px] font-bold font-mono uppercase tracking-widest text-neutral-400">7-day capture chart</div>
                <div className="text-[10px] font-mono text-neutral-400">
                  max {weeklyActivity.maxCount}
                </div>
              </div>

              <div className="w-full flex justify-between items-end h-24 gap-2 px-1">
                {weeklyActivity.points.map((entry) => (
                  <div key={entry.label} className="flex flex-col items-center justify-end flex-1 min-w-0 h-full">
                    <div className="mb-2 text-[9px] font-mono text-neutral-500">{entry.count}</div>
                    <div
                      className="w-full max-w-8 rounded-t-md transition-all duration-300 bg-gradient-to-t from-neutral-900 to-neutral-300 hover:from-neutral-800 hover:to-neutral-500 min-h-[8px]"
                      style={{ height: `${entry.heightPx}px` }}
                      title={`${entry.dateLabel}: ${entry.count} addition${entry.count === 1 ? '' : 's'}`}
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-between text-[8px] font-mono leading-none tracking-widest text-neutral-400 px-1 border-t border-neutral-150 pt-3 mt-3">
                {weeklyActivity.points.map((entry) => (
                  <span key={entry.label} title={entry.dateLabel}>
                    {entry.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
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
