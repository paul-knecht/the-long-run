import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { market } from '../data'
import { money, percent } from '../i18n'
import { START_DIALS } from '../sim/constants'
import { createSetup } from '../sim/setup'
import { simulate } from '../sim/simulate'
import type { Decision, Holdings, Pending, Snapshot, Timeline } from '../sim/types'
import { App, useLang as useLangFromApp } from './App'
import { Dial } from './components/Dial'
import { useLang } from './lang'
import { CrashScreen } from './screens/CrashScreen'
import { MessageScreen } from './screens/MessageScreen'
import { useReveal } from './useReveal'

afterEach(() => {
  vi.useRealTimers()
})

// The brief's tests, verbatim except for the seed of 'double tap records one decision' (see below).

const start = async (seed = 3) => { render(<App seed={seed} instant cooldownMs={0} />); await userEvent.click(screen.getByRole('button', { name: /start/i })); };
test('next year advances twelve months', async () => { await start(); await userEvent.click(screen.getByRole('button', { name: /next year/i })); expect(screen.getByText(/year 2/i)).toBeInTheDocument(); });
// Seed 25 instead of the brief's 3: seed 3 deals Uncle Werner at month 12, so its second "Next year"
// is not on screen. Seed 25 has neither an event nor a crash in its first two years, which is what
// this test assumes.
test('double tap records one decision', () => {                   // Review Focus 3
  vi.useFakeTimers(); render(<App seed={25} instant />);            // default cooldown
  fireEvent.click(screen.getByRole('button', { name: /start/i })); act(() => { vi.advanceTimersByTime(500); });
  fireEvent.click(screen.getByRole('button', { name: /next year/i })); fireEvent.click(screen.getByRole('button', { name: /next year/i }));
  expect(screen.getByText(/year 2/i)).toBeInTheDocument(); expect(screen.queryByText(/year 3/i)).toBeNull();
  act(() => { vi.advanceTimersByTime(500); }); fireEvent.click(screen.getByRole('button', { name: /next year/i }));
  expect(screen.getByText(/year 3/i)).toBeInTheDocument(); vi.useRealTimers();
});
test('a whole run can be played to the ending', async () => {
  await start(5);
  for (let i = 0; i < 80 && !screen.queryByTestId('ending'); i++) {
    const b = screen.queryByRole('button', { name: /next year/i }) ?? screen.queryByRole('button', { name: /^hold$/i }) ?? screen.getAllByTestId('reply')[0];
    await userEvent.click(b);
  }
  expect(screen.getByTestId('ending')).toBeInTheDocument();
});
test('messages carry no verdicts', async () => {
  await start(5); for (let i = 0; i < 8; i++) { const r = screen.queryAllByTestId('reply'); if (r.length) break; await userEvent.click(screen.getByRole('button', { name: /next year/i })); }
  expect(screen.getByText(/You now qualify for our managed fund/)).toBeInTheDocument(); // added: seed 5 reaches Mr. Keller's message in year 3
  expect(document.body.textContent).not.toMatch(/mistake|wrong|good choice|well done/i);
});

// Helpers for the tests below.

/** Clicks on through the run: "Next year", else "Hold", else the reply `pick` chooses (the first by default). */
async function playUntil(done: () => boolean, pick: (labels: string[]) => number = () => 0): Promise<void> {
  for (let i = 0; i < 80 && !done(); i++) {
    const onward = screen.queryByRole('button', { name: /next year|nächstes jahr/i }) ?? screen.queryByRole('button', { name: /^(hold|halten)$/i })
    if (onward) {
      await userEvent.click(onward)
      continue
    }
    const replies = screen.getAllByTestId('reply')
    await userEvent.click(replies[Math.max(0, pick(replies.map((r) => r.textContent ?? '')))])
  }
  expect(done()).toBe(true)
}

/** Advances fake time in small slices, so each month's timer is set after the previous month has rendered. */
function wait(ms: number): void {
  for (let elapsed = 0; elapsed < ms; elapsed += 50) act(() => { vi.advanceTimersByTime(50) })
}

/** A hand-made timeline that stops at `at` with these holdings; the index peaks at `peak` and then falls. */
function timelineAt(at: number, holdings: Partial<Holdings>, pending: Pending, peak = 0): Timeline {
  const h: Holdings = { cash: 0, etf: 0, fund: 0, stock: 0, ...holdings }
  const total = h.cash + h.etf + h.fund + h.stock
  const snapshot = (month: number): Snapshot => ({
    month,
    holdings: h,
    total,
    index: month <= peak ? 1 + month / 100 : (1 + peak / 100) * (1 - (month - peak) / 100),
    salary: 2500,
    emergencyTarget: 7500,
  })
  return {
    snapshots: Array.from({ length: at + 1 }, (_, m) => snapshot(m)),
    flows: Array.from({ length: at + 1 }, () => 0),
    pending,
    dials: { ...START_DIALS },
    riskyTarget: 'etf',
    parked: null,
    bill: null,
  }
}

const save = () => screen.getByRole('slider', { name: 'You put aside' })
const split = () => screen.getByRole('slider', { name: 'Where new money goes' })
const holdings = () => screen.getByRole('region', { name: 'Where your money is' })

describe('the year screen', () => {
  test('has the two dials, starting at the values in force', async () => {
    await start(25)
    expect(save()).toHaveAttribute('min', '0')
    expect(save()).toHaveAttribute('max', '30')
    expect(save()).toHaveAttribute('step', '1')
    expect(save()).toHaveValue('10')
    expect(save()).toHaveAttribute('aria-valuetext', '10% · €220')
    expect(screen.getByText('10% · €220')).toBeInTheDocument()
    expect(split()).toHaveAttribute('min', '0')
    expect(split()).toHaveAttribute('max', '100')
    expect(split()).toHaveAttribute('step', '10')
    expect(split()).toHaveValue('50')
    expect(screen.getByText('You earn')).toBeInTheDocument()
    expect(screen.getByText('€2,200 / month')).toBeInTheDocument()
  })

  test('the split dial is labelled at both ends', async () => {
    await start(25)
    const ends = screen.getByTestId('split-ends')
    expect(within(ends).getByText('ETF')).toBeInTheDocument()
    expect(within(ends).getByText('Savings account')).toBeInTheDocument()
    expect(screen.getByText('ETF 50% · Savings 50%')).toBeInTheDocument()
  })

  test('the 10 to 20% zone is marked on the save dial, without words', async () => {
    await start(25)
    const zone = save().closest('.dial')!.querySelector('.dial-zone') as HTMLElement
    expect(zone).not.toBeNull()
    expect(Number(zone.parentElement!.style.getPropertyValue('--lo'))).toBeCloseTo(1 / 3)
    expect(Number(zone.parentElement!.style.getPropertyValue('--hi'))).toBeCloseTo(2 / 3)
    expect(zone.textContent).toBe('')
  })

  test('next year records the dials, and the next year starts from them', async () => {
    await start(25)
    fireEvent.change(save(), { target: { value: '20' } })
    fireEvent.change(split(), { target: { value: '80' } })
    expect(screen.getByText('20% · €440')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /next year/i }))
    expect(screen.getByText('Year 2 of 20')).toBeInTheDocument()
    expect(save()).toHaveValue('20')
    expect(split()).toHaveValue('80')
    // Year 2 pays 3% more: 20% of €2,266.
    expect(screen.getByText('€2,266 / month')).toBeInTheDocument()
    expect(screen.getByText('20% · €453')).toBeInTheDocument()
  })

  test('the emergency fund counts months of income, up to three', async () => {
    await start(25)
    expect(screen.getByText('Emergency fund')).toBeInTheDocument()
    expect(screen.getByText('0 of 3 months')).toBeInTheDocument()
    fireEvent.change(save(), { target: { value: '30' } })
    fireEvent.change(split(), { target: { value: '0' } })
    await userEvent.click(screen.getByRole('button', { name: /next year/i }))
    // Twelve months of €660 is about 3.6 months of a €2,200 salary: the bar is full at three.
    expect(screen.getByText('3 of 3 months')).toBeInTheDocument()
  })

  test('shows the savings account and the ETF, and the fund only while it holds money', async () => {
    await start(25)
    expect(within(holdings()).getByText('Savings account')).toBeInTheDocument()
    expect(within(holdings()).getByText('ETF')).toBeInTheDocument()
    expect(within(holdings()).queryByText("Mr. Keller's fund")).toBeNull()
    expect(within(holdings()).queryByText("Jonas's stock")).toBeNull()

    // Turn Uncle Werner down, then say yes to Mr. Keller.
    await playUntil(() => screen.queryByRole('button', { name: 'Yes, move it over' }) !== null, (labels) => labels.findIndex((l) => /keeping my ETF/.test(l)))
    await userEvent.click(screen.getByRole('button', { name: 'Yes, move it over' }))
    expect(within(holdings()).getByText("Mr. Keller's fund")).toBeInTheDocument()
    expect(within(screen.getByTestId('split-ends')).getByText("Mr. Keller's fund")).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Switch back to the ETF' }))
    expect(within(holdings()).queryByText("Mr. Keller's fund")).toBeNull()
    expect(screen.queryByRole('button', { name: 'Switch back to the ETF' })).toBeNull()
    expect(within(screen.getByTestId('split-ends')).getByText('ETF')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next year/i })).toBeInTheDocument()
  })

  test('after a year has played, one headline matches how the market went', async () => {
    await start(25)
    expect(screen.queryByText('Headline')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /next year/i }))
    // Seed 25's first year: the index rose about 14%, so an "up" headline (the first one, for year 1).
    const timeline = simulate(createSetup(market, 25), [{ kind: 'year', at: 0, ...START_DIALS }])
    expect(timeline.snapshots[12].index / timeline.snapshots[0].index - 1).toBeGreaterThan(0.1)
    expect(screen.getAllByText('Headline')).toHaveLength(1)
    expect(screen.getByText('Stocks keep climbing. Taxi drivers are giving share tips.')).toBeInTheDocument()
  })

  test('the controls wait while the year is drawn, 150 ms a month', () => {
    vi.useFakeTimers()
    render(<App seed={25} cooldownMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    fireEvent.click(screen.getByRole('button', { name: /next year/i }))
    expect(screen.getByRole('button', { name: /next year/i })).toBeDisabled()
    expect(save()).toBeDisabled()
    expect(split()).toBeDisabled()
    wait(150 * 11)
    expect(screen.getByText('Year 1 of 20')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next year/i })).toBeDisabled()
    wait(150)
    expect(screen.getByText('Year 2 of 20')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next year/i })).toBeEnabled()
    expect(save()).toBeEnabled()
    // While year 2 is drawn the header says year 2, from its very first step.
    fireEvent.click(screen.getByRole('button', { name: /next year/i }))
    expect(screen.getByText('Year 2 of 20')).toBeInTheDocument()
    wait(150 * 11)
    expect(screen.getByText('Year 2 of 20')).toBeInTheDocument()
    wait(150)
    expect(screen.getByText('Year 3 of 20')).toBeInTheDocument()
  })

  test('while the year is drawn, the panels follow the chart instead of showing the year end', () => {
    vi.useFakeTimers()
    render(<App seed={25} cooldownMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    fireEvent.change(save(), { target: { value: '30' } })
    fireEvent.change(split(), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: /next year/i }))
    const timeline = simulate(createSetup(market, 25), [{ kind: 'year', at: 0, saveRate: 0.3, etfShare: 0 }])
    const cashAt = (m: number): string => money(timeline.snapshots[m].holdings.cash, 'en')
    wait(150 * 6)
    // Half way: six months of €660 is 1.8 months of a €2,200 salary.
    expect(within(holdings()).getByText(cashAt(6))).toBeInTheDocument()
    expect(screen.getByText('1.8 of 3 months')).toBeInTheDocument()
    expect(screen.getByText('€2,200 / month')).toBeInTheDocument()
    expect(within(holdings()).queryByText(cashAt(12))).toBeNull()
    expect(screen.queryByText('3 of 3 months')).toBeNull()
    wait(150 * 6)
    // Drawn: the year end, and the pay of the year ahead.
    expect(within(holdings()).getByText(cashAt(12))).toBeInTheDocument()
    expect(screen.getByText('3 of 3 months')).toBeInTheDocument()
    expect(screen.getByText('€2,266 / month')).toBeInTheDocument()
  })
})

describe('the message screen', () => {
  test('takes the focus on a neutral spot, one Tab from the first reply', async () => {
    await start(3)
    await userEvent.click(screen.getByRole('button', { name: /next year/i }))
    const replies = screen.getAllByTestId('reply')
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement!.closest('.message')).not.toBeNull()
    expect(replies).not.toContain(document.activeElement)
    await userEvent.tab()
    expect(replies[0]).toHaveFocus()
  })

  test('after a reply "Next year" takes the focus without scrolling the chart out of view', async () => {
    await start(3)
    await userEvent.click(screen.getByRole('button', { name: /next year/i }))
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    try {
      await userEvent.keyboard('{Tab}{Enter}')
      const next = screen.getByRole('button', { name: /next year/i })
      expect(next).toHaveFocus()
      expect(focus.mock.contexts.indexOf(next)).toBeGreaterThanOrEqual(0)
      expect(focus.mock.calls[focus.mock.contexts.indexOf(next)]).toEqual([{ preventScroll: true }])
    } finally {
      focus.mockRestore()
    }
  })

  test('shows the sender, the text and one reply per choice, then their reaction', async () => {
    await start(3) // Uncle Werner writes at month 12.
    await userEvent.click(screen.getByRole('button', { name: /next year/i }))
    expect(screen.getByText('Uncle Werner')).toBeInTheDocument()
    expect(screen.getByText(/The stock market is a casino/)).toBeInTheDocument()
    expect(screen.getAllByTestId('reply').map((b) => b.textContent)).toEqual(['Fine, all of it into savings', "No, I'm keeping my ETF"])
    expect(screen.queryByRole('button', { name: /next year/i })).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: "No, I'm keeping my ETF" }))
    expect(screen.getByText('Year 2 of 20')).toBeInTheDocument()
    expect(screen.getByText("Don't come crying to me.")).toBeInTheDocument()
    expect(screen.getByText('Uncle Werner')).toBeInTheDocument()
  })

  test('the bill says the savings account pays it, with one OK', async () => {
    const decide = vi.fn()
    const pending = { kind: 'event', at: 96, event: 'bill', billCovered: true } as const
    render(<MessageScreen timeline={timelineAt(96, { cash: 5000, etf: 9000 }, pending)} pending={pending} salary={2500} decide={decide} />)
    expect(screen.getByText('Car repair shop')).toBeInTheDocument()
    expect(screen.getByText(/That comes to €3,000\./)).toBeInTheDocument()
    expect(screen.getByText('You pay it from your savings account.')).toBeInTheDocument()
    expect(screen.getAllByTestId('reply')).toHaveLength(1)
    await userEvent.click(screen.getByTestId('reply'))
    expect(decide).toHaveBeenCalledWith({ kind: 'event', at: 96, event: 'bill', choice: 'ok' })
  })

  test('the bill says how much of the investments gets sold when savings fall short', () => {
    const pending = { kind: 'event', at: 96, event: 'bill', billCovered: false } as const
    render(<MessageScreen timeline={timelineAt(96, { cash: 1000, etf: 9000 }, pending)} pending={pending} salary={2500} decide={() => {}} />)
    expect(screen.getByText(/so €2,000 of your investments get sold/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pay the bill' })).toHaveAttribute('data-testid', 'reply')
  })

  test('the windfall offers three replies, the raise names the new salary', async () => {
    const decide = vi.fn()
    const windfall = { kind: 'event', at: 120, event: 'windfall' } as const
    const { unmount } = render(<MessageScreen timeline={timelineAt(120, { cash: 100 }, windfall)} pending={windfall} salary={3100} decide={decide} />)
    expect(screen.getByText('Grandma')).toBeInTheDocument()
    expect(screen.getByText(/I've sent you €10,000/)).toBeInTheDocument()
    expect(screen.getAllByTestId('reply').map((b) => b.textContent)).toEqual(['Invest it all now', 'Invest it over 12 months', 'Leave it in savings'])
    await userEvent.click(screen.getByRole('button', { name: 'Invest it over 12 months' }))
    expect(decide).toHaveBeenCalledWith({ kind: 'event', at: 120, event: 'windfall', choice: 'spread' })
    unmount()

    const raise = { kind: 'event', at: 84, event: 'raise' } as const
    render(<MessageScreen timeline={timelineAt(84, { cash: 100 }, raise)} pending={raise} salary={2950} decide={decide} />)
    expect(screen.getByText(/you're on €2,950 a month/)).toBeInTheDocument()
    expect(screen.getAllByTestId('reply').map((b) => b.textContent)).toEqual(['Thank you!'])
  })
})

describe('the crash', () => {
  /** Seed 56: Uncle Werner writes at month 24; the market peaks at month 37 and takes over at month 43, in year 4. */
  const SEED = 56
  const crashSetup = createSetup(market, SEED)
  const takeover = crashSetup.episodes.find((e) => e.triggerMonth === crashSetup.takeovers[0])!

  /** Plays to the first takeover, turning everyone down; `etfShare` (percent) is set on year 1 and kept. */
  const toCrash = async (etfShare?: number): Promise<HTMLElement> => {
    await start(SEED)
    if (etfShare !== undefined) fireEvent.change(split(), { target: { value: String(etfShare) } })
    await playUntil(() => screen.queryByRole('button', { name: 'Hold' }) !== null, (labels) => labels.length - 1)
    return document.querySelector('.app') as HTMLElement
  }

  test('seed 56 takes over in year 4, six months after a high', () => {
    expect(takeover).toMatchObject({ peakMonth: 37, triggerMonth: 43 })
  })

  test('takes over: the ETF price, the fall, a headline, three voices, then the choices', async () => {
    const app = await toCrash()
    expect(app).toHaveAttribute('data-mood', 'crash')
    expect(screen.getByText('Year 4 of 20')).toBeInTheDocument()
    expect(screen.getByText(/Billions wiped out|Panic selling|Get out while you still can|Savers flee/)).toBeInTheDocument()
    expect(screen.getByText("Told you. CASINO. Get out now, before it's all gone.")).toBeInTheDocument()
    expect(screen.getByText(/May I suggest something a little safer/)).toBeInTheDocument()
    expect(screen.getByText(/I stopped my savings plan/)).toBeInTheDocument()
    expect(screen.getByText('Lena')).toBeInTheDocument()
    expect(screen.getByText('What do you do?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sell' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Hold' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /next year/i })).toBeNull()
    // The reply test id belongs to the message screen only.
    expect(screen.queryAllByTestId('reply')).toHaveLength(0)
  })

  test('the chart shows the ETF price, green to the high and red from it to the takeover', async () => {
    await toCrash()
    expect(screen.getByText("The ETF's price")).toBeInTheDocument()
    const chart = screen.getByRole('img', { name: "The ETF's price" })
    const points = (series: string): number => chart.querySelector(`[data-series="${series}"]`)!.getAttribute('points')!.trim().split(/\s+/).length
    expect(points('etf')).toBe(takeover.peakMonth + 1)
    expect(points('etf-loss')).toBe(takeover.triggerMonth! - takeover.peakMonth + 1)
    expect(chart.querySelector('[data-series="you"]')).toBeNull()
  })

  test('the header shows the money invested and what the fall has cost it', async () => {
    await toCrash()
    // The same choices through the engine: 10% saved, half to the ETF, Uncle Werner turned down.
    const at = takeover.triggerMonth!
    const log: Decision[] = [0, 12, 24, 36].map((m): Decision => ({ kind: 'year', at: m, ...START_DIALS }))
    log.push({ kind: 'event', at: 24, event: 'werner', choice: 'decline' })
    const timeline = simulate(crashSetup, log)
    expect(timeline.pending).toMatchObject({ kind: 'crash', at })
    const { etf, fund, stock } = timeline.snapshots[at].holdings
    const invested = etf + fund + stock
    const pct = timeline.pending?.kind === 'crash' ? timeline.pending.drawdown : NaN

    const header = document.querySelector('header')!
    expect(within(header).getByText('Your investments')).toBeInTheDocument()
    expect(within(header).queryByText('Your money')).toBeNull()
    expect(within(header).getByText(money(invested, 'en'))).toBeInTheDocument()
    const line = `▼ ${percent(pct, 'en')} from the high. That's ${money((invested * pct) / (1 - pct), 'en')} of your investments, and falling.`
    expect(within(header).getByText(line)).toBeInTheDocument()
    expect(line.match(/%/g)).toHaveLength(1)
    expect(header.textContent).not.toMatch(/\b(18|19|20)\d\d\b/)
  })

  test('with nothing invested, the header keeps the total and says so', async () => {
    await toCrash(0)
    const header = document.querySelector('header')!
    expect(within(header).getByText('Your money')).toBeInTheDocument()
    expect(within(header).queryByText('Your investments')).toBeNull()
    expect(within(header).getByText(/^▼ \d+% from the high\. None of your money is in the market\.$/)).toBeInTheDocument()
    expect(header.textContent).not.toMatch(/\b(18|19|20)\d\d\b/)
    expect(screen.getByRole('img', { name: "The ETF's price" })).toBeInTheDocument()
  })

  test('takes the focus on a neutral spot, one Tab from Sell', async () => {
    await toCrash()
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement!.closest('.crash')).not.toBeNull()
    expect(document.activeElement!.tagName).not.toBe('BUTTON')
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Sell' })).toHaveFocus()
  })

  test('buy more is disabled, with the reason, when nothing is above the emergency fund', async () => {
    await toCrash()
    expect(screen.getByRole('button', { name: 'Buy more' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Buy more' })).toHaveAccessibleDescription('Nothing above your emergency fund to invest')
  })

  test('buy more can be chosen when there is cash above the emergency fund', async () => {
    const decide = vi.fn()
    const pending = { kind: 'crash', at: 50, drawdown: 0.2 } as const
    // The index peaks at month 30 and is 20% down at month 50.
    render(<CrashScreen timeline={timelineAt(50, { cash: 20000, etf: 10000 }, pending, 30)} pending={pending} shown={50} decide={decide} />)
    expect(screen.getByRole('button', { name: 'Buy more' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Buy more' })).toHaveAccessibleDescription('Invest your savings above the emergency fund')
    expect(screen.getByText('€10,000')).toBeInTheDocument()
    expect(screen.getByText("▼ 20% from the high. That's €2,500 of your investments, and falling.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Buy more' }))
    expect(decide).toHaveBeenCalledWith({ kind: 'crash', at: 50, choice: 'buyMore' })
  })

  test('the voices and the choices wait until the fall has been drawn', () => {
    const pending = { kind: 'crash', at: 50, drawdown: 0.3 } as const
    render(<CrashScreen timeline={timelineAt(50, { cash: 20000, etf: 10000 }, pending, 30)} pending={pending} shown={45} decide={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Hold' })).toBeNull()
    expect(screen.queryByText('Lena')).toBeNull()
    expect(screen.getByText(/and falling/)).toBeInTheDocument()
  })

  test('hold records the choice and the year carries on, showing the total again', async () => {
    await toCrash()
    await userEvent.click(screen.getByRole('button', { name: 'Hold' }))
    // The engine plays to the end of year 4, where Mr. Keller is waiting.
    expect(document.querySelector('.app')).toHaveAttribute('data-mood', 'calm')
    expect(screen.getByText('Year 5 of 20')).toBeInTheDocument()
    expect(screen.getByText(/You now qualify for our managed fund/)).toBeInTheDocument()
    expect(screen.getByText('Your money')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Your money over the years' })).toBeInTheDocument()
  })

  test('after the choice the page goes back to its top, where the chart carries on', async () => {
    await toCrash()
    const scrollTop = vi.spyOn(document.documentElement, 'scrollTop', 'set')
    try {
      await userEvent.click(screen.getByRole('button', { name: 'Hold' }))
      expect(scrollTop).toHaveBeenCalledWith(0)
    } finally {
      scrollTop.mockRestore()
    }
  })

  test('the fall into the takeover is drawn at 500 ms a month, showing the ETF price', () => {
    vi.useFakeTimers()
    render(<App seed={SEED} cooldownMs={0} />)
    fireEvent.click(screen.getByRole('button', { name: /start/i }))
    for (let year = 1; year <= 3; year++) {
      if (year === 3) fireEvent.click(screen.getByRole('button', { name: "No, I'm keeping my ETF" }))
      fireEvent.click(screen.getByRole('button', { name: /next year/i }))
      wait(150 * 12)
    }
    expect(screen.getByText('Year 4 of 20')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /next year/i }))
    // Month 37 is the high, drawn at the normal pace; months 38 to 43 fall at 500 ms each.
    wait(150)
    expect(document.querySelector('.app')).toHaveAttribute('data-mood', 'calm')
    expect(screen.getByRole('img', { name: 'Your money over the years' })).toBeInTheDocument()
    wait(500)
    expect(document.querySelector('.app')).toHaveAttribute('data-mood', 'crash')
    expect(screen.getByRole('img', { name: "The ETF's price" })).toBeInTheDocument()
    expect(screen.getByText('Your investments')).toBeInTheDocument()
    expect(screen.getByText(/from the high\. That's €[\d,]+ of your investments, and falling\./)).toBeInTheDocument()
    wait(500 * 4)
    expect(screen.queryByRole('button', { name: 'Hold' })).toBeNull()
    wait(500)
    expect(screen.getByRole('button', { name: 'Hold' })).toBeEnabled()
  })
})

test('a whole run, in either language, shows no verdict and no calendar year', async () => {
  for (const lang of ['EN', 'DE']) {
    const { unmount } = render(<App seed={5} instant cooldownMs={0} />)
    await userEvent.click(screen.getByRole('button', { name: /start/i }))
    await userEvent.click(screen.getByRole('button', { name: lang }))
    for (let i = 0; i < 80 && !screen.queryByTestId('ending'); i++) {
      expect(document.body.textContent).not.toMatch(/mistake|wrong|good choice|well done|fehler|falsch|gute wahl|gut gemacht/i)
      expect(document.body.textContent).not.toMatch(/\b(18|19|20)\d\d\b/)
      const onward = screen.queryByRole('button', { name: /next year|nächstes jahr/i }) ?? screen.queryByRole('button', { name: /^(hold|halten)$/i }) ?? screen.getAllByTestId('reply')[0]
      await userEvent.click(onward)
    }
    expect(screen.getByTestId('ending')).toBeInTheDocument()
    unmount()
  }
})

test('App re-exports useLang from lang', () => {
  expect(useLangFromApp).toBe(useLang)
})

describe('useReveal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  test('draws one month per step and is busy until it reaches the target', () => {
    const { result, rerender } = renderHook(({ target }) => useReveal(target, { instant: false, msPerMonth: 150 }), { initialProps: { target: 0 } })
    expect(result.current).toEqual({ shown: 0, busy: false })
    rerender({ target: 12 })
    expect(result.current).toEqual({ shown: 0, busy: true })
    wait(100)
    expect(result.current.shown).toBe(0)
    wait(50)
    expect(result.current).toEqual({ shown: 1, busy: true })
    wait(150 * 11)
    expect(result.current).toEqual({ shown: 12, busy: false })
  })

  test('the pace can change from month to month', () => {
    const msPerMonth = (month: number): number => (month > 2 ? 500 : 150)
    const { result, rerender } = renderHook(({ target }) => useReveal(target, { instant: false, msPerMonth }), { initialProps: { target: 0 } })
    rerender({ target: 4 })
    wait(300)
    expect(result.current.shown).toBe(2)
    wait(450)
    expect(result.current.shown).toBe(2)
    wait(50)
    expect(result.current.shown).toBe(3)
    wait(500)
    expect(result.current).toEqual({ shown: 4, busy: false })
  })

  test('instant jumps straight to the target', () => {
    const { result, rerender } = renderHook(({ target }) => useReveal(target, { instant: true, msPerMonth: 150 }), { initialProps: { target: 0 } })
    rerender({ target: 24 })
    expect(result.current).toEqual({ shown: 24, busy: false })
  })

  test('a lower target, as in a new run, is shown at once', () => {
    const { result, rerender } = renderHook(({ target }) => useReveal(target, { instant: false, msPerMonth: 150 }), { initialProps: { target: 0 } })
    rerender({ target: 2 })
    wait(300)
    expect(result.current.shown).toBe(2)
    rerender({ target: 0 })
    expect(result.current).toEqual({ shown: 0, busy: false })
    rerender({ target: 1 })
    expect(result.current).toEqual({ shown: 0, busy: true })
  })
})

describe('Dial', () => {
  test('is a native slider with a label, a shown value and a number on change', () => {
    const onChange = vi.fn()
    render(<Dial label="You put aside" value={15} min={0} max={30} step={1} marks={[10, 20]} format={(v) => `${v}%`} onChange={onChange} />)
    const slider = screen.getByRole('slider', { name: 'You put aside' })
    expect(slider).toHaveAttribute('type', 'range')
    expect(slider).toHaveAttribute('aria-valuetext', '15%')
    expect(screen.getByText('15%')).toBeInTheDocument()
    fireEvent.change(slider, { target: { value: '18' } })
    expect(onChange).toHaveBeenCalledWith(18)
  })

  test('has no marked zone unless asked', () => {
    const { container } = render(<Dial label="Split" value={50} min={0} max={100} step={10} format={(v) => `${v}`} onChange={() => {}} />)
    expect(container.querySelector('.dial-zone')).toBeNull()
  })
})
