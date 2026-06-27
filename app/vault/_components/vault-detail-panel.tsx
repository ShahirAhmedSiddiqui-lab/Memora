'use client';

/* eslint-disable @next/next/no-img-element */

import * as React from 'react';
import { motion } from 'motion/react';
import { Bookmark, BookOpen, ExternalLink, ImageIcon, Layers, LoaderCircle, Maximize2, Minimize2, Play, RefreshCw, RotateCcw, Trash2, Volume2, X } from 'lucide-react';
import { KnowledgeItem } from '@/lib/db';
import { cn } from '@/lib/utils';
import { resolveItemPreviewPortal } from '@/lib/vault/preview';

type VaultDetailPanelProps = {
  currentItem?: KnowledgeItem;
  isTrashView: boolean;
  isFullscreen: boolean;
  reduceMotion: boolean;
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
  onClose: () => void;
  onToggleFullscreen: () => void;
};

export function VaultDetailPanel({
  currentItem,
  isTrashView,
  isFullscreen,
  reduceMotion,
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
  onClose,
  onToggleFullscreen,
}: VaultDetailPanelProps) {
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = React.useState(false);

  if (!currentItem) {
    return null;
  }

  const previewPortal = resolveItemPreviewPortal(currentItem);

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'app-scrollbar bg-white shrink-0 border-t lg:border-t-0 border-neutral-200/85 p-6 flex flex-col overflow-y-auto',
        isFullscreen ? 'w-full flex-1' : 'w-full lg:w-96'
      )}
    >
      <div className="space-y-6 text-left select-none">
        <div>
          <div className="mb-2 border-b border-neutral-100 pb-2">
            <div className="flex items-start justify-between gap-3">
              <span className="text-[10px] font-extrabold uppercase font-mono tracking-widest text-[#52525b]">SYNTHESIS SHEET</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onToggleFullscreen}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-neutral-200 px-2 text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-950"
                  title={isFullscreen ? 'Exit fullscreen' : 'Open fullscreen'}
                >
                  {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={onClose}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-neutral-200 px-2 text-neutral-600 transition hover:border-neutral-300 hover:text-neutral-950"
                  title="Close synthesis sheet"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {currentItem.url && (
                <a
                  href={currentItem.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[10px] font-bold font-mono text-neutral-700 transition hover:border-neutral-300 hover:text-neutral-950"
                >
                  <span>Open</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              <button
                onClick={(e) => onToggleBookmark(currentItem.id, !!currentItem.bookmarked, e)}
                className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[10px] font-bold font-mono text-neutral-700 transition hover:border-neutral-300 hover:text-neutral-950"
                title="Bookmark asset"
              >
                <Bookmark className={cn('w-3 h-3', currentItem.bookmarked ? 'fill-neutral-900 text-neutral-900' : 'text-neutral-400')} />
                <span>{currentItem.bookmarked ? 'Saved' : 'Save'}</span>
              </button>
              {isTrashView ? (
                <>
                  <button
                    onClick={(e) => onRestoreItem(currentItem.id, e)}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold font-mono text-emerald-700 transition hover:bg-emerald-100"
                    title="Restore entry"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Restore</span>
                  </button>
                  <button
                    onClick={(e) => onPermanentDeleteItem(currentItem.id, e)}
                    className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-bold font-mono text-red-700 transition hover:bg-red-100"
                    title="Delete forever"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={(e) => onDeleteItem(currentItem.id, e)}
                  className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-bold font-mono text-red-700 transition hover:bg-red-100"
                  title="Delete entry"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Delete</span>
                </button>
              )}
              {!isTrashView && currentItem.processingStatus === 'failed' && (
                <button
                  onClick={(e) => onRetryItem(currentItem.id, e)}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold font-mono text-amber-700 transition hover:bg-amber-100"
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

        {currentItem.extractedText && currentItem.extractedText.trim() && (
          <div className="bg-neutral-50 border border-neutral-200 p-4 rounded-xl space-y-2">
            <div className="text-[9px] font-bold font-mono tracking-widest uppercase text-neutral-500">
              {currentItem.type === 'Voice Notes' ? 'FULL TRANSCRIPT' : currentItem.type === 'Images' ? 'OCR / EXTRACTED TEXT' : 'EXTRACTED TEXT'}
            </div>
            <div className="max-h-44 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-3 text-xs leading-relaxed text-neutral-700">
              {currentItem.extractedText}
            </div>
          </div>
        )}

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
              <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
                <div className="relative aspect-video w-full bg-neutral-100">
                  {previewPortal.kind === 'video-file' && (
                    <video
                      src={previewPortal.src}
                      poster={previewPortal.poster}
                      className="h-full w-full bg-black"
                      controls
                      playsInline
                      preload="metadata"
                    >
                      {previewPortal.mimeType ? <source src={previewPortal.src} type={previewPortal.mimeType} /> : null}
                    </video>
                  )}

                  {previewPortal.kind === 'video-embed' && (
                    <iframe
                      src={previewPortal.src}
                      title={previewPortal.title}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      referrerPolicy="strict-origin-when-cross-origin"
                    />
                  )}

                  {previewPortal.kind === 'external' && (
                    <div className="relative h-full w-full">
                      <img
                        src={previewPortal.thumbnailUrl || currentItem.previewMetadata?.thumbnailUrl || currentItem.imageUrl || ''}
                        alt={previewPortal.alt}
                        className="h-full w-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/35">
                        <div className="flex items-center gap-2 rounded-full bg-white/92 px-3 py-1.5 text-[11px] font-semibold text-neutral-900 shadow-sm">
                          <Play className="h-3.5 w-3.5 fill-current" />
                          <span>{previewPortal.label}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {previewPortal.kind === 'placeholder' && (
                    <div className="flex h-full w-full items-center justify-center bg-neutral-950 text-white">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <Play className="h-8 w-8" />
                        <span className="text-xs text-neutral-200">{previewPortal.label}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {currentItem.url && (
                <a
                  href={currentItem.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex text-sm font-medium text-neutral-700 underline underline-offset-4 hover:text-neutral-950"
                >
                  Open video
                </a>
              )}
            </div>
          )}

          {currentItem.type === 'PDFs' && (
            <div className="space-y-2">
              {previewPortal.kind === 'pdf-file' ? (
                <div className="space-y-2">
                  <div className="rounded-lg border border-neutral-200 shadow-sm bg-white overflow-hidden">
                    <object data={`${previewPortal.src}#toolbar=0&navpanes=0&scrollbar=1`} type="application/pdf" className="w-full h-[28rem] bg-neutral-50">
                      <iframe src={`${previewPortal.src}#toolbar=0&navpanes=0&scrollbar=1`} className="w-full h-[28rem] bg-white" title="PDF Document Viewer" />
                    </object>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-neutral-100">
                    <span className="text-[9px] text-neutral-400 font-mono">Secure PDF Reader</span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setIsPdfPreviewOpen(true)}
                        className="text-[9px] font-mono font-bold text-neutral-900 hover:underline"
                      >
                        Fullscreen preview
                      </button>
                      <a
                        href={previewPortal.src}
                        download={currentItem.fileName || 'knowledge-paper.pdf'}
                        className="text-[9px] font-mono hover:underline font-bold text-neutral-900"
                      >
                        Download file
                      </a>
                    </div>
                  </div>
                </div>
              ) : previewPortal.kind === 'card' ? (
                <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-3">
                  {previewPortal.thumbnailUrl ? (
                    <img
                      src={previewPortal.thumbnailUrl}
                      alt={previewPortal.title || currentItem.title}
                      className="h-44 w-full rounded-lg object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : null}
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-neutral-900">{previewPortal.title || currentItem.title}</div>
                    <p className="text-[11px] leading-relaxed text-neutral-600">{previewPortal.description || currentItem.content}</p>
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
              {previewPortal.kind === 'audio' ? (
                <div className="space-y-2">
                  <div className="p-3 bg-white border border-neutral-200 rounded-lg flex flex-col justify-center">
                    <audio ref={audioRef} src={previewPortal.src} controls className="w-full h-8 accent-neutral-900" />
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
              {previewPortal.kind === 'card' && previewPortal.thumbnailUrl && (
                <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
                  <img
                    src={previewPortal.thumbnailUrl}
                    alt={previewPortal.title || currentItem.title}
                    className="h-52 w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
              {previewPortal.kind === 'card' && (previewPortal.title || previewPortal.description) && (
                <div className="rounded-lg border border-neutral-200 bg-white p-3 text-left">
                  <div className="text-[9px] font-bold font-mono uppercase tracking-wider text-neutral-400">
                    Article Preview
                  </div>
                  {previewPortal.title && (
                    <div className="mt-1 text-xs font-semibold text-neutral-900">{previewPortal.title}</div>
                  )}
                  {previewPortal.description && (
                    <p className="mt-1 text-[11px] leading-relaxed text-neutral-600">{previewPortal.description}</p>
                  )}
                </div>
              )}
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
              {previewPortal.kind === 'card' && previewPortal.thumbnailUrl && (
                <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
                  <img
                    src={previewPortal.thumbnailUrl}
                    alt={previewPortal.title || currentItem.title}
                    className="h-52 w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
              <div className="p-4 bg-neutral-950 text-white rounded-xl space-y-2.5 text-left border border-neutral-800">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-full bg-neutral-800 flex items-center justify-center font-mono text-[9px] font-bold text-neutral-300 uppercase">
                    {currentItem.source ? currentItem.source.substring(0, 2) : 'S'}
                  </div>
                  <div>
                    <div className="text-[10px] font-bold truncate max-w-[180px]">
                      {previewPortal.kind === 'card' ? previewPortal.authorName || currentItem.author || currentItem.source || 'Social Media Link' : currentItem.author || currentItem.source || 'Social Media Link'}
                    </div>
                    <div className="text-[8px] text-neutral-400 font-mono">
                      {previewPortal.kind === 'card' ? previewPortal.provider || 'Social Feed Archive' : currentItem.previewMetadata?.provider || 'Social Feed Archive'}
                    </div>
                  </div>
                </div>
                {previewPortal.kind === 'card' && previewPortal.title && (
                  <div className="text-xs font-semibold leading-relaxed text-white">{previewPortal.title}</div>
                )}
                {previewPortal.kind === 'card' && previewPortal.description ? (
                  <p className="text-xs leading-relaxed font-sans italic text-neutral-200">{previewPortal.description}</p>
                ) : (
                  <p className="text-xs leading-relaxed font-sans italic text-neutral-200">&ldquo;{currentItem.content}&rdquo;</p>
                )}

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
              {previewPortal.kind === 'image' ? (
                <div className="space-y-2">
                  <div className="rounded-lg overflow-hidden border border-neutral-200 bg-white">
                    <img
                      src={previewPortal.src}
                      alt={previewPortal.alt}
                      className="w-full max-h-72 object-contain bg-neutral-50"
                    />
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-neutral-100">
                    <span className="text-[9px] text-neutral-400 font-mono">Private image capture</span>
                    <a
                      href={previewPortal.src}
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
                  <motion.div
                    key={fc.id}
                    onClick={() => onFlipCard(isFlipped ? null : fc.id)}
                    whileHover={reduceMotion ? undefined : { y: -2 }}
                    className="bg-neutral-50 border border-neutral-200/80 hover:bg-[#fafafc] rounded-xl p-3.5 cursor-pointer transition-premium text-left min-h-[90px] flex flex-col justify-between"
                  >
                    <div className="flex justify-between items-center text-[9px] font-bold tracking-wider font-mono text-neutral-400 uppercase mb-2">
                      <span className="text-neutral-600 bg-neutral-200/60 px-1.5 py-0.5 rounded">{fc.type}</span>
                      <span>{isFlipped ? 'REVEALED' : 'CLICK TO FLIP'}</span>
                    </div>

                    {isFlipped ? (
                      <motion.p initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="text-neutral-700 text-xs leading-normal font-normal font-mono text-left">
                        {fc.answer}
                      </motion.p>
                    ) : (
                      <p className="text-neutral-800 text-xs font-semibold leading-relaxed">{fc.question}</p>
                    )}
                  </motion.div>
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

      {currentItem.type === 'PDFs' && previewPortal.kind === 'pdf-file' && isPdfPreviewOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-neutral-950/80 p-4">
          <div className="relative flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
              <div className="min-w-0">
                <div className="text-[10px] font-bold font-mono uppercase tracking-[0.24em] text-neutral-400">PDF Fullscreen Preview</div>
                <div className="truncate text-sm font-semibold text-neutral-900">{currentItem.title}</div>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={previewPortal.src}
                  download={currentItem.fileName || 'knowledge-paper.pdf'}
                  className="text-[10px] font-mono font-bold text-neutral-700 hover:text-neutral-950"
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setIsPdfPreviewOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 transition hover:text-neutral-950"
                  title="Close PDF preview"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-neutral-100">
              <object data={`${previewPortal.src}#toolbar=1&navpanes=0&scrollbar=1`} type="application/pdf" className="h-full w-full">
                <iframe src={`${previewPortal.src}#toolbar=1&navpanes=0&scrollbar=1`} className="h-full w-full bg-white" title="Fullscreen PDF Preview" />
              </object>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
