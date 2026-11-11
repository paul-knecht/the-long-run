import { type JSX, useEffect, useId, useRef, useState } from 'react'
import { type Key, type Lang, crashNameKey, money, percent } from '../../i18n'
import { MONTHS, START_AGE, YEARS } from '../../sim/constants'
import type { EndingModel } from '../../sim/ending'
import type { AltId } from '../../sim/replay'
import { Chart } from '../components/Chart'
import { LanguageSwitch } from '../components/Header'
import { type LangContextValue, useLang } from '../lang'
import { type ShareOutcome, pageUrl, shareMessage, shareResult } from '../share'

type T = LangContextValue['t']
type Emphasis = 'main' | 'strong' | 'faint'
type LineId = 'you' | AltId

const LINE_KEY: Record<LineId, Key> = {
  you: 'ending.line.you',
  held: 'ending.line.held',
  sold: 'ending.line.sold',
  etfOnly: 'ending.line.etfOnly',
  fundOnly: 'ending.line.fundOnly',
  cashOnly: 'ending.line.cashOnly',
}

/** Line widths as the chart draws them, for the legend's samples. */
const STROKE: Record<Emphasis, number> = { main: 3, strong: 2, faint: 1.25 }

/** The hold in years that `card.time.history.never15` speaks of. */
const REFERENCE_HOLD_YEARS = 15

const SMALLPRINT: readonly Key[] = [
  'smallprint.advice',
  'smallprint.past',
  'smallprint.data',
  'smallprint.crash',
  'smallprint.monthly',
  'smallprint.savings',
  'smallprint.costs',
  'smallprint.inflation',
  'smallprint.taxes',
  'smallprint.credit',
]

/** True when a fraction prints as 0% (percent shows whole percent). */
const showsAsZero = (x: number): boolean => Math.round(x * 100) === 0

interface Lesson {
  id: string
  title: string
  you: string
  other: string
  history: string
}

/**
 * What history says about holding: with no losing hold of 15 years or more, that; otherwise the whole
 * years of the longest losing hold, and from one year more on, every hold ended ahead.
 */
function timeHistory(longestLosingMonths: number, t: T): string {
  if (longestLosingMonths < REFERENCE_HOLD_YEARS * 12) return t('card.time.history.never15')
  const lostYears = Math.floor(longestLosingMonths / 12)
  const years = { lostYears, safeYears: lostYears + 1 }
  return t(longestLosingMonths % 12 === 0 ? 'card.time.history.lostExact' : 'card.time.history.lost', years)
}

/** The seven lesson cards, in order, each worded from what the run and the data show. */
function lessons(cards: EndingModel['cards'], lang: Lang, t: T): Lesson[] {
  const pct = (x: number): string => percent(x, lang)
  const eur = (x: number): string => money(x, lang)
  const { time, lumpSum, savingsRate, split, costs, stock, emergency } = cards

  const drop = pct(time.lowestDrawdown)
  const timeYou = showsAsZero(time.lowestDrawdown)
    ? t('card.time.you.noFall')
    : time.monthsToRecover === null
      ? t('card.time.you.notBack', { drop })
      : time.monthsToRecover === 1
        ? t('card.time.you.fellOne', { drop })
        : t('card.time.you.fell', { drop, months: time.monthsToRecover })

  // Saying yes to Jonas moves half the ETF; with nothing in it, nothing moved.
  const stockYou: Key = !stock.followed ? 'card.stock.you.declined' : Math.round(stock.moved) > 0 ? 'card.stock.you.followed' : 'card.stock.you.followedEmpty'

  const lumpYou: Record<typeof lumpSum.choice, Key> = { lump: 'card.lumpSum.you.lump', spread: 'card.lumpSum.you.spread', cash: 'card.lumpSum.you.cash' }

  // A bill the savings account could not cover is paid by selling; with nothing to sell it stays unpaid.
  const emergencyYou = emergency.covered
    ? t('card.emergency.you.covered')
    : Math.round(emergency.sold) > 0
      ? t('card.emergency.you.sold', { sold: eur(emergency.sold), drop: pct(emergency.drawdownAtSale) })
      : t('card.emergency.you.unpaid')

  return [
    {
      id: 'time',
      title: t('card.time.title'),
      you: timeYou,
      other: t('card.time.other'),
      history: timeHistory(time.longestLosingMonths, t),
    },
    {
      id: 'lumpSum',
      title: t('card.lumpSum.title'),
      you: t(lumpYou[lumpSum.choice]),
      other: t('card.lumpSum.other', { lump: eur(lumpSum.lumpFinal), spread: eur(lumpSum.spreadFinal) }),
      history: t('card.lumpSum.history', { pct: pct(lumpSum.winRate) }),
    },
    {
      id: 'savingsRate',
      title: t('card.savingsRate.title'),
      you: t('card.savingsRate.you', { rate: pct(savingsRate.shareOfIncome), saved: eur(savingsRate.savedFromIncome) }),
      other: t('card.savingsRate.other', { at15: eur(savingsRate.finalAt15) }),
      history: t('card.savingsRate.history'),
    },
    {
      id: 'split',
      title: t('card.split.title'),
      you: t('card.split.you', { share: pct(split.averageEtfShare), yourDrop: pct(split.yourMaxDrawdown) }),
      other: t('card.split.other', { etfDrop: pct(split.etfOnlyMaxDrawdown), etfFinal: eur(split.etfOnlyFinal), cashFinal: eur(split.cashOnlyFinal) }),
      history: t('card.split.history'),
    },
    {
      id: 'costs',
      title: t('card.costs.title'),
      you: t(costs.followed ? 'card.costs.you.followed' : 'card.costs.you.declined'),
      other: t('card.costs.other', { etf: eur(costs.etfOnlyFinal), fund: eur(costs.fundOnlyFinal) }),
      history: t('card.costs.history'),
    },
    {
      id: 'stock',
      title: t('card.stock.title'),
      you: t(stockYou),
      other: t('card.stock.other', { stock: eur(100 * stock.stockMultiple), etf: eur(100 * stock.indexMultiple) }),
      history: t('card.stock.history', { beat: stock.beatInHundred }),
    },
    {
      id: 'emergency',
      title: t('card.emergency.title'),
      you: emergencyYou,
      other: t('card.emergency.other'),
      history: t('card.emergency.history'),
    },
  ]
}

/** The result line to share: how far it beat a savings account alone, unless that shows as 0%. */
function shareText(model: EndingModel, lang: Lang, t: T): string {
  const { final, vsCashOnly } = model.share
  const params = { from: model.reveal.fromYear, to: model.reveal.toYear, amount: money(final, lang) }
  if (showsAsZero(vsCashOnly)) return t('ending.share.plain', params)
  return t(vsCashOnly > 0 ? 'ending.share.ahead' : 'ending.share.behind', { ...params, pct: percent(Math.abs(vsCashOnly), lang) })
}

/** A short piece of a line, drawn with the same classes as the line in the chart. */
function Sample(p: { id: LineId; emphasis: Emphasis }): JSX.Element {
  return (
    <svg className="legend-sample" viewBox="0 0 28 10" aria-hidden="true">
      <line
        className={`chart-line chart-line--${p.emphasis}`}
        data-series={p.id}
        x1={3}
        y1={5}
        x2={25}
        y2={5}
        strokeWidth={STROKE[p.emphasis]}
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * The end of the run, and the only place the game explains anything: the result next to the paths
 * not taken, the reveal of the years and the market, the seven lesson cards, sharing, play again,
 * the way into the practice step, and the small print.
 */
export function EndingScreen(p: { model: EndingModel; onAgain(): void; onPractice(): void }): JSX.Element {
  const { model, onAgain, onPractice } = p
  const { lang, t } = useLang()
  const ids = useId()
  const [shareOutcome, setShareOutcome] = useState<ShareOutcome | null>(null)

  // The screen before took the focus with it: the result gets it, which also brings the page to its top.
  const result = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (document.activeElement === document.body) result.current?.focus()
  }, [])

  // The text to copy by hand is focused and selected when it appears, on each further "Share" and on each focus.
  const field = useRef<HTMLTextAreaElement>(null)
  const selectField = (): void => {
    field.current?.focus()
    field.current?.select()
  }
  useEffect(() => {
    if (shareOutcome === 'manual') selectField()
  }, [shareOutcome])

  const paths: { id: LineId; values: number[]; final: number; emphasis: Emphasis }[] = [
    { id: 'you', values: model.you, final: model.final, emphasis: 'main' },
    ...model.lines.filter((l) => l.emphasised).map((l) => ({ id: l.id, values: l.totals, final: l.final, emphasis: 'strong' as const })),
    ...model.lines.filter((l) => !l.emphasised).map((l) => ({ id: l.id, values: l.totals, final: l.final, emphasis: 'faint' as const })),
  ]

  // The amount in "You finished with {amount}." is set large.
  const [resultLead, resultEnd = ''] = t('ending.result').split('{amount}')

  const { reveal } = model
  const text = shareText(model, lang, t)
  const url = pageUrl()
  // Presses while a share is open are ignored: a second share would be refused and fall back to the clipboard.
  const sharing = useRef(false)
  const share = async (): Promise<void> => {
    if (sharing.current) return
    sharing.current = true
    try {
      const outcome = await shareResult(text, url)
      setShareOutcome(outcome)
      if (outcome === 'manual') selectField() // the field is already there when Share is pressed again
    } finally {
      sharing.current = false
    }
  }

  return (
    <main className="screen ending" data-testid="ending">
      <div className="header-bar">
        <p className="header-when">
          <span>{t('ending.title', { years: YEARS })}</span>
          <span>{t('header.age', { age: START_AGE + YEARS })}</span>
        </p>
        <LanguageSwitch />
      </div>
      <h1 className="ending-result" ref={result} tabIndex={-1}>
        <span className="ending-lead">{resultLead}</span>
        <span className="ending-total">{money(model.final, lang)}</span>
        {resultEnd}
      </h1>
      <p className="ending-paid">
        {t(Math.round(model.cards.emergency.unpaid) > 0 ? 'ending.paidIn.unpaid' : 'ending.paidIn', { paidIn: money(model.paidIn, lang) })}
      </p>

      <h2 id={`${ids}-paths`} className="ending-caption">
        {t('ending.lines')}
      </h2>
      <Chart
        series={paths.map(({ id, values, emphasis }) => ({ id, values, emphasis }))}
        length={MONTHS + 1}
        shown={MONTHS}
        mood="calm"
        label={t('ending.lines')}
      />
      <ul className="legend" aria-labelledby={`${ids}-paths`}>
        {paths.map((path) => (
          <li key={path.id} className="legend-row" data-emphasis={path.emphasis}>
            <span className="legend-name">
              <Sample id={path.id} emphasis={path.emphasis} />
              {t(LINE_KEY[path.id])}
            </span>
            <b>{money(path.final, lang)}</b>
          </li>
        ))}
      </ul>

      <section className="panel reveal" aria-labelledby={`${ids}-reveal`}>
        <h2 id={`${ids}-reveal`} className="reveal-tag">
          {t('ending.reveal.tag')}
        </h2>
        <p>{t(reveal.region === 'us' ? 'ending.reveal.us' : 'ending.reveal.world', { from: reveal.fromYear, to: reveal.toYear })}</p>
        {reveal.crashes.length > 0 && (
          <>
            <p>{t('ending.reveal.crashes')}</p>
            <ul className="reveal-crashes">
              {reveal.crashes.map((crash, i) => (
                <li key={i}>
                  {t('ending.reveal.crash', {
                    name: t(crashNameKey(crash.peakYear), { year: crash.peakYear }),
                    depth: percent(crash.depth, lang),
                  })}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="reveal-history">{t('ending.crash.history', { wins: model.crashHistory.wins, total: model.crashHistory.total })}</p>
      </section>

      <h2 className="ending-heading">{t('ending.cards')}</h2>
      <div className="cards">
        {lessons(model.cards, lang, t).map((lesson) => (
          <article key={lesson.id} className="card" data-testid="lesson-card" aria-labelledby={`${ids}-${lesson.id}`}>
            <h3 id={`${ids}-${lesson.id}`} className="card-title">
              {lesson.title}
            </h3>
            <dl className="card-lines">
              <dt>{t('card.label.you')}</dt>
              <dd>{lesson.you}</dd>
              <dt>{t('card.label.other')}</dt>
              <dd>{lesson.other}</dd>
              <dt>{t('card.label.history')}</dt>
              <dd>{lesson.history}</dd>
            </dl>
          </article>
        ))}
      </div>

      <div className="ending-actions">
        <div>
          <button type="button" className="btn btn-wide" onClick={() => void share()}>
            {t('ending.share.button')}
          </button>
          <p className="share-status" role="status">
            {shareOutcome === 'copied' && t('ending.share.copied')}
          </p>
          {shareOutcome === 'manual' && (
            <div className="share-manual">
              <label htmlFor={`${ids}-share`}>{t('ending.share.manual')}</label>
              <textarea
                id={`${ids}-share`}
                ref={field}
                className="share-field"
                readOnly
                rows={4}
                value={shareMessage(text, url)}
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
          )}
        </div>
        <button type="button" className="btn btn-wide" onClick={onAgain}>
          {t('ending.again')}
        </button>
        <button type="button" className="btn btn-primary btn-wide ending-practice" onClick={onPractice}>
          {t('ending.toPractice')} <span aria-hidden="true">▶</span>
        </button>
      </div>

      <div className="smallprint ending-smallprint">
        {SMALLPRINT.map((key) => (
          <p key={key}>{t(key)}</p>
        ))}
      </div>
    </main>
  )
}
