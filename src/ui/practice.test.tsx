import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type Lang, t } from '../i18n'
import { en } from '../i18n/en'
import { App } from './App'
import { LangContext } from './lang'
import { PracticeScreen } from './screens/PracticeScreen'

// The brief's tests, verbatim.

test('amount is prefilled from the game', () => { render(<PracticeScreen saveRate={0.15} salary={2400} onDone={() => {}} />); expect(screen.getByLabelText(/how much/i)).toHaveValue(360); });
test('wrong product explains and blocks', async () => {
  render(<PracticeScreen saveRate={0.15} salary={2400} onDone={() => {}} />);
  await userEvent.click(screen.getByRole('radio', { name: /managed fund/i }));
  expect(screen.getByRole('alert')).toBeInTheDocument(); expect(screen.getByRole('button', { name: /start savings plan/i })).toBeDisabled();
});
test('right product leads to the checklist with index names only', async () => {
  render(<PracticeScreen saveRate={0.15} salary={2400} onDone={() => {}} />);
  await userEvent.click(screen.getByRole('radio', { name: /world/i })); await userEvent.click(screen.getByRole('button', { name: /start savings plan/i }));
  expect(screen.getByText(/MSCI World/)).toBeInTheDocument(); expect(screen.getByText(/FTSE All-World/)).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/iShares|Vanguard|Xtrackers|Trade Republic|Scalable/i);
});

// Helpers for the tests below.

function renderPractice(props: { saveRate?: number; salary?: number; onDone?(): void; lang?: Lang } = {}) {
  const { saveRate = 0.15, salary = 2400, onDone = () => {}, lang = 'en' } = props
  return render(
    <LangContext.Provider value={{ lang, setLang: () => {}, t: (key, params) => t(lang, key, params) }}>
      <PracticeScreen saveRate={saveRate} salary={salary} onDone={onDone} />
    </LangContext.Provider>,
  )
}

const start = () => screen.getByRole('button', { name: /start savings plan/i })
const amount = () => screen.getByLabelText(/how much/i)
const pickWorld = () => userEvent.click(screen.getByRole('radio', { name: /world/i }))

async function setAmount(text: string): Promise<void> {
  await userEvent.clear(amount())
  if (text) await userEvent.type(amount(), text)
}

// The form.

test('the root is the practice screen, marked as practice', () => {
  renderPractice()
  expect(screen.getByTestId('practice')).toBeInTheDocument()
  expect(within(screen.getByTestId('practice')).getByText(en['practice.badge'])).toBeVisible()
  expect(screen.getByRole('heading', { level: 1, name: en['practice.title'] })).toBeInTheDocument()
})

test('the heading has the focus when the screen opens', () => {
  renderPractice()
  expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
})

test('the three products are offered and none is chosen at first', () => {
  renderPractice()
  const radios = within(screen.getByRole('group', { name: en['practice.what'] })).getAllByRole('radio')
  expect(radios).toHaveLength(3)
  for (const radio of radios) expect(radio).not.toBeChecked()
  expect(screen.getByRole('radio', { name: /world/i })).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: /theme/i })).not.toHaveAccessibleName(/world/i)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(start()).toBeDisabled()
})

test('each wrong product shows its own reason, and picking again clears it', async () => {
  renderPractice()
  await userEvent.click(screen.getByRole('radio', { name: /theme/i }))
  expect(screen.getByRole('alert')).toHaveTextContent(en['practice.reason.theme'])
  expect(start()).toBeDisabled()
  await userEvent.click(screen.getByRole('radio', { name: /managed fund/i }))
  expect(screen.getByRole('alert')).toHaveTextContent(en['practice.reason.fund'])
  expect(start()).toBeDisabled()
  await pickWorld()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(start()).toBeEnabled()
})

test('the amount shows its share of the income and follows edits', async () => {
  renderPractice()
  expect(screen.getByText('15% of your income')).toBeInTheDocument()
  await setAmount('480')
  expect(amount()).toHaveValue(480)
  expect(screen.getByText('20% of your income')).toBeInTheDocument()
})

test('an empty, zero or negative amount blocks the plan', async () => {
  renderPractice()
  await pickWorld()
  expect(start()).toBeEnabled()
  await setAmount('')
  expect(start()).toBeDisabled()
  await setAmount('0')
  expect(start()).toBeDisabled()
  await setAmount('-50')
  expect(start()).toBeDisabled()
  await setAmount('50')
  expect(start()).toBeEnabled()
})

test('a disabled "Start savings plan" says why under it, and the reason goes once it is enabled', async () => {
  renderPractice()
  const hint = () => document.getElementById(start().getAttribute('aria-describedby')!)
  expect(start()).toBeDisabled()
  expect(start()).toHaveAccessibleDescription(en['practice.start.needProduct'])
  expect(hint()).toBeVisible()
  // The hint sits right after the button.
  expect(start().compareDocumentPosition(hint()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

  await userEvent.click(screen.getByRole('radio', { name: /theme/i }))
  expect(start()).toHaveAccessibleDescription(en['practice.start.needOther'])

  await pickWorld()
  expect(start()).toBeEnabled()
  expect(start()).not.toHaveAttribute('aria-describedby')
  expect(screen.queryByText(en['practice.start.needProduct'])).toBeNull()
  expect(screen.queryByText(en['practice.start.needOther'])).toBeNull()

  for (const bad of ['', '0', '-5']) {
    await setAmount(bad)
    expect(start()).toHaveAccessibleDescription(en['practice.start.needAmount'])
  }

  // With neither a product nor an amount, the product comes first, as on the form.
  await userEvent.click(screen.getByRole('radio', { name: /managed fund/i }))
  expect(start()).toHaveAccessibleDescription(en['practice.start.needOther'])
})

test('the reason under a disabled "Sparplan starten", in German', async () => {
  renderPractice({ lang: 'de' })
  expect(screen.getByText('Wähle zuerst aus, was du kaufen willst.')).toBeVisible()
  await userEvent.click(screen.getByRole('radio', { name: /Weltweiter/ }))
  await userEvent.clear(screen.getByLabelText(/wie viel/i))
  expect(screen.getByText('Gib einen Betrag über null ein.')).toBeVisible()
})

test('a run that saved nothing starts at zero and can be edited', async () => {
  const { container } = renderPractice({ saveRate: 0 })
  expect(amount()).toHaveValue(0)
  await pickWorld()
  expect(start()).toBeDisabled()
  await setAmount('100')
  expect(start()).toBeEnabled()
  expect(container.textContent).not.toMatch(/NaN|Infinity/)
})

test('the day is the 1st at first and can be the 15th; payouts reinvest at first', async () => {
  renderPractice()
  expect(screen.getByRole('radio', { name: en['practice.when.1'] })).toBeChecked()
  expect(screen.getByRole('radio', { name: en['practice.payouts.reinvest'] })).toBeChecked()
  await userEvent.click(screen.getByRole('radio', { name: en['practice.when.15'] }))
  await userEvent.click(screen.getByRole('radio', { name: en['practice.payouts.payOut'] }))
  expect(screen.getByRole('radio', { name: en['practice.when.15'] })).toBeChecked()
  expect(screen.getByRole('radio', { name: en['practice.payouts.payOut'] })).toBeChecked()
  await pickWorld()
  expect(start()).toBeEnabled()
})

test('every control can be reached with the keyboard', async () => {
  renderPractice()
  const seen = new Set<string>()
  for (let i = 0; i < 14; i++) {
    await userEvent.tab()
    seen.add(document.activeElement?.getAttribute('type') ?? document.activeElement?.tagName ?? '')
  }
  expect(seen).toContain('number')
  expect(seen).toContain('radio')
  expect(seen).toContain('button')
})

// The confirmation.

async function confirm(day: 'when.1' | 'when.15' = 'when.1'): Promise<void> {
  await userEvent.click(screen.getByRole('radio', { name: en[`practice.${day}`] }))
  await pickWorld()
  await userEvent.click(start())
}

test('confirming shows the plan in one line, the checklist and the small print, with the focus on the heading', async () => {
  renderPractice()
  await setAmount('300')
  await confirm('when.15')
  const heading = screen.getByRole('heading', { level: 1, name: en['practice.done.title'] })
  expect(heading).toHaveFocus()
  expect(screen.getByText(en['practice.badge'])).toBeVisible()
  expect(screen.queryByRole('button', { name: /start savings plan/i })).toBeNull()

  const plan = screen.getByTestId('practice-plan')
  expect(plan).toHaveTextContent(en['practice.option.world'])
  expect(plan).toHaveTextContent('€300')
  expect(plan).toHaveTextContent(en['practice.when.15'])
  expect(plan).toHaveTextContent(en['practice.payouts.reinvest'])

  const steps = within(screen.getByRole('list', { name: en['practice.done.text'] })).getAllByRole('listitem')
  expect(steps.map((li) => li.textContent)).toEqual(
    (['practice.check.first', 'practice.check.1', 'practice.check.2', 'practice.check.3', 'practice.check.4'] as const).map((k) => en[k]),
  )
  for (const name of ['MSCI World', 'FTSE All-World', 'MSCI ACWI']) expect(screen.getByRole('list', { name: en['practice.done.text'] })).toHaveTextContent(name)
  for (const key of Object.keys(en).filter((k) => k.startsWith('smallprint.'))) expect(screen.getByText(en[key as keyof typeof en])).toBeInTheDocument()
  expect(screen.getByText('Every stretch of history in this game was chosen to contain at least one serious crash.')).toBeInTheDocument()
})

test('"Back to the start" calls onDone', async () => {
  const onDone = vi.fn()
  renderPractice({ onDone })
  await confirm()
  expect(onDone).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: en['practice.back'] }))
  expect(onDone).toHaveBeenCalledTimes(1)
})

test('no fund or broker names, and no index names before the checklist', async () => {
  const { container } = renderPractice()
  expect(container.textContent).not.toMatch(/MSCI|FTSE|ACWI/)
  await confirm()
  expect(container.textContent).not.toMatch(/iShares|Vanguard|Xtrackers|Amundi|SPDR|Trade Republic|Scalable|Finanzfluss|NaN|Infinity|[{}]/i)
})

test('German: du, the real words, no placeholders left over', async () => {
  const { container } = renderPractice({ lang: 'de' })
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Neuer Sparplan')
  expect(screen.getByText('Übung')).toBeVisible()
  expect(screen.getByText('15 % deines Einkommens')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('radio', { name: /Gemanagter Fonds/ }))
  expect(screen.getByRole('alert')).toHaveTextContent(/dein|du/)
  await userEvent.click(screen.getByRole('radio', { name: /Weltweiter/ }))
  await userEvent.click(screen.getByRole('button', { name: /Sparplan starten/i }))
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Übungs-Sparplan')
  expect(container.textContent).not.toMatch(/[{}]|NaN/)
})

// In the app.

async function playToEnd(): Promise<void> {
  render(<App seed={5} instant cooldownMs={0} />)
  await userEvent.click(screen.getByRole('button', { name: /start/i }))
  for (let i = 0; i < 80 && !screen.queryByTestId('ending'); i++) {
    const b = screen.queryByRole('button', { name: /next year/i }) ?? screen.queryByRole('button', { name: /^hold$/i }) ?? screen.getAllByTestId('reply')[0]
    await userEvent.click(b)
  }
}

test('in the app: the plan is prefilled from the run, and "Back to the start" returns to the start screen', async () => {
  await playToEnd()
  await userEvent.click(screen.getByRole('button', { name: /set up your real plan/i }))
  expect(screen.getByTestId('practice')).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  expect((amount() as HTMLInputElement).valueAsNumber).toBeGreaterThan(0)
  await confirm()
  await userEvent.click(screen.getByRole('button', { name: en['practice.back'] }))
  expect(screen.queryByTestId('practice')).toBeNull()
  expect(screen.getByRole('button', { name: en['start.button'] })).toBeInTheDocument()
})
