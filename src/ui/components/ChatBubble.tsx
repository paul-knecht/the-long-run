import type { AnimationEvent, CSSProperties, JSX, ReactNode } from 'react'
import { useLang } from '../lang'

/** Keeps what just appeared in view, as a messaging app scrolls to the newest message. */
const followIntoView = (e: AnimationEvent<HTMLElement>): void => e.currentTarget.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })

/**
 * Something that arrives: it fades in after `step` times the step time set in CSS (theme.css,
 * `.appear`), and is hidden until then. With `follow` the page scrolls to it when it arrives.
 */
export function Appear(p: { step?: number; follow?: boolean; className?: string; children: ReactNode }): JSX.Element {
  return (
    <div
      className={p.className ? `appear ${p.className}` : 'appear'}
      style={p.step ? ({ '--step': p.step } as CSSProperties) : undefined}
      onAnimationStart={p.follow ? followIntoView : undefined}
    >
      {p.children}
    </div>
  )
}

/** A message as in a messaging app: who it is from, then one bubble per text. */
export function ChatBubble(p: { from: string; texts: readonly string[] }): JSX.Element {
  return (
    <div className="chat">
      <p className="chat-from">{p.from}</p>
      {p.texts.map((text, i) => (
        <p key={i} className="chat-bubble">
          {text}
        </p>
      ))}
    </div>
  )
}

/** A news headline: a tag and the line itself. Shown, never commented on. */
export function Headline(p: { text: string }): JSX.Element {
  const { t } = useLang()
  return (
    <div className="headline">
      <p className="headline-tag">{t('headline.tag')}</p>
      <p className="headline-text">{p.text}</p>
    </div>
  )
}
