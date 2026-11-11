import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { market } from '../data'
import { type Key, type Lang, money, percent, t } from '../i18n'
import { en } from '../i18n/en'
import { buildEnding, type EndingModel } from '../sim/ending'
import { createSetup } from '../sim/setup'
import { yearly } from '../sim/testHelpers'
import type { Decision, EventChoice, EventId } from '../sim/types'
import { App } from './App'
import { LangContext } from './lang'
import { EndingScreen } from './screens/EndingScreen'
import { shareResult } from './share'

const setup = createSetup(market, 3)

afterEach(() => {
  vi.unstubAllGlobals()
})

// The brief's tests, verbatim.

const model = buildEnding(market, setup, yearly(20, 0.15, 0.7));
test('shows result, reveal years and seven cards', () => {
  render(<EndingScreen model={model} onAgain={() => {}} onPractice={() => {}} />);
  expect(screen.getAllByText(new RegExp(String(model.reveal.fromYear))).length).toBeGreaterThan(0);
  expect(screen.getAllByTestId('lesson-card').length).toBe(7);
  expect(screen.getAllByText(/US stock market/i).length).toBeGreaterThan(0);
});
test('zero-savings ending has no NaN', () => {                     // Review Focus 2
  const { container } = render(<EndingScreen model={buildEnding(market, setup, yearly(20, 0, 0.5))} onAgain={() => {}} onPractice={() => {}} />);
  expect(container.textContent).not.toMatch(/NaN|Infinity/);
});
test('share falls back to a selectable field', async () => {       // Review Focus 5
  vi.stubGlobal('navigator', { language: 'en' });                  // no share, no clipboard
  render(<EndingScreen model={model} onAgain={() => {}} onPractice={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /share/i }));
  expect(((await screen.findByRole('textbox')) as HTMLTextAreaElement).value).toContain('€');
  vi.unstubAllGlobals();
});
test('play again draws a new run', async () => {
  const onAgain = vi.fn(); render(<EndingScreen model={model} onAgain={onAgain} onPractice={() => {}} />);
  await userEvent.click(screen.getByRole('button', { name: /again/i })); expect(onAgain).toHaveBeenCalled();
});

// Helpers for the tests below.

/** The ending in a language, as the app provides it. */
function renderEnding(m: EndingModel, lang: Lang = 'en', handlers: { onAgain?(): void; onPractice?(): void } = {}) {
  return render(
    <LangContext.Provider value={{ lang, setLang: () => {}, t: (key, params) => t(lang, key, params) }}>
      <EndingScreen model={m} onAgain={handlers.onAgain ?? (() => {})} onPractice={handlers.onPractice ?? (() => {})} />
    </LangContext.Provider>,
  )
}

const ev = (event: EventId, choice: EventChoice): Decision => ({ kind: 'event', at: setup.schedule[event], event, choice })

/** The model with some of the time card's numbers replaced. */
const withTime = (time: Partial<EndingModel['cards']['time']>): EndingModel => ({
  ...model,
  cards: { ...model.cards, time: { ...model.cards.time, ...time } },
})

/** The card whose title is this key's text. */
const card = (title: Key): HTMLElement => screen.getAllByTestId('lesson-card').find((c) => within(c).queryByRole('heading', { name: en[title] }))!

/** The text of a card's line, by its label: You, The other path, Beyond your run. */
function line(c: HTMLElement, label: Key): string {
  const term = within(c).getByText(en[label], { selector: 'dt' })
  return term.nextElementSibling!.textContent!
}

/** Clicks "Share your result" with no share sheet and no clipboard, and returns the text offered for copying. */
async function manualShareText(): Promise<string> {
  vi.stubGlobal('navigator', { language: 'en' })
  fireEvent.click(screen.getByRole('button', { name: /share|teilen/i }))
  return ((await screen.findByRole('textbox')) as HTMLTextAreaElement).value
}

const CARD_ORDER = ['time', 'lumpSum', 'savingsRate', 'split', 'costs', 'stock', 'emergency'] as const

// The result and the paths not taken.

test('the result: the 20 years, the age, the final amount and the money paid in', () => {
  renderEnding(model)
  expect(screen.getByText('Your 20 years')).toBeInTheDocument()
  expect(screen.getByText('Age 42')).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(`You finished with ${money(model.final, 'en')}.`)
  expect(screen.getByText(`You paid in ${money(model.paidIn, 'en')} along the way.`)).toBeInTheDocument()
})

test('the chart draws every path over all 241 months: yours as the main line, the emphasised ones strong, the rest faint', () => {
  renderEnding(model)
  const chart = screen.getByRole('img', { name: en['ending.lines'] })
  const lines = [...chart.querySelectorAll('polyline')]
  const byId = new Map(lines.map((l) => [l.getAttribute('data-series'), l]))
  expect([...byId.keys()].sort()).toEqual(['you', ...model.lines.map((l) => l.id)].sort())
  for (const l of lines) expect(l.getAttribute('points')!.trim().split(/\s+/)).toHaveLength(241)
  expect(byId.get('you')).toHaveClass('chart-line--main')
  expect(model.lines.some((l) => l.emphasised) && model.lines.some((l) => !l.emphasised)).toBe(true)
  for (const l of model.lines) expect(byId.get(l.id)).toHaveClass(l.emphasised ? 'chart-line--strong' : 'chart-line--faint')
})

test('the legend names each line with its final amount, yours first, then the emphasised paths, then the rest', () => {
  renderEnding(model)
  const rows = within(screen.getByRole('list', { name: en['ending.lines'] })).getAllByRole('listitem')
  const others = [...model.lines.filter((l) => l.emphasised), ...model.lines.filter((l) => !l.emphasised)]
  const expected = [
    { id: 'you', label: 'You', final: model.final },
    ...others.map((l) => ({ id: l.id, label: en[`ending.line.${l.id}`], final: l.final })),
  ]
  expect(rows).toHaveLength(expected.length)
  rows.forEach((row, i) => {
    expect(row).toHaveTextContent(`${expected[i].label}${money(expected[i].final, 'en')}`)
    // Each row's sample is drawn like its line.
    expect(row.querySelector('[data-series]')!.getAttribute('data-series')).toBe(expected[i].id)
  })
})

test('selling in the crash shows "If you had held" instead of "If you had sold"', () => {
  renderEnding(buildEnding(market, setup, [...yearly(20, 0.15, 0.7), { kind: 'crash', at: setup.takeovers[0], choice: 'sell' }]))
  const legend = screen.getByRole('list', { name: en['ending.lines'] })
  expect(within(legend).getByText('If you had held')).toBeInTheDocument()
  expect(within(legend).queryByText('If you had sold in the crash')).toBeNull()
})

// The reveal.

test('the reveal names the market, the years and each takeover crash with its depth, and how holding has done in history', () => {
  renderEnding(model)
  const reveal = screen.getByRole('region', { name: 'Revealed' })
  expect(within(reveal).getByText(t('en', 'ending.reveal.us', { from: 1973, to: 1993 }))).toBeInTheDocument()
  expect(within(reveal).getByText('What hit you was real:')).toBeInTheDocument()
  expect(within(reveal).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
    'The oil crisis crash of 1973 to 1974, down 39% from the top',
    'Black Monday, 1987, down 26% from the top',
  ])
  const { wins, total } = model.crashHistory
  expect(within(reveal).getByText(t('en', 'ending.crash.history', { wins, total }))).toBeInTheDocument()
})

test('a crash with no name of its own is named by the year it began; a worldwide history says so', () => {
  renderEnding({ ...model, reveal: { region: 'world', fromYear: 1940, toYear: 1960, crashes: [{ peakYear: 1950, depth: 0.3 }] } })
  const reveal = screen.getByRole('region', { name: 'Revealed' })
  expect(within(reveal).getByText(t('en', 'ending.reveal.world', { from: 1940, to: 1960 }))).toBeInTheDocument()
  expect(within(reveal).getByRole('listitem')).toHaveTextContent('The fall that began in 1950, down 30% from the top')
})

// The lesson cards.

test('the seven cards come in order, each with your part, the other path and the history', () => {
  renderEnding(model)
  const cards = screen.getAllByTestId('lesson-card')
  expect(cards.map((c) => within(c).getByRole('heading').textContent)).toEqual(CARD_ORDER.map((id) => en[`card.${id}.title`]))
  for (const c of cards) expect(within(c).getAllByRole('term').map((x) => x.textContent)).toEqual(['You', 'The other path', 'Beyond your run'])
})

test('the cards of an ordinary run: what you did, what the other path gave, and the history from the data', () => {
  renderEnding(model)
  const { time, lumpSum, savingsRate, split, costs, stock } = model.cards
  const eur = (n: number) => money(n, 'en')

  const timeCard = card('card.time.title')
  expect(line(timeCard, 'card.label.you')).toBe(`At the worst point the market had knocked 26% off your money. It took ${time.monthsToRecover} months to climb back.`)
  expect(line(timeCard, 'card.label.history')).toBe(t('en', 'card.time.history.lost', { years: time.longestLosingYears }))

  const lumpCard = card('card.lumpSum.title')
  expect(line(lumpCard, 'card.label.you')).toBe("You invested Grandma's money all at once.")
  expect(line(lumpCard, 'card.label.other')).toBe(`In your run, investing it all at once ends at ${eur(lumpSum.lumpFinal)}, spreading it over 12 months at ${eur(lumpSum.spreadFinal)}.`)
  expect(line(lumpCard, 'card.label.history')).toMatch(/^In all the years this game knows, investing at once beat spreading over 12 months in 64% of start dates/)

  const savingCard = card('card.savingsRate.title')
  expect(line(savingCard, 'card.label.you')).toBe(`On average you put aside 15% of your income. In total, ${eur(model.paidIn)} went in.`)
  expect(line(savingCard, 'card.label.other')).toBe(`At 15% every year, the same run ends at ${eur(savingsRate.finalAt15)}.`)

  const splitCard = card('card.split.title')
  expect(line(splitCard, 'card.label.you')).toBe('On average 70% of your new money went into the stock market. Your deepest fall was 26%.')
  expect(line(splitCard, 'card.label.other')).toBe(`All in the ETF: down as much as 39%, ending at ${eur(split.etfOnlyFinal)}. All in savings: no fall, ending at ${eur(split.cashOnlyFinal)}.`)

  const costsCard = card('card.costs.title')
  expect(line(costsCard, 'card.label.you')).toBe('You turned Mr. Keller down and kept the ETF at 0.2% a year.')
  expect(line(costsCard, 'card.label.other')).toBe(`Same savings, same market: all in the ETF ends at ${eur(costs.etfOnlyFinal)}, all in his fund at ${eur(costs.fundOnlyFinal)}.`)

  const stockCard = card('card.stock.title')
  expect(line(stockCard, 'card.label.you')).toBe("You passed on Jonas's stock.")
  expect(line(stockCard, 'card.label.other')).toBe(`From Jonas's tip to the end, €100 in his stock became ${eur(100 * stock.stockMultiple)}, and €100 in the ETF became ${eur(100 * stock.indexMultiple)}.`)
  expect(line(stockCard, 'card.label.history')).toMatch(new RegExp(`^We replayed your years with 100 stocks like his, and ${stock.beatInHundred} of them beat the ETF\\.`))

  expect(line(card('card.emergency.title'), 'card.label.you')).toBe('When the car bill came, your savings account paid it and your investments stayed put.')
})

test('the cards of a run that followed every tip, spread the windfall and sold to pay the bill', () => {
  const m = buildEnding(market, setup, [...yearly(20, 0.15, 1), ev('keller', 'follow'), ev('jonas', 'follow'), ev('windfall', 'spread')])
  expect(m.cards.emergency.sold).toBeGreaterThan(0)
  renderEnding(m)
  expect(line(card('card.lumpSum.title'), 'card.label.you')).toBe("You spread Grandma's money over 12 months.")
  expect(line(card('card.costs.title'), 'card.label.you')).toBe("You moved into Mr. Keller's fund: 5% on the way in, 1.8% every year.")
  expect(line(card('card.stock.title'), 'card.label.you')).toBe("You put half your ETF into Jonas's stock.")
  expect(line(card('card.emergency.title'), 'card.label.you')).toBe(
    `When the car bill came, your savings account wasn't enough, so ${money(m.cards.emergency.sold, 'en')} of your investments were sold while the ETF stood ${percent(m.cards.emergency.drawdownAtSale, 'en')} below its high.`,
  )
})

test('a windfall left in the savings account, and a bill with nothing to pay it from', () => {
  const kept = buildEnding(market, setup, [...yearly(20, 0.15, 0.7), ev('windfall', 'cash')])
  const { unmount } = renderEnding(kept)
  expect(line(card('card.lumpSum.title'), 'card.label.you')).toBe("You left Grandma's money in the savings account.")
  unmount()

  // Nothing saved before the bill: nothing in the savings account and nothing invested to sell.
  const broke = buildEnding(market, setup, yearly(20, 0, 0.5))
  expect(broke.cards.emergency).toMatchObject({ covered: false, sold: 0 })
  renderEnding(broke)
  expect(line(card('card.emergency.title'), 'card.label.you')).toBe("When the car bill came, your savings account couldn't cover it, and you had no investments to sell.")
})

test('the time card picks its words from the numbers', () => {
  const you = (time: Partial<EndingModel['cards']['time']>): string => {
    const { unmount } = renderEnding(withTime(time))
    const text = line(card('card.time.title'), 'card.label.you')
    unmount()
    return text
  }
  expect(you({ lowestDrawdown: 0.3, monthsToRecover: 17 })).toBe('At the worst point the market had knocked 30% off your money. It took 17 months to climb back.')
  expect(you({ lowestDrawdown: 0.3, monthsToRecover: 1 })).toBe('At the worst point the market had knocked 30% off your money. It took just one month to climb back.')
  expect(you({ lowestDrawdown: 0.3, monthsToRecover: null })).toBe('At the worst point the market had knocked 30% off your money, and by the end it had not fully climbed back.')
  // A fall that shows as 0% is no fall.
  expect(you({ lowestDrawdown: 0.004, monthsToRecover: 2 })).toBe(en['card.time.you.noFall'])
  expect(you({ lowestDrawdown: 0, monthsToRecover: 0 })).toBe(en['card.time.you.noFall'])

  const history = (longestLosingYears: number): string => {
    const { unmount } = renderEnding(withTime({ longestLosingYears }))
    const text = line(card('card.time.title'), 'card.label.history')
    unmount()
    return text
  }
  expect(history(14)).toBe(en['card.time.history.never15'])
  expect(history(15)).toBe(t('en', 'card.time.history.lost', { years: 15 }))
  expect(history(17)).toBe(t('en', 'card.time.history.lost', { years: 17 }))
})

// Sharing.

test('sharing hands the result line and the page link, without query or hash, to the share sheet', async () => {
  window.history.replaceState(null, '', '/game/?seed=4#top')
  try {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { language: 'en', share })
    renderEnding(model)
    await userEvent.click(screen.getByRole('button', { name: /share/i }))
    expect(share).toHaveBeenCalledWith({
      text: `I lived through 1973 to 1993 in The Long Run and ended with ${money(model.final, 'en')}, 64% more than a savings account alone. Can you beat that?`,
      url: `${window.location.origin}/game/`,
    })
    expect(screen.queryByRole('textbox')).toBeNull()
  } finally {
    window.history.replaceState(null, '', '/')
  }
})

test('without a share sheet the line and link are copied, and the screen says so', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { language: 'en', clipboard: { writeText } })
  renderEnding(model)
  expect(screen.getByRole('status')).toBeEmptyDOMElement()
  fireEvent.click(screen.getByRole('button', { name: /share/i }))
  expect(await screen.findByText('Copied to your clipboard')).toBe(screen.getByRole('status'))
  expect(writeText).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`ended with ${money(model.final, 'en')}.* ${window.location.origin}/$`)))
})

test('the manual field holds the line and the link, read-only, and is ready to copy', async () => {
  renderEnding(model)
  const text = await manualShareText()
  expect(text).toBe(`${t('en', 'ending.share.ahead', { from: 1973, to: 1993, amount: money(model.final, 'en'), pct: '64%' })} ${window.location.origin}/`)
  const field = screen.getByRole('textbox', { name: 'Copy this text:' }) as HTMLTextAreaElement
  expect(field).toHaveAttribute('readonly')
  expect(field).toHaveFocus()
  expect([field.selectionStart, field.selectionEnd]).toEqual([0, text.length])

  // Pressing Share again selects the text again.
  field.setSelectionRange(3, 3)
  field.blur()
  fireEvent.click(screen.getByRole('button', { name: /share/i }))
  await waitFor(() => expect(field).toHaveFocus())
  expect([field.selectionStart, field.selectionEnd]).toEqual([0, text.length])
})

test('the share line says how far you beat a savings account alone, and never "0% more"', async () => {
  const lineFor = async (vsCashOnly: number): Promise<string> => {
    const { unmount } = renderEnding({ ...model, share: { ...model.share, vsCashOnly } })
    const text = await manualShareText()
    unmount()
    vi.unstubAllGlobals()
    return text
  }
  expect(await lineFor(-0.12)).toContain(`ended with ${money(model.final, 'en')}, 12% less than a savings account alone.`)
  for (const nothing of [0, 0.004, -0.004]) {
    const text = await lineFor(nothing)
    expect(text).toContain(`ended with ${money(model.final, 'en')}. How would you do?`)
    expect(text).not.toMatch(/more than|less than/)
  }
})

describe('shareResult', () => {
  test('uses the share sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share, clipboard: { writeText } })
    expect(await shareResult('line', 'https://example.test/')).toBe('shared')
    expect(share).toHaveBeenCalledWith({ text: 'line', url: 'https://example.test/' })
    expect(writeText).not.toHaveBeenCalled()
  })

  test('cancelling the share sheet leaves the clipboard alone', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')), clipboard: { writeText } })
    expect(await shareResult('line', 'https://example.test/')).toBe('manual')
    expect(writeText).not.toHaveBeenCalled()
  })

  test('a share sheet that fails falls back to the clipboard, and a clipboard that fails to the manual field', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { share: vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError')), clipboard: { writeText } })
    expect(await shareResult('line', 'https://example.test/')).toBe('copied')
    expect(writeText).toHaveBeenCalledWith('line https://example.test/')

    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError')) } })
    expect(await shareResult('line', 'https://example.test/')).toBe('manual')

    vi.stubGlobal('navigator', {})
    expect(await shareResult('line', 'https://example.test/')).toBe('manual')
  })
})

// The rest of the screen.

test('"Set up your real plan" leads on to the practice step', async () => {
  const onPractice = vi.fn()
  renderEnding(model, 'en', { onPractice })
  await userEvent.click(screen.getByRole('button', { name: /set up your real plan/i }))
  expect(onPractice).toHaveBeenCalledTimes(1)
})

test('the small print carries every note', () => {
  renderEnding(model)
  const notes = (Object.keys(en) as Key[]).filter((k) => k.startsWith('smallprint.'))
  expect(notes.length).toBeGreaterThanOrEqual(9)
  for (const k of notes) expect(screen.getByText(en[k])).toBeInTheDocument()
})

test('on screen in order: result, chart, reveal, cards, share and play again, the practice step, small print', () => {
  renderEnding(model)
  const order = [
    screen.getByRole('heading', { level: 1 }),
    screen.getByRole('img', { name: en['ending.lines'] }),
    screen.getByRole('list', { name: en['ending.lines'] }),
    screen.getByRole('region', { name: 'Revealed' }),
    screen.getAllByTestId('lesson-card')[0],
    screen.getAllByTestId('lesson-card')[6],
    screen.getByRole('button', { name: /share/i }),
    screen.getByRole('button', { name: /again/i }),
    screen.getByRole('button', { name: /set up your real plan/i }),
    screen.getByText(en['smallprint.advice']),
  ]
  for (let i = 1; i < order.length; i++) expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('in German', () => {
  renderEnding(model, 'de')
  const plain = (s: string) => s.replace(/\s/g, ' ')
  expect(plain(screen.getByRole('heading', { level: 1 }).textContent!)).toBe(plain(`Am Ende hast du ${money(model.final, 'de')}.`))
  expect(screen.getByText('Deine 20 Jahre')).toBeInTheDocument()
  expect(screen.getByText(/am US-Aktienmarkt erlebt/)).toBeInTheDocument()
  expect(screen.getAllByTestId('lesson-card')[6]).toHaveTextContent('Der Notgroschen')
  expect(screen.getByRole('button', { name: 'Ergebnis teilen' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Nochmal spielen' })).toBeInTheDocument()
})

test('no NaN, Infinity, minus zero or unfilled placeholder, whatever the run, in either language', async () => {
  const logs: Decision[][] = [
    yearly(20, 0.15, 0.7),
    [],
    yearly(20, 0, 0.5),
    [...yearly(20, 0, 0.5), ev('windfall', 'decline')], // nothing ever paid in: a final of €0
    [...yearly(20, 0, 1), ev('windfall', 'spread')],
    [
      ...yearly(20, 0.3, 1),
      ev('werner', 'follow'),
      ev('keller', 'follow'),
      ev('jonas', 'follow'),
      ev('windfall', 'spread'),
      ...setup.takeovers.map((at): Decision => ({ kind: 'crash', at, choice: 'sell' })),
    ],
  ]
  for (const log of logs) {
    for (const lang of ['en', 'de'] as const) {
      const { container, unmount } = renderEnding(buildEnding(market, setup, log), lang)
      const text = container.textContent! + (await manualShareText())
      expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
      expect(text).not.toMatch(/NaN|Infinity|[{}]/)
      expect(text).not.toMatch(/[-−]\s*€?\s*0(?![\d.,])/)
      unmount()
      vi.unstubAllGlobals()
    }
  }
})

// In the app.

/** Plays seed 5 to its end: "Next year", else "Hold", else the first reply. */
async function playToEnd(): Promise<void> {
  render(<App seed={5} instant cooldownMs={0} />)
  await userEvent.click(screen.getByRole('button', { name: /start/i }))
  for (let i = 0; i < 80 && !screen.queryByTestId('ending'); i++) {
    const b = screen.queryByRole('button', { name: /next year/i }) ?? screen.queryByRole('button', { name: /^hold$/i }) ?? screen.getAllByTestId('reply')[0]
    await userEvent.click(b)
  }
}

test('the app ends a run on the ending screen, with the focus on the result; play again starts a new run', async () => {
  await playToEnd()
  expect(screen.getByTestId('ending')).toBeInTheDocument()
  expect(screen.getAllByTestId('lesson-card')).toHaveLength(7)
  expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  expect(screen.getByRole('region', { name: 'Revealed' })).toHaveTextContent(/1969 to 1989/)
  await userEvent.click(screen.getByRole('button', { name: /again/i }))
  expect(screen.queryByTestId('ending')).toBeNull()
  expect(screen.getByText('Year 1 of 20')).toBeInTheDocument()
})

test('the app leads from the ending to the practice step', async () => {
  await playToEnd()
  await userEvent.click(screen.getByRole('button', { name: /set up your real plan/i }))
  expect(screen.queryByTestId('ending')).toBeNull()
  expect(screen.getByTestId('practice')).toBeInTheDocument()
})
