import { useRef, useState } from 'react'
import { Popover } from 'radix-ui'
import { useT } from '../i18n'
import { ChevronUpIcon, SendIcon } from '../icons'
import { SlotLabel, type SlotHandle } from '../util/SlotLabel'
import { useDoc } from './store'

/**
 * The hand-back CTA: a split button. The wide face hands the document straight
 * back; the arrow opens a small popover (above the bottom-anchored bar) for a
 * free-form note that the server folds into the review-summary block the agent
 * re-reads. Radix Popover gives us Escape / click-outside / focus-return for free.
 */
export function HandBackButton() {
  const t = useT()
  const handback = useDoc((s) => s.handback)
  const saving = useDoc((s) => s.saving)
  const savingKind = useDoc((s) => s.savingKind)
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const label = useRef<SlotHandle>(null)

  const handingBack = savingKind === 'handback'

  const submitNote = (): void => {
    const text = note.trim()
    void handback(text || undefined).then((ok) => {
      if (ok) {
        setNote('')
        setOpen(false)
      }
    })
  }

  return (
    <div className="cta-split">
      <button
        type="button"
        className="btn-cta cta-split-main"
        onClick={() => {
          // Re-roll the label the moment it's pressed; it then rolls again to
          // "Handing back…" once the state flips.
          label.current?.flash()
          void handback()
        }}
        disabled={saving}
        title={t('handBackTitle')}
      >
        <SlotLabel
          ref={label}
          className="cta-label"
          text={handingBack ? t('handingBack') : t('handBack')}
          options={{ direction: 'up' }}
        />
      </button>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="btn-cta cta-split-arrow"
            disabled={saving}
            aria-label={t('handBackMore')}
            title={t('handBackMore')}
          >
            <ChevronUpIcon />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="handback-note"
            side="top"
            align="end"
            sideOffset={16}
            collisionPadding={12}
          >
            <textarea
              className="handback-note-input"
              placeholder={t('handBackNotePlaceholder')}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  submitNote()
                }
              }}
              rows={3}
              autoFocus
            />
            <div className="handback-note-foot">
              <span className="handback-note-hint">{t('handBackNoteHint')}</span>
              <button
                type="button"
                className="btn-cta handback-note-send"
                onClick={submitNote}
                disabled={saving || !note.trim()}
                title={t('handBackWithNote')}
                aria-label={t('handBackWithNote')}
              >
                <SendIcon />
              </button>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}
