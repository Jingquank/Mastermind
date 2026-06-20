import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_AUTHOR_TAG } from '../../shared/constants'
import { rejectEdit } from '../../shared/critic/resolve'
import { analyzeMarkdown } from '../../shared/markdown/analyze'
import { parseMarkdown } from '../../shared/markdown/processor'
import { MarkdownView } from '../modes/reading/Renderer'
import { SelectionToolbar } from '../modes/reading/SelectionToolbar'
import { BlockActions } from '../modes/reading/BlockActions'
import { CommentRail } from '../review/CommentRail'
import { useNav } from './navStore'
import { MarkGutter, type MarkTick } from '../review/MarkGutter'
import { extractOutline } from '../modes/reading/outline'
import { parseAuthor } from '../../shared/critic/scanner'
import { SlotLabel } from '../util/SlotLabel'
import { formatCounts, useLang, useT } from '../i18n'
import { CheckIcon, GearIcon } from '../icons'
import { previewTargetLang, useTranslation } from '../translate/translationStore'
import { openEvents } from './api'
import { useConfig } from './configStore'
import { useDirty, useDoc, type ViewMode } from './store'
import { TopBar } from './TopBar'

// Code-split the heavy / conditionally-rendered views so the initial bundle stays
// lean: CodeMirror (Source), the settings panel, find bar, rename dialog, and the
// translated view each load on demand. (named exports → default shim for lazy())
const SourceEditor = lazy(() => import('../modes/source/SourceEditor').then((m) => ({ default: m.SourceEditor })))
const SettingsPanel = lazy(() => import('../settings/SettingsPanel').then((m) => ({ default: m.SettingsPanel })))
const FindBar = lazy(() => import('../review/FindBar').then((m) => ({ default: m.FindBar })))
const RenameDialog = lazy(() => import('./RenameDialog').then((m) => ({ default: m.RenameDialog })))
const TranslatedView = lazy(() => import('../translate/TranslatedView').then((m) => ({ default: m.TranslatedView })))

const MODE_CYCLE: Record<ViewMode, ViewMode> = { reading: 'source', source: 'reading' }

function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

export function SessionView({ sessionId }: { sessionId: string }) {
  const status = useDoc((s) => s.status)
  const error = useDoc((s) => s.error)
  const source = useDoc((s) => s.source)
  const conflict = useDoc((s) => s.conflict)
  const diskChange = useDoc((s) => s.diskChange)
  const handedBack = useDoc((s) => s.handedBack)
  const notice = useDoc((s) => s.notice)
  const handbackPulse = useDoc((s) => s.handbackPulse)
  const renamePrompt = useDoc((s) => s.renamePrompt)
  const meta = useDoc((s) => s.meta)
  const mode = useDoc((s) => s.mode)
  const externalVersion = useDoc((s) => s.externalVersion)
  const load = useDoc((s) => s.load)
  const applyEdits = useDoc((s) => s.applyEdits)
  const dirty = useDirty()

  const t = useT()
  const lang = useLang()
  const articleRef = useRef<HTMLElement | null>(null)
  const [activeSpan, setActiveSpan] = useState<number | null>(null)
  const [railOpen, setRailOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  // settings and find share one home and are mutually exclusive:
  // opening one closes the other (SlideOver handles Escape/click-out/focus).
  const toggleSettings = useCallback(() => {
    setSettingsOpen((v) => {
      if (!v) setFindOpen(false)
      return !v
    })
  }, [])
  const closeSettings = useCallback(() => setSettingsOpen(false), [])
  const [agentWaiting, setAgentWaiting] = useState(false)
  const [assistAvailable, setAssistAvailable] = useState(false)
  const authorTag = useConfig((s) => s.config?.authorTag) ?? DEFAULT_AUTHOR_TAG
  const langPair = useConfig((s) => s.config?.langPair) ?? { a: 'en', b: 'zh-CN' }
  const highlightCode = (useConfig((s) => s.config?.codeTheme) ?? 'none') !== 'none'
  // translation routes to the user's agent, so it's ready iff a `mastermind assist` listener is live
  const translationReady = assistAvailable
  const transActive = useTranslation((s) => s.active)
  const transLoading = useTranslation((s) => s.loading)

  useEffect(() => {
    void load(sessionId)
    useTranslation.getState().reset()
  }, [sessionId, load])

  // #2 eager pre-translate: while an agent is serving assist, warm the whole
  // document's translation into the on-disk cache + map so the toggle is instant.
  // Intentionally keyed on agent-presence + load, not `source`, so it primes on
  // open / agent-connect without re-firing on every keystroke.
  useEffect(() => {
    if (status !== 'ready' || !translationReady || !source) return
    void useTranslation.getState().prefetch(sessionId, source, langPair)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translationReady, status, sessionId])

  // Autosave debounces by ~600ms; flush immediately when the tab is hidden or
  // the window loses focus so closing it can't drop the last few keystrokes.
  useEffect(() => {
    const flushNow = () => void useDoc.getState().autosave()
    const onVisibility = () => {
      if (document.hidden) flushNow()
    }
    window.addEventListener('blur', flushNow)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('blur', flushNow)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => {
    setAgentWaiting(meta?.agentWaiting ?? false)
    setAssistAvailable(meta?.assistAvailable ?? false)
  }, [meta])

  // toasts auto-clear
  useEffect(() => {
    if (!handedBack) return
    const timer = setTimeout(() => useDoc.getState().clearHandedBack(), 5000)
    return () => clearTimeout(timer)
  }, [handedBack])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => useDoc.getState().setNotice(null), notice.kind === 'error' ? 8000 : 5000)
    return () => clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    // role=ui SSE connection: its liveness keeps the session (and a blocked
    // `mastermind open --wait`) alive while this tab is open.
    const es = openEvents(sessionId)
    es.addEventListener('file-changed', (e) => {
      const { mtimeMs } = JSON.parse((e as MessageEvent).data) as { mtimeMs: number }
      useDoc.getState().notifyDiskChange(mtimeMs)
    })
    es.addEventListener('file-deleted', () => {
      useDoc.getState().notifyDiskChange(0, true)
    })
    es.addEventListener('handback', (e) => {
      const { mtimeMs } = JSON.parse((e as MessageEvent).data) as { mtimeMs: number }
      const s = useDoc.getState()
      if (!s.saving && Math.abs(s.mtimeMs - mtimeMs) > 0.001) s.notifyDiskChange(mtimeMs)
    })
    es.addEventListener('config-changed', () => {
      void useConfig.getState().load()
    })
    es.addEventListener('waiters-changed', (e) => {
      const { count } = JSON.parse((e as MessageEvent).data) as { count: number }
      setAgentWaiting(count > 0)
    })
    es.addEventListener('assist-availability', (e) => {
      const { available } = JSON.parse((e as MessageEvent).data) as { available: boolean }
      setAssistAvailable(available)
    })
    return () => es.close()
  }, [sessionId])

  const showTranslated = mode === 'reading' && transActive
  const analysis = useMemo(
    () => (status === 'ready' && mode === 'reading' && !showTranslated ? analyzeMarkdown(source) : null),
    [status, source, mode, showTranslated],
  )
  const anchoredHighlights = useMemo(() => {
    const set = new Set<number>()
    if (!analysis) return set
    for (const item of analysis.items) {
      if (item.type === 'thread' && item.anchor) {
        const idx = analysis.spans.indexOf(item.anchor)
        if (idx >= 0) set.add(idx)
      }
    }
    return set
  }, [analysis])

  // The heading outline drives the left navigator in both modes (so its
  // collapse/expand state persists across Reading/Source). Reading reuses its
  // critic-aware tree; Source parses the source directly.
  const outline = useMemo(
    () => (analysis ? extractOutline(analysis.tree) : status === 'ready' ? extractOutline(parseMarkdown(source)) : []),
    [analysis, status, source],
  )
  // Publish the outline + (in reading mode) the article element to the shared
  // navigator, which lives outside SessionView. docEl is null in source mode —
  // there the navigator scrolls via the registered editor scroller instead of
  // the article's data-ps offsets.
  useEffect(() => {
    useNav.getState().publish(outline, articleRef.current)
  }, [outline, mode, externalVersion])
  // Clear only on real unmount, so switching modes never blanks the outline
  // (which would briefly unmount the navigator and reset its transient state).
  useEffect(() => () => useNav.getState().publish([], null), [])
  const commentFootnotes = useMemo(() => {
    if (!analysis) return []
    return analysis.spans
      .filter((s) => s.kind === 'comment')
      .map((s) => parseAuthor(source.slice(s.innerStart, s.innerEnd)))
  }, [analysis, source])
  const markTicks = useMemo<MarkTick[]>(() => {
    if (!analysis) return []
    const ticks: MarkTick[] = []
    for (const item of analysis.items) {
      if (item.type === 'suggestion') {
        const idx = analysis.spans.indexOf(item.span)
        if (idx >= 0) ticks.push({ spanIndex: idx, kind: item.span.kind as MarkTick['kind'] })
      } else if (item.type === 'highlight') {
        // standalone highlights are no longer rendered (only comment anchors are),
        // so they get no gutter tick.
      } else {
        const anchor = item.anchor ?? item.comments[0]?.span
        const idx = anchor ? analysis.spans.indexOf(anchor) : -1
        if (idx >= 0) ticks.push({ spanIndex: idx, kind: 'comment' })
      }
    }
    return ticks
  }, [analysis])

  // global shortcuts: ⌘S (swallow), ⌘E (toggle view), ⌘F (find), ⌘Z (undo)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘S is a no-op now — the buffer autosaves. Swallow it so the browser's
      // "save page" dialog never appears.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        const s = useDoc.getState()
        s.setMode(MODE_CYCLE[s.mode])
        return
      }
      // ⌘F opens the mark-aware find bar (reading mode, marks present); a second
      // ⌘F while it's open closes it, leaving native find for the next press
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
        const s = useDoc.getState()
        if (s.mode === 'reading') {
          e.preventDefault()
          setFindOpen((v) => {
            if (!v) setSettingsOpen(false)
            return !v
          })
        }
        return
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        const s = useDoc.getState()
        if (s.mode === 'reading' && !isTypingTarget(e)) {
          e.preventDefault()
          s.undo()
        }
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Remove a suggested deletion the user placed: rejecting a `del` keeps the
  // original text (unwraps the `{--…--}`). Reuses the live source/analysis.
  const undoDeletion = useCallback(
    (el: HTMLElement): boolean => {
      const span = analysis?.spans[Number(el.dataset.spanIndex)]
      if (!span || span.kind !== 'del') return false
      applyEdits([rejectEdit(source, span)])
      return true
    },
    [analysis, source, applyEdits],
  )

  // clicking a deletion removes it; clicking an anchored highlight / comment
  // marker activates its rail card.
  const onArticleClick = useCallback(
    (e: React.MouseEvent) => {
      // a drag-to-select that ends inside a deletion shouldn't also undo it
      if (window.getSelection()?.isCollapsed === false) return
      const del = (e.target as HTMLElement).closest('.critic-del') as HTMLElement | null
      if (del && undoDeletion(del)) return
      const target = (e.target as HTMLElement).closest('.critic-anchor, .critic-comment-marker')
      if (target) {
        const idx = Number((target as HTMLElement).dataset.spanIndex)
        if (Number.isFinite(idx)) setActiveSpan((prev) => (prev === idx ? null : idx))
      }
    },
    [undoDeletion],
  )
  const onArticleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      const del = (e.target as HTMLElement).closest('.critic-del') as HTMLElement | null
      if (del) {
        e.preventDefault()
        undoDeletion(del)
        return
      }
      const target = (e.target as HTMLElement).closest('.critic-anchor, .critic-comment-marker')
      if (target) {
        e.preventDefault()
        const idx = Number((target as HTMLElement).dataset.spanIndex)
        if (Number.isFinite(idx)) setActiveSpan((prev) => (prev === idx ? null : idx))
      }
    },
    [undoDeletion],
  )

  const activeCardSpan = useMemo(() => {
    if (activeSpan === null || !analysis) return null
    for (const item of analysis.items) {
      if (item.type !== 'thread') continue
      const memberIdxs = [
        ...(item.anchor ? [analysis.spans.indexOf(item.anchor)] : []),
        ...item.comments.map((c) => analysis.spans.indexOf(c.span)),
      ]
      if (memberIdxs.includes(activeSpan)) {
        return item.anchor ? analysis.spans.indexOf(item.anchor) : analysis.spans.indexOf(item.comments[0]!.span)
      }
    }
    return null
  }, [activeSpan, analysis])

  useEffect(() => {
    const doc = articleRef.current
    if (!doc) return
    doc.querySelectorAll('.critic-anchor.active').forEach((el) => el.classList.remove('active'))
    if (activeCardSpan !== null) {
      doc.querySelector(`.critic-anchor[data-span-index="${activeCardSpan}"]`)?.classList.add('active')
    }
  }, [activeCardSpan, analysis])

  if (status === 'error') {
    return (
      <div className="center-note">
        <h1>MASTERMIND</h1>
        <p>{error === '__session-not-found__' ? t('sessionNotFound') : error}</p>
      </div>
    )
  }
  if (status !== 'ready') {
    return <div className="center-note loading-note">{t('loadingDocument')}</div>
  }

  const hasThreads = analysis?.items.some((i) => i.type === 'thread') ?? false
  const showRail = mode === 'reading' && railOpen && hasThreads

  return (
    <>
      <TopBar
        railOpen={railOpen}
        // Both controls stay mounted so the bar morphs between layouts; their
        // applicability (not their presence) is what changes per view.
        onToggleRail={() => setRailOpen((v) => !v)}
        commentsAvailable={mode === 'reading' && hasThreads && !showTranslated}
        translation={{
          label: transActive
            ? t('original')
            : (() => {
                const target = previewTargetLang(source, langPair)
                return /^(zh|中文)/i.test(target) ? '中文' : target
              })(),
          active: transActive,
          loading: transLoading,
          // pure toggle: cache + in-memory only, it never enqueues the agent. It flips
          // instantly from the on-disk cache; uncached blocks fall back to the original
          // and surface a notice (the agent pre-translates and prefetch warms the cache).
          onToggle: () => void useTranslation.getState().toggle(sessionId, source, langPair),
        }}
      />
      {/* "Agent waiting" status floats at the top-right of the UI, outside the bar. */}
      {agentWaiting && (
        <span className={`agent-chip agent-chip-floating${handbackPulse ? ' released' : ''}`} title={t('handBackTitle')}>
          <span className="agent-chip-dot" />
          <SlotLabel text={t('agentWaiting')} revealOnMount />
        </span>
      )}
      {/* Settings lives on its own as a floating button in the bottom-right
          corner — outside the bottom bar — anchoring the panel that rises above it. */}
      <button
        type="button"
        className={`floating-settings${settingsOpen ? ' active' : ''}`}
        onClick={toggleSettings}
        aria-label={t('settings')}
        aria-pressed={settingsOpen}
        title={t('settings')}
      >
        <GearIcon width={16} height={16} />
      </button>
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsPanel onClose={closeSettings} />
        </Suspense>
      )}
      {findOpen && mode === 'reading' && !showTranslated && analysis && (
        <Suspense fallback={null}>
          <FindBar analysis={analysis} source={source} docRef={articleRef} onClose={() => setFindOpen(false)} />
        </Suspense>
      )}
      {renamePrompt && (
        <Suspense fallback={null}>
          <RenameDialog />
        </Suspense>
      )}
      {conflict && (
        <div className="banner" role="alert">
          <span className="banner-text">{t('savePaused')}</span>
          <button type="button" className="btn-ghost" onClick={() => void useDoc.getState().reloadFromDisk()}>
            {t('reloadDiscard')}
          </button>
          <button type="button" className="btn-ghost" onClick={() => void useDoc.getState().saveForce()}>
            {t('saveAnyway')}
          </button>
        </div>
      )}
      {!conflict && diskChange && (
        <div className="banner" role="status">
          <span className="banner-text">{diskChange.deleted ? t('fileDeleted') : t('fileChanged')}</span>
          {!diskChange.deleted && (
            <button type="button" className="btn-ghost" onClick={() => void useDoc.getState().reloadFromDisk()}>
              {dirty ? t('reloadDiscard') : t('reload')}
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={() => useDoc.getState().dismissDiskChange()}>
            {t('keepMine')}
          </button>
        </div>
      )}
      <div className={`doc-shell${showRail ? ' with-rail' : ''}`}>
        <div className="doc-column">
          {showTranslated && (
            <Suspense fallback={<div className="center-note loading-note">{t('loadingDocument')}</div>}>
              <TranslatedView sessionId={sessionId} source={source} />
            </Suspense>
          )}
          {mode === 'reading' && !showTranslated && analysis && (
            <article className="md-root" ref={articleRef} onClick={onArticleClick} onKeyDown={onArticleKeyDown}>
              <MarkdownView
                tree={analysis.tree}
                ctx={{
                  source,
                  onEdit: (edit) => applyEdits([edit]),
                  anchoredHighlights,
                  highlightCode,
                  markLabels: {
                    deletion: t('markDeletion'),
                    hint: t('undoDeletion'),
                  },
                }}
              />
              {commentFootnotes.length > 0 && (
                <section className="print-footnotes">
                  <h2>{t('comments')}</h2>
                  <ol>
                    {commentFootnotes.map((c, i) => (
                      <li key={i}>
                        {c.author && <span className="pf-author">@{c.author}: </span>}
                        {c.body}
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </article>
          )}
          {mode === 'source' && (
            <Suspense fallback={<div className="center-note loading-note">{t('loadingDocument')}</div>}>
              <SourceEditor key={`s${externalVersion}`} />
            </Suspense>
          )}
        </div>
        {showRail && analysis && (
          <CommentRail
            items={analysis.items}
            spans={analysis.spans}
            source={source}
            docRef={articleRef}
            authorTag={authorTag}
            activeSpan={activeCardSpan}
            onActivate={setActiveSpan}
            onEdit={applyEdits}
          />
        )}
      </div>
      {mode === 'reading' && !showTranslated && analysis && (
        <>
          <SelectionToolbar
            containerRef={articleRef}
            source={source}
            spans={analysis.spans}
            authorTag={authorTag}
            onEdit={applyEdits}
          />
          <BlockActions
            containerRef={articleRef}
            source={source}
            spans={analysis.spans}
            authorTag={authorTag}
            onEdit={applyEdits}
          />
          {markTicks.length > 0 && !showRail && (
            <MarkGutter docRef={articleRef} marks={markTicks} version={externalVersion} />
          )}
        </>
      )}
      {handedBack && (
        <div className="toast" role="status">
          <CheckIcon width={13} height={13} />{' '}
          <SlotLabel revealOnMount text={`${t('handedBackToast')}${formatCounts(handedBack, lang)}`} />
        </div>
      )}
      {!handedBack && notice && (
        <div className={`toast${notice.kind === 'error' ? ' toast-error' : ''}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
          <SlotLabel
            revealOnMount
            text={
              notice.count !== undefined
                ? `${notice.count} ${t(notice.msg as never)} · ${t('undoHint')}`
                : t(notice.msg as never)
            }
          />
        </div>
      )}
    </>
  )
}
