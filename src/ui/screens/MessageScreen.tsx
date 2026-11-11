import type { JSX } from 'react'
import { type Key, money } from '../../i18n'
import { BILL, WINDFALL } from '../../sim/constants'
import type { Decision, EventChoice, EventId, Holdings, Pending, Timeline } from '../../sim/types'
import { Appear, ChatBubble } from '../components/ChatBubble'
import { useLang } from '../lang'

/** Who writes, what they write, the replies the player can give and, for some, how the sender answers. */
interface Script {
  from: Key
  text: Key
  replies: readonly { choice: EventChoice; label: Key; after?: Key }[]
}

const SCRIPTS: Record<EventId, Script> = {
  werner: {
    from: 'event.werner.from',
    text: 'event.werner.text',
    replies: [
      { choice: 'follow', label: 'event.werner.reply.follow', after: 'event.werner.after.follow' },
      { choice: 'decline', label: 'event.werner.reply.decline', after: 'event.werner.after.decline' },
    ],
  },
  keller: {
    from: 'event.keller.from',
    text: 'event.keller.text',
    replies: [
      { choice: 'follow', label: 'event.keller.reply.follow', after: 'event.keller.after.follow' },
      { choice: 'decline', label: 'event.keller.reply.decline', after: 'event.keller.after.decline' },
    ],
  },
  jonas: {
    from: 'event.jonas.from',
    text: 'event.jonas.text',
    replies: [
      { choice: 'follow', label: 'event.jonas.reply.follow', after: 'event.jonas.after.follow' },
      { choice: 'decline', label: 'event.jonas.reply.decline', after: 'event.jonas.after.decline' },
    ],
  },
  bill: { from: 'event.bill.from', text: 'event.bill.text', replies: [{ choice: 'ok', label: 'event.bill.reply.ok' }] },
  raise: { from: 'event.raise.from', text: 'event.raise.text', replies: [{ choice: 'ok', label: 'event.raise.reply.ok' }] },
  windfall: {
    from: 'event.windfall.from',
    text: 'event.windfall.text',
    replies: [
      { choice: 'lump', label: 'event.windfall.reply.lump', after: 'event.windfall.after.lump' },
      { choice: 'spread', label: 'event.windfall.reply.spread', after: 'event.windfall.after.spread' },
      { choice: 'cash', label: 'event.windfall.reply.cash', after: 'event.windfall.after.cash' },
    ],
  },
}

/** What paying the bill will sell: the part the savings account cannot cover, up to what the investments hold (as the engine does). */
const billSold = (h: Holdings): number => Math.min(Math.max(0, BILL - h.cash), h.etf + h.fund + h.stock)

/**
 * Someone writes: the sender, one or two bubbles, and a reply button per choice. The bill also says
 * whether the savings account covers it or investments get sold. `salary` is the monthly pay from
 * the coming month on, which the raise names. Nothing here comments on a choice.
 */
export function MessageScreen(p: {
  timeline: Timeline
  pending: Extract<Pending, { kind: 'event' }>
  salary: number
  decide(d: Decision): void
}): JSX.Element {
  const { timeline, pending, salary, decide } = p
  const { lang, t } = useLang()
  const { event, at } = pending
  const script = SCRIPTS[event]

  const texts =
    event === 'bill'
      ? [
          t('event.bill.text', { amount: money(BILL, lang) }),
          pending.billCovered
            ? t('event.bill.text.covered')
            : t('event.bill.text.sold', { amount: money(billSold(timeline.snapshots[at].holdings), lang) }),
        ]
      : event === 'windfall'
        ? [t('event.windfall.text', { amount: money(WINDFALL, lang) })]
        : event === 'raise'
          ? [t('event.raise.text', { salary: money(salary, lang) })]
          : [t(script.text)]

  return (
    <section className="message">
      <Appear>
        <ChatBubble from={t(script.from)} texts={texts} />
      </Appear>
      <Appear className="replies" step={1} follow>
        {script.replies.map((r) => (
          <button key={r.choice} type="button" className="btn btn-wide" data-testid="reply" onClick={() => decide({ kind: 'event', at, event, choice: r.choice })}>
            {t(r.label)}
          </button>
        ))}
      </Appear>
    </section>
  )
}

/** The sender's short answer to the reply the player gave, if they have one; shown on the screen that follows. */
export function Reaction(p: { event: EventId; choice: EventChoice }): JSX.Element | null {
  const { t } = useLang()
  const script = SCRIPTS[p.event]
  const after = script.replies.find((r) => r.choice === p.choice)?.after
  if (!after) return null
  return (
    <Appear className="reaction">
      <ChatBubble from={t(script.from)} texts={[t(after)]} />
    </Appear>
  )
}
