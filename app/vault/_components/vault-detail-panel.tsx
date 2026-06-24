'use client';

/* eslint-disable @next/next/no-img-element */

import * as React from 'react';
import { motion } from 'motion/react';
import { Bookmark, BookOpen, ExternalLink, ImageIcon, Layers, LoaderCircle, Play, RefreshCw, RotateCcw, Trash2, Volume2 } from 'lucide-react';
import { KnowledgeItem } from '@/lib/db';
import { cn } from '@/lib/utils';

type VaultDetailPanelProps = {
  currentItem?: KnowledgeItem;
  isTrashView: boolean;
  flippedCardId: string | null;
  voiceSpeed: number;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onSetVoiceSpeed: (speed: number) => void;
  onFlipCard: (id: string | null) => void;
  onToggleBookmark: (id: string, currentStatus: boolean, event?: React.MouseEvent) => void;
  onDeleteItem: (id: string, event: React.MouseEvent) => void;
  onRestoreItem: (id: string, event: React.MouseEvent) => void;
  onPermanentDeleteItem: (id: string, event: React.MouseEvent) => void;
  onRetryItem: (id: string, event: React.MouseEvent) => void;
};

export function VaultDetailPanel({
  currentItem,
  isTrashView,
  flippedCardId,
  voiceSpeed,
  audioRef,
  onSetVoiceSpeed,
  onFlipCard,
  onToggleBookmark,
  onDeleteItem,
  onRestoreItem,
  onPermanentDeleteItem,
  onRetryItem,
}: VaultDetailPanelProps) {
  if (!currentItem) {
    return (
      <div className="w-full lg:w-96 bg-white shrink-0 border-t lg:border-t-0 border-neutral-200/85 p-6 flex flex-col overflow-y-auto">
        <div className="m-auto text-center py-12 select-none">
          <Layers className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
          <span className="text-xs text-neutral-400 block font-mono">No card focused.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full lg:w-96 bg-white shrink-0 border-t lg:border-t-0 border-neutral-200/85 p-6 flex flex-col overflow-y-auto">
      <div className="space-y-6 text-left select-none">
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2 border-b border-neutral-100 pb-2">
            <span className="text-[10px] font-extrabold uppercase font-mono tracking-widest text-[#52525b]">SYNTHESIS SHEET</span>
            <div className="flex items-center space-x-2.5 flex-wrap">
              {currentItem.url && (
                <a
                  href={currentItem.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] font-bold font-mono text-neutral-800 hover:text-neutral-950 hover:underline flex items-center space-x-0.5"
                >
                  <span>Open</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <button
                onClick={(e) => onToggleBookmark(currentItem.id, !!currentItem.bookmarked, e)}
                className="text-neutral-500 hover:text-neutral-955 flex items-center space-x-0.5 text-[10px] font-mono font-bold"
                title="Bookmark asset"
              >
                <Bookmark className={cn('w-3 h-3', currentItem.bookmarked ? 'fill-neutral-900 text-neutral-900' : 'text-neutral-400')} />
                <span>{currentItem.bookmarked ? 'Saved' : 'Save'}</span>
              </button>
              {isTrashView ? (
                <>
                  <button
                    onClick={(e) => onRestoreItem(currentItem.id, e)}
                    className="text-emerald-700 hover:text-emerald-800 flex items-center space-x-0.5 text-[10px] font-mono font-bold"
                    title="Restore entry"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restore</span>
                  </button>
                  <button
                    onClick={(e) => onPermanentDeleteItem(currentItem.id, e)}
                    className="text-red-650 hover:text-red-705 flex items-center space-x-0.5 text-[10px] font-mono font-bold"
                    title="Delete forever"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete Forever</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={(e) => onDeleteItem(currentItem.id, e)}
                  className="text-red-650 hover:text-red-705 flex items-center space-x-0.5 text-[10px] font-mono font-bold"
                  title="Delete entry"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Delete</span>
                </button>
              )}
              {!isTrashView && currentItem.processingStatus === 'failed' && (
                <button
                  onClick={(e) => onRetryItem(currentItem.id, e)}
                  className="text-amber-700 hover:text-amber-800 flex items-center space-x-0.5 text-[10px] font-mono font-bold"
                  title="Retry processing"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Retry</span>
                </button>
              )}
            </div>
          </div>
          <h3 className="font-extrabold text-neutral-900 text-sm leading-snug">{currentItem.title}</h3>
        </div>

        {!isTrashView && currentItem.processingStatus !== 'ready' && currentItem.processingStatus !== 'trashed' && (
          <div
            className={cn(
              'border rounded-xl p-4 space-y-1.5',
              currentItem.processingStatus === 'failed'
                ? 'bg-amber-50 border-amber-100 text-amber-800'
                : 'bg-neutral-50 border-neutral-200 text-neutral-700'
            )}
          >
            <div className="flex items-center gap-2 text-[10px] font-bold font-mono uppercase tracking-widest">
              {currentItem.processingStatus === 'failed' ? (
                <RefreshCw className="w-3.5 h-3.5" />
              ) : (
                <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
              )}
              <span>{currentItem.processingStatus === 'failed' ? 'Capture needs retry' : 'Capture is processing'}</span>
            </div>
            <p className="text-xs leading-relaxed">
              {currentItem.processingStatus === 'failed'
                ? currentItem.failureReason || 'The capture saved successfully, but synthesis did not finish.'
                : 'The source asset is stored privately in your vault while the ingestion pipeline finishes.'}
            </p>
          </div>
        )}

        <div className="bg-neutral-50 border border-neutral-200 p-4 rounded-xl space-y-2">
          <div className="text-[9px] font-bold font-mono tracking-widest uppercase text-neutral-500">EXECUTIVE TAKEAWAY</div>
          <p className="text-neutral-700 text-xs leading-relaxed italic">&ldquo;{currentItem.summary}&rdquo;</p>
        </div>

        <div className="bg-neutral-50 border border-neutral-200 p-4 rounded-xl space-y-3.5">
          <div className="text-[9px] font-extrabold font-mono tracking-widest uppercase text-neutral-500 flex justify-between items-center">
            <span>PREVIEW PORTAL</span>
            <span className="bg-neutral-250/70 text-neutral-700 text-[8px] font-mono px-2 py-0.5 rounded font-extrabold">
              {currentItem.type}
            </span>
          </div>

          {currentItem.type === 'Voice Notes' && (
            <div className="flex items-center justify-between p-2 bg-white border border-neutral-200 rounded-lg text-[10px]">
              <span className="font-mono text-neutral-400 font-bold uppercase text-[8px] tracking-wider">Playback Speed:</span>
              <div className="flex gap-1">
                {[1.0, 1.25, 1.5, 2.0].map((spd) => (
                  <button
                    key={spd}
                    onClick={() => onSetVoiceSpeed(spd)}
                    className={cn(
                      'px-2 py-0.5 rounded font-mono text-[9px] font-bold transition',
                      voiceSpeed === spd ? 'bg-neutral-900 text-white' : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                    )}
                  >
                    {spd.toFixed(2)}x
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentItem.type === 'Videos' && (
            <div className="space-y-2">
              {currentItem.url && (currentItem.url.includes('youtube') || currentItem.url.includes('youtu.be')) ? (
                <div className="relative aspect-video w-full rounded-lg overflow-hidden border border-neutral-200 bg-black">
                  <iframe
                    className="absolute inset-0 w-full h-full"
                    src={`https://www.youtube.com/embed/${getYouTubeEmbedId(currentItem.url)}`}
                    title="YouTube Video Preview"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : (
                <div className="p-4 bg-white border border-neutral-200 rounded-lg text-center font-mono space-y-1.5">
                  <Play className="w-5 h-5 mx-auto text-neutral-400" />
                  <span className="text-[10px] text-neutral-600 block font-semibold">Video Link Bookmark</span>
                  {currentItem.url && (
                    <a
                      href={currentItem.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[9px] text-neutral-900 border border-neutral-200 bg-neutral-50 hover:bg-neutral-100 rounded px-2 py-1 inline-flex items-center space-x-1"
                    >
                      <span>Open video source</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {currentItem.type === 'PDFs' && (
            <div className="space-y-2">
              {currentItem.fileUrl ? (
                <div className="space-y-2">
                  <iframe src={`${currentItem.fileUrl}#toolbar=0`} className="w-full h-48 rounded-lg border border-neutral-200 shadow-sm bg-white" title="PDF Document Viewer" />
                  <div className="flex justify-between items-center pt-1 border-t border-neutral-100">
                    <span className="text-[9px] text-neutral-400 font-mono">Secure PDF Reader</span>
                    <a
                      href={currentItem.fileUrl}
                      download={currentItem.fileName || 'knowledge-paper.pdf'}
                      className="text-[9px] font-mono hover:underline font-bold text-neutral-900"
                    >
                      Download file
                    </a>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-white border border-neutral-200 rounded-lg text-left space-y-2 max-h-48 overflow-y-auto">
                  <div className="flex items-center space-x-1.5 text-neutral-500 pb-1.5 border-b border-neutral-100">
                    <BookOpen className="w-4 h-4 text-neutral-400" />
                    <span className="text-[10px] font-bold font-mono tracking-wider">PAPER TRANSCRIPT</span>
                  </div>
                  <p className="text-neutral-750 leading-relaxed text-xs">{currentItem.content}</p>
                </div>
              )}
            </div>
          )}

          {currentItem.type === 'Voice Notes' && (
            <div className="space-y-2">
              {currentItem.fileUrl ? (
                <div className="space-y-2">
                  <div className="p-3 bg-white border border-neutral-200 rounded-lg flex flex-col justify-center">
                    <audio ref={audioRef} src={currentItem.fileUrl} controls className="w-full h-8 accent-neutral-900" />
                    <span className="text-[8px] font-mono text-neutral-400 mt-1.5 text-center block">
                      Recorded Speech Transcription (Active Speed: {voiceSpeed}x)
                    </span>
                  </div>
                  <div className="p-3 bg-neutral-100/50 border border-neutral-200 rounded-lg max-h-28 overflow-y-auto">
                    <span className="text-[8px] font-mono font-bold text-neutral-400 uppercase tracking-widest block mb-1">TRANSCRIBED SCRIPT:</span>
                    <p className="text-[11px] text-neutral-700 leading-normal italic font-serif">&ldquo;{currentItem.content}&rdquo;</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="p-3 bg-white border border-neutral-200 rounded-lg text-left">
                    <div className="flex items-center space-x-1.5 text-neutral-500 pb-1 border-b border-neutral-150">
                      <Volume2 className="w-4 h-4" />
                      <span className="text-[9px] font-bold font-mono">DICTATED SPEECH</span>
                    </div>
                    <p className="text-[11px] font-serif text-neutral-700 leading-normal italic mt-2">&ldquo;{currentItem.content}&rdquo;</p>
                    <span className="text-[8px] font-mono text-neutral-400 mt-2 block">Dictated Audio (Upload MP3 to enable playback)</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {currentItem.type === 'Articles' && (
            <div className="space-y-2">
              <div className="p-3.5 bg-white border border-neutral-200 rounded-lg max-h-48 overflow-y-auto leading-relaxed text-left text-xs text-neutral-800">
                {currentItem.content}
              </div>
              {currentItem.url && (
                <div className="flex justify-between items-center text-[9px] font-mono text-neutral-400 pt-1 border-t border-neutral-100">
                  <span>Source domain verified</span>
                  <a href={currentItem.url} target="_blank" rel="noreferrer" className="text-neutral-900 hover:underline flex items-center space-x-0.5 font-bold">
                    <span>Visit original</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              )}
            </div>
          )}

          {currentItem.type === 'Social Links' && (
            <div className="space-y-2">
              <div className="p-4 bg-neutral-950 text-white rounded-xl space-y-2.5 text-left border border-neutral-800">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center font-mono text-[9px] font-bold text-neutral-300 uppercase">
                    {currentItem.source ? currentItem.source.substring(0, 2) : 'S'}
                  </div>
                  <div>
                    <div className="text-[10px] font-bold truncate max-w-[125px]">{currentItem.author || currentItem.source || 'Social Media Link'}</div>
                    <div className="text-[8px] text-neutral-400 font-mono">Social Feed Archive</div>
                  </div>
                </div>
                <p className="text-xs leading-relaxed font-sans italic text-neutral-200">&ldquo;{currentItem.content}&rdquo;</p>

                {currentItem.url && (
                  <div className="pt-2.5 border-t border-neutral-800/80 flex justify-end text-[10px]">
                    <a
                      href={currentItem.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[9px] font-mono font-bold text-neutral-400 hover:text-white inline-flex items-center space-x-1 transition"
                    >
                      <span>View original post</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentItem.type === 'Images' && (
            <div className="space-y-2">
              {currentItem.fileUrl ? (
                <div className="space-y-2">
                  <div className="rounded-lg overflow-hidden border border-neutral-200 bg-white">
                    <img
                      src={currentItem.fileUrl}
                      alt={currentItem.title}
                      className="w-full max-h-72 object-contain bg-neutral-50"
                    />
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-neutral-100">
                    <span className="text-[9px] text-neutral-400 font-mono">Private image capture</span>
                    <a
                      href={currentItem.fileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[9px] font-mono hover:underline font-bold text-neutral-900"
                    >
                      Open full image
                    </a>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-white border border-neutral-200 rounded-lg text-center font-mono space-y-1.5">
                  <ImageIcon className="w-5 h-5 mx-auto text-neutral-400" />
                  <span className="text-[10px] text-neutral-600 block font-semibold">Image capture saved</span>
                </div>
              )}
            </div>
          )}
        </div>

        {currentItem.imageUrl && !['Videos', 'PDFs', 'Voice Notes', 'Articles', 'Social Links', 'Images'].includes(currentItem.type) && (
          <div className="relative h-24 w-full rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200/50">
            <img
              src={currentItem.imageUrl}
              alt="Category Cover"
              className="w-full h-full object-cover saturate-[0.80] opacity-90"
              referrerPolicy="no-referrer"
            />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-neutral-100">
            <span className="text-[10px] font-bold font-mono uppercase tracking-wider text-neutral-500">AI LEARNING CARDS ({currentItem.flashcards.length})</span>
            <span className="text-[9px] bg-neutral-100 text-neutral-600 font-mono font-medium px-1.5 py-0.5 rounded uppercase">Recall active</span>
          </div>

          {currentItem.flashcards.length === 0 ? (
            <p className="text-[10px] text-neutral-400 italic text-center py-4 bg-neutral-50/50 border border-dashed border-neutral-200 rounded-xl">
              No learning flashcards generated for this item yet. Use Quick Capture to synthesize.
            </p>
          ) : (
            <div className="space-y-3">
              {currentItem.flashcards.map((fc) => {
                const isFlipped = flippedCardId === fc.id;

                return (
                  <div
                    key={fc.id}
                    onClick={() => onFlipCard(isFlipped ? null : fc.id)}
                    className="bg-neutral-50 border border-neutral-200/80 hover:bg-[#fafafc] rounded-xl p-3.5 cursor-pointer transition text-left min-h-[90px] flex flex-col justify-between"
                  >
                    <div className="flex justify-between items-center text-[9px] font-bold tracking-wider font-mono text-neutral-400 uppercase mb-2">
                      <span className="text-neutral-600 bg-neutral-200/60 px-1.5 py-0.5 rounded">{fc.type}</span>
                      <span>{isFlipped ? 'REVEALED' : 'CLICK TO FLIP'}</span>
                    </div>

                    {isFlipped ? (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-neutral-700 text-xs leading-normal font-normal font-mono text-left">
                        {fc.answer}
                      </motion.p>
                    ) : (
                      <p className="text-neutral-800 text-xs font-semibold leading-relaxed">{fc.question}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-neutral-200 text-[10px] text-neutral-400 font-mono space-y-1">
          <div>VAULT NODE: {currentItem.id.toUpperCase()}</div>
          <div>INDEX_STAMP: {new Date(currentItem.createdAtDate).toDateString()}</div>
        </div>
      </div>
    </div>
  );
}

function getYouTubeEmbedId(url?: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}
