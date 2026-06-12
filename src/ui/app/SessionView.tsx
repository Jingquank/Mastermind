import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_AUTHOR_TAG } from '../../shared/constants'
import { acceptEdit, rejectEdit, resolveAll } from '../../shared/critic/resolve'
import { analyzeMarkdown } from '../../shared/markdown/analyze'
import { MilkdownEditor } from '../modes/editing/MilkdownEditor'
import { MarkdownView } from '../modes/reading/Renderer'
import { SelectionToolbar } from '../modes/reading/SelectionToolbar'
import { SourceEditor } from '../modes/source/SourceEditor'
import { CommentRail } from '../review/CommentRail'
import { HoverActions } from '../review/HoverActions'
import { DiffView } from '../diff/DiffView'
import { formatCounts, useLang, useT } from '../i18n'
import { CheckIcon } from '../icons'
import { RenameDialog } from './RenameDialog'
import { SettingsPanel } from '../settings/SettingsPanel'
import { TranslatedView } from '../translate/TranslatedView'
import { previewTargetLang, useTranslation } from '../translate/translationStore'
import { openEvents } from './api'
import { useConfig } from './configStore'
import { useDirty, useDoc, type ViewMode } from './store'
import { TopBar } from './TopBar'

const MODE_CYCLE: Record<ViewMode, ViewMode> = { reading: 'editing', editing: 'source', source: 'reading' }

function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

/** Enter/Backspace must activate focused chrome, never the walker. */
function isInteractiveTarget(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return false
  return el.closest('button, a, [role="button"], [tabindex]') !== null
}

export function SessionView({ sessionId }: { sessionId: string }) {
  const status = useDoc((s) => s.status)
  const error = useDoc((s) => s.error)
  const source = useDoc((s) => s.source)
  const conflict = useDoc((s) => s.conflict)
  const diskChange = useDoc((s) => s.diskChange)
  const handedBack = useDoc((s) => s.handedBack)
  const notice = useDoc((s) => s.notice)
  const diffOpen = useDoc((s) => s.diffOpen)
  const diffOffer = useDoc((s) => s.diffOffer)
  const renamePrompt = useDoc((s) => s.renamePrompt)
  const meta = useDoc((s) => s.meta)
  const mode = useDoc((s) => s.mode)
  const externalVersion = useDoc((s) => s.externalVersion)
  const load = useDoc((s) => s.load)
  const applyEdits = useDoc((s) => s.applyEdits)
  const save = useDoc((s) => s.save)
  const dirty = useDirty()

  const t = useT()
  const lang = useLang()
  const articleRef = useRef<HTMLElement | null>(null)
  const [activeSpan, setActiveSpan] = useState<number | null>(null)
  const [railOpen, setRailOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [agentWaiting, setAgentWaiting] = useState(false)
  const [walkIndex, setWalkIndex] = useState<number | null>(null)
  const authorTag = useConfig((s) => s.config?.authorTag) ?? DEFAULT_AUTHOR_TAG
  const providerConfigured = useConfig((s) => s.config?.provider?.configured) ?? false
  const langPair = useConfig((s) => s.config?.langPair) ?? { a: 'en', b: 'zh-CN' }
  const transActive = useTranslation((s) => s.active)
  const transLoading = useTranslation((s) => s.loading)

  useEffect(() => {
    void load(sessionId)
    useTranslation.getState().reset()
  }, [sessionId, load])

  useEffect(() => {
    setAgentWaiting(meta?.agentWaiting ?? false)
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

  const suggestions = useMemo(
    () =>
      analysis
        ? analysis.items
            .filter((i): i is Extract<typeof i, { type: 'suggestion' }> => i.type === 'suggestion')
            .map((i) => analysis.spans.indexOf(i.span))
            .filter((i) => i >= 0)
        : [],
    [analysis],
  )

  // keyboard suggestion walker: n/p (or j/k) step, Enter accepts, Backspace rejects
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        const s = useDoc.getState()
        s.setMode(MODE_CYCLE[s.mode])
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
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e)) return
      const s = useDoc.getState()
      if (s.mode !== 'reading' || s.diffOpen) return
      const key = e.key.toLowerCase()
      if (key === 'n' || key === 'j' || key === 'p' || key === 'k') {
        e.preventDefault()
        setWalkIndex((prev) => {
          if (suggestions.length === 0) return null
          const forward = key === 'n' || key === 'j'
          if (prev === null) return forward ? 0 : suggestions.length - 1
          const next = prev + (forward ? 1 : -1)
          return Math.min(Math.max(next, 0), suggestions.length - 1)
        })
      } else if (
        (e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Delete') &&
        walkIndex !== null &&
        !isInteractiveTarget(e)
      ) {
        const spanIdx = suggestions[walkIndex]
        const span = spanIdx !== undefined ? analysis?.spans[spanIdx] : undefined
        if (span) {
          e.preventDefault()
          const edit = e.key === 'Enter' ? acceptEdit(s.source, span) : rejectEdit(s.source, span)
          applyEdits([edit])
          setWalkIndex((prev) => (prev === null ? null : suggestions.length - 1 <= 0 ? null : Math.min(prev, suggestions.length - 2)))
        }
      } else if (e.key === 'Escape') {
        setWalkIndex(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save, suggestions, walkIndex, analysis, applyEdits])

  // paint + scroll the walker's current suggestion
  useEffect(() => {
    const doc = articleRef.current
    if (!doc) return
    doc.querySelectorAll('.kbd-focus').forEach((el) => el.classList.remove('kbd-focus'))
    if (walkIndex === null) return
    const spanIdx = suggestions[walkIndex]
    if (spanIdx === undefined) return
    const el = doc.querySelector(`[data-span-index="${spanIdx}"]`)
    if (el) {
      el.classList.add('kbd-focus')
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
    }
  }, [walkIndex, suggestions, analysis])

  // clicking an anchored highlight or comment marker activates its rail card
  const onArticleClick = useCallback((e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest('.critic-anchor, .critic-comment-marker')
    if (target) {
      const idx = Number((target as HTMLElement).dataset.spanIndex)
      if (Number.isFinite(idx)) setActiveSpan((prev) => (prev === idx ? null : idx))
    }
  }, [])
  const onArticleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const target = (e.target as HTMLElement).closest('.critic-anchor, .critic-comment-marker')
    if (target) {
      e.preventDefault()
      const idx = Number((target as HTMLElement).dataset.spanIndex)
      if (Number.isFinite(idx)) setActiveSpan((prev) => (prev === idx ? null : idx))
    }
  }, [])

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

  if (diffOpen) {
    return (
      <>
        <TopBar agentWaiting={agentWaiting} />
        <DiffView sessionId={sessionId} onClose={() => useDoc.getState().setDiffOpen(false)} />
      </>
    )
  }

  const hasThreads = analysis?.items.some((i) => i.type === 'thread') ?? false
  const showRail = mode === 'reading' && railOpen && hasThreads
  const suggestionCount = suggestions.length

  const bulkResolve = (resolveMode: 'accept' | 'reject') => {
    const s = useDoc.getState()
    const count = suggestionCount
    s.setSource(resolveAll(s.source, analysis?.spans ?? [], resolveMode))
    s.setNotice({ kind: 'ok', msg: resolveMode === 'accept' ? 'bulkAccepted' : 'bulkRejected', count })
    setWalkIndex(null)
  }

  return (
    <>
      <TopBar
        railOpen={railOpen}
        onToggleRail={mode === 'reading' && hasThreads ? () => setRailOpen((v) => !v) : undefined}
        suggestionCount={mode === 'reading' && !showTranslated ? suggestionCount : 0}
        onAcceptAll={() => bulkResolve('accept')}
        onRejectAll={() => bulkResolve('reject')}
        onToggleSettings={() => setSettingsOpen((v) => !v)}
        agentWaiting={agentWaiting}
        translation={
          providerConfigured && mode === 'reading'
            ? {
                label: transActive
                  ? t('original')
                  : (() => {
                      const target = previewTargetLang(source, langPair)
                      return /^(zh|中文)/i.test(target) ? '中文' : target
                    })(),
                active: transActive,
                loading: transLoading,
                onToggle: () => void useTranslation.getState().toggle(sessionId, source, langPair),
              }
            : undefined
        }
      />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {renamePrompt && <RenameDialog />}
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
      {!conflict && !diskChange && diffOffer && (
        <div className="banner" role="status">
          <span className="banner-text">{t('reloaded')}</span>
          <button type="button" className="btn-ghost" onClick={() => useDoc.getState().setDiffOpen(true)}>
            {t('showWhatChanged')}
          </button>
          <button type="button" className="btn-ghost" onClick={() => useDoc.getState().dismissDiffOffer()}>
            {t('dismiss')}
          </button>
        </div>
      )}
      <div className={`doc-shell${showRail ? ' with-rail' : ''}`}>
        <div className="doc-column">
          {showTranslated && (
            <TranslatedView sessionId={sessionId} source={source} authorTag={authorTag} onEdit={applyEdits} />
          )}
          {mode === 'reading' && !showTranslated && analysis && (
            <article className="md-root" ref={articleRef} onClick={onArticleClick} onKeyDown={onArticleKeyDown}>
              <MarkdownView
                tree={analysis.tree}
                ctx={{ source, onEdit: (edit) => applyEdits([edit]), anchoredHighlights }}
              />
            </article>
          )}
          {mode === 'editing' && <MilkdownEditor key={`e${externalVersion}`} />}
          {mode === 'source' && <SourceEditor key={`s${externalVersion}`} />}
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
          <HoverActions articleRef={articleRef} spans={analysis.spans} source={source} onEdit={applyEdits} />
        </>
      )}
      {handedBack && (
        <div className="toast" role="status">
          <CheckIcon width={13} height={13} /> {t('handedBackToast')}
          {formatCounts(handedBack, lang)}
        </div>
      )}
      {!handedBack && notice && (
        <div className={`toast${notice.kind === 'error' ? ' toast-error' : ''}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
          {notice.count !== undefined
            ? `${notice.count} ${t(notice.msg as never)} · ${t('undoHint')}`
            : t(notice.msg as never)}
        </div>
      )}
    </>
  )
}
