'use client';

import * as React from 'react';
import { motion } from 'motion/react';
import { Activity, ArrowRight, Bookmark, Inbox, LoaderCircle, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react';
import { KnowledgeItem } from '@/lib/db';
import { matchesSearch } from '@/lib/supabase/vault';
import { cn } from '@/lib/utils';
import { FormattedMarkdown } from './formatted-markdown';

type VaultContentPanelProps = {
  currentTab: 'Overview' | 'Bookmarks' | 'Trash' | 'Articles' | 'Videos' | 'PDFs' | 'Social Links' | 'Voice Notes' | 'Images';
  items: KnowledgeItem[];
  isTrashView: boolean;
  searchQuery: string;
  selectedItemId: string;
  inlineInput: string;
  isInlineGenerating: boolean;
  localAskQuery: string;
  localAskAnswer: string | null;
  localAskLoading: boolean;
  onInlineInputChange: (value: string) => void;
  onLocalAskQueryChange: (value: string) => void;
  onInlineCapture: (event: React.FormEvent) => void;
  onRunLocalAskAI: (event: React.FormEvent) => void;
  onClearLocalAskAnswer: () => void;
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
  searchQuery,
  selectedItemId,
  inlineInput,
  isInlineGenerating,
  localAskQuery,
  localAskAnswer,
  localAskLoading,
  onInlineInputChange,
  onLocalAskQueryChange,
  onInlineCapture,
  onRunLocalAskAI,
  onClearLocalAskAnswer,
  onSelectItem,
  onToggleBookmark,
  onDeleteItem,
  onRestoreItem,
  onPermanentDeleteItem,
  onRetryItem,
}: VaultContentPanelProps) {
  const filteredItems = React.useMemo(
    () =>
      items.filter((item) => {
        const matchesTab =
          currentTab === 'Overview'
            ? !item.deletedAt
            : currentTab === 'Bookmarks'
              ? !item.deletedAt && !!item.bookmarked
              : currentTab === 'Trash'
                ? !!item.deletedAt
                : !item.deletedAt && item.type === currentTab;
        const matchesQuery = !searchQuery.trim() || matchesSearch(item, searchQuery);
        return matchesTab && matchesQuery;
      }),
    [currentTab, items, searchQuery]
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
        const createdAt = new Date(item.createdAtDate);
        return createdAt >= date && createdAt < nextDate;
      }).length;

      return {
        label: labels[date.getDay()],
        count,
      };
    });

    const maxCount = dailyCounts.reduce((currentMax, entry) => Math.max(currentMax, entry.count), 0);

    return dailyCounts.map((entry) => ({
      ...entry,
      height: maxCount === 0 ? 8 : Math.max(8, Math.round((entry.count / maxCount) * 100)),
    }));
  }, [items]);

  return (
    <div className="flex-1 flex flex-col overflow-y-auto px-6 py-6 border-r border-neutral-200/80 bg-[#fafafc]">
      <div className="flex justify-between items-center mb-6">
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
      </div>

      {currentTab === 'Overview' && (
        <form
          onSubmit={onInlineCapture}
          className="bg-white border border-neutral-200/90 rounded-xl p-1.5 flex gap-2 items-center mb-6 shadow-sm hover:border-neutral-300 focus-within:border-neutral-950 transition"
        >
          <Inbox className="w-4 h-4 text-neutral-400 shrink-0 ml-3" />
          <input
            type="text"
            placeholder="Fast save: paste a YouTube link, social link, research paper, or note..."
            value={inlineInput}
            onChange={(e) => onInlineInputChange(e.target.value)}
            className="flex-1 bg-transparent border-none text-xs text-neutral-800 placeholder-neutral-400 focus:outline-none py-1.5"
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

      {currentTab === 'Overview' && (
        <>
          <form
            onSubmit={onRunLocalAskAI}
            className="bg-emerald-50/50 border border-emerald-150/70 p-3 rounded-xl mb-6 flex gap-3 items-center text-left"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-550 shrink-0 ml-1 block" />
            <span className="text-[10px] font-bold font-mono text-emerald-700 uppercase tracking-widest block shrink-0 select-none">
              Brain Search:
            </span>
            <input
              type="text"
              placeholder='Ask instant questions across these overview items... e.g., "What was the supply chain idea?"'
              value={localAskQuery}
              onChange={(e) => onLocalAskQueryChange(e.target.value)}
              className="flex-1 bg-transparent border-none text-xs text-neutral-800 placeholder-emerald-700/50 focus:outline-none"
            />
            <button
              type="submit"
              disabled={localAskLoading || !localAskQuery.trim()}
              className="bg-neutral-900 text-white font-mono text-[10px] px-3.5 py-1 rounded-lg transition hover:bg-neutral-800 disabled:opacity-50"
            >
              {localAskLoading ? 'CONSULTING...' : 'QUERY'}
            </button>
          </form>

          {localAskAnswer && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#2a2c30] text-neutral-200 outline outline-1 outline-neutral-800 p-5 rounded-xl text-left relative mt-1 mb-6 shadow-xl"
            >
              <button onClick={onClearLocalAskAnswer} className="absolute top-3.5 right-3.5 p-1 text-neutral-400 hover:text-white transition">
                <X className="w-4 h-4" />
              </button>
              <h5 className="text-[9px] font-bold uppercase tracking-wider text-amber-400 font-mono mb-2">
                Local brain compilation results:
              </h5>
              <div className="text-xs leading-relaxed text-neutral-300 font-normal">
                <FormattedMarkdown text={localAskAnswer} />
              </div>
            </motion.div>
          )}
        </>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {filteredItems.map((item) => {
          const isSelected = selectedItemId === item.id;

          return (
            <motion.div
              key={item.id}
              onClick={() => onSelectItem(item.id)}
              className={cn(
                'bg-white border rounded-xl p-5 text-left cursor-pointer transition relative flex flex-col justify-between group',
                isSelected ? 'ring-1.5 ring-neutral-900 border-transparent shadow shadow-neutral-100' : 'border-neutral-200 hover:border-neutral-300 shadow-sm'
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

              <div className="space-y-1.5">
                <h3 className="font-bold text-xs text-neutral-900 leading-snug line-clamp-2">{item.title}</h3>
                <p className="text-neutral-500 text-[11px] leading-relaxed line-clamp-3">{item.summary}</p>
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

              <div className="flex flex-wrap items-center gap-1.5 pt-4 mt-auto border-t border-neutral-105/10">
                <span className="text-[10px] text-neutral-400 font-mono tracking-widest uppercase shrink-0">{item.source}</span>
                <span className="text-neutral-300 select-none text-[10px]">&bull;</span>
                <span className="text-[10.5px] text-neutral-400 font-mono">{item.readTime || '3 min'}</span>
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

      {currentTab === 'Overview' && (
        <div className="mt-10 pt-6 border-t border-[#e2e2ec] text-left select-none">
          <div className="flex items-center space-x-2 text-neutral-400 uppercase text-[10px] tracking-widest font-mono font-bold mb-4">
            <Activity className="w-4 h-4 text-neutral-900" />
            <span>Activity Pulse</span>
          </div>

          <div className="bg-white border border-neutral-200/90 rounded-xl p-5 flex flex-col md:flex-row gap-6 justify-between items-center shadow-xs">
            <div className="space-y-1 md:w-1/3">
              <div className="text-2xl font-bold tracking-tight text-neutral-900 leading-none">{items.length}</div>
              <p className="text-[10px] text-neutral-400 font-mono uppercase tracking-wider">active second mind assets</p>
              <p className="text-[11px] text-neutral-500 max-w-xs">Dynamic count of notes, links, PDFs, images, audio, and saved research assets indexed.</p>
            </div>

            <div className="flex-1 w-full bg-neutral-50/50 p-3 rounded-lg flex flex-col justify-between">
              <div className="w-full flex justify-between items-end h-12 px-1">
                {weeklyActivity.map((entry) => (
                  <div key={entry.label} className="flex flex-col items-center flex-1">
                    <div
                      className="w-3 rounded-t-sm transition-all duration-300 bg-neutral-200 hover:bg-neutral-900 min-h-[4px]"
                      style={{ height: `${entry.height}%` }}
                      title={`${entry.count} addition${entry.count === 1 ? '' : 's'}`}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[8px] font-mono leading-none tracking-widest text-neutral-400 px-1 border-t border-neutral-150 pt-2 mt-1">
                {weeklyActivity.map((entry) => (
                  <span key={entry.label}>{entry.label}</span>
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
