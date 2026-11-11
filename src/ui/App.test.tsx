import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { Header } from './components/Header'
import { ageInYear } from './useReveal'

afterEach(() => {
  vi.restoreAllMocks()
})

test('start screen leads into year 1', async () => {
  render(<App seed={3} instant cooldownMs={0} />); await userEvent.click(screen.getByRole('button', { name: /start/i }));
  expect(screen.getByText(/year 1/i)).toBeInTheDocument();
});
test('language switch keeps the run', async () => {             // Review Focus 4
  render(<App seed={3} instant cooldownMs={0} />); await userEvent.click(screen.getByRole('button', { name: /start/i }));
  await userEvent.click(screen.getByRole('button', { name: 'DE' }));
  expect(screen.getByText(/jahr 1/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'EN' }));
  expect(screen.getByText(/year 1/i)).toBeInTheDocument();
});
test('no calendar year is visible while playing', async () => {
  const { container } = render(<App seed={3} instant cooldownMs={0} />); await userEvent.click(screen.getByRole('button', { name: /start/i }));
  expect(container.textContent).not.toMatch(/\b(18|19|20)\d\d\b/);
});

test('the start screen shows the title, the pitch and the advice note, and gives away neither market nor years', () => {
  const { container } = render(<App seed={3} instant cooldownMs={0} />)
  expect(screen.getByRole('heading', { name: 'The Long Run' })).toBeInTheDocument()
  expect(screen.getByText(/your first salary just landed: €2,200 a month/i)).toBeInTheDocument()
  expect(screen.getByText(/education, not investment advice/i)).toBeInTheDocument()
  expect(container.textContent).not.toMatch(/\b(18|19|20)\d\d\b/)
  expect(container.textContent).not.toMatch(/\bUS\b|S&P|Shiller|America/i)
})

test('the language can be switched on the start screen, and the switch shows which one is on', async () => {
  render(<App seed={3} instant cooldownMs={0} />)
  expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'DE' })).toHaveAttribute('aria-pressed', 'false')
  await userEvent.click(screen.getByRole('button', { name: 'DE' }))
  expect(screen.getByRole('heading', { name: 'Auf lange Sicht' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'DE' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'false')
  expect(document.documentElement.lang).toBe('de')
})

test('the starting language follows the browser', () => {
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('de-AT')
  render(<App seed={3} instant cooldownMs={0} />)
  expect(screen.getByRole('heading', { name: 'Auf lange Sicht' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'DE' })).toHaveAttribute('aria-pressed', 'true')
})

test('the game starts from the keyboard', async () => {
  render(<App seed={3} instant cooldownMs={0} />)
  const start = screen.getByRole('button', { name: /start/i })
  for (let i = 0; i < 5 && document.activeElement !== start; i++) await userEvent.tab()
  expect(start).toHaveFocus()
  await userEvent.keyboard('{Enter}')
  expect(screen.getByText(/year 1/i)).toBeInTheDocument()
})

test('year 1 shows the age, an empty total and the chart', async () => {
  render(<App seed={3} instant cooldownMs={0} />); await userEvent.click(screen.getByRole('button', { name: /start/i }))
  expect(screen.getByText('Year 1 of 20')).toBeInTheDocument()
  // The start screen said 22: year 1 is that year.
  expect(screen.getByText('Age 22')).toBeInTheDocument()
  // The year screen lists €0 in each account too, so look in the header.
  expect(within(document.querySelector('header')!).getByText('€0')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Your money over the years' })).toBeInTheDocument()
})

describe('reduced motion', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** A system that does or does not ask for reduced motion. */
  const reduce = (on: boolean) => {
    const matchMedia = vi.fn((query: string) => ({ matches: on && query === '(prefers-reduced-motion: reduce)', media: query }))
    vi.stubGlobal('matchMedia', matchMedia)
    return matchMedia
  }

  /** Seed 3: Uncle Werner writes once year 1 has been drawn. */
  const playYear1 = async () => {
    render(<App seed={3} cooldownMs={0} />)
    await userEvent.click(screen.getByRole('button', { name: /start/i }))
    await userEvent.click(screen.getByRole('button', { name: /next year/i }))
  }

  test('when the system asks for it, a year resolves at once and nothing is marked to animate', async () => {
    const matchMedia = reduce(true)
    await playYear1()
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
    expect(document.querySelector('.app')).toHaveAttribute('data-instant')
    expect(screen.getByText('Uncle Werner')).toBeInTheDocument()
    expect(screen.getAllByTestId('reply')).toHaveLength(2)
  })

  test('otherwise the year is still being drawn right after "Next year"', async () => {
    reduce(false)
    await playYear1()
    expect(document.querySelector('.app')).not.toHaveAttribute('data-instant')
    expect(screen.queryByText('Uncle Werner')).toBeNull()
    expect(screen.queryAllByTestId('reply')).toHaveLength(0)
    expect(screen.getByText('Year 1 of 20')).toBeInTheDocument()
  })
})

test('the age goes up by one each year: 22 in year 1, 41 in year 20', () => {
  expect(ageInYear(1)).toBe(22)
  expect(ageInYear(2)).toBe(23)
  expect(ageInYear(20)).toBe(41)
})

describe('Header', () => {
  test('shows the year, the age and the total', () => {
    render(<Header year={3} age={25} total={7960} change={2310} mood="calm" />)
    expect(screen.getByText('Year 3 of 20')).toBeInTheDocument()
    expect(screen.getByText('Age 25')).toBeInTheDocument()
    expect(screen.getByText('€7,960')).toBeInTheDocument()
  })

  test('a gain carries an up arrow and a loss a down arrow, not only a colour', () => {
    const { rerender } = render(<Header year={3} age={25} total={7960} change={2310} mood="calm" />)
    expect(screen.getByText('▲ €2,310 this year')).toBeInTheDocument()
    rerender(<Header year={7} age={29} total={18420} change={-9480} mood="crash" />)
    expect(screen.getByText('▼ €9,480 this year')).toBeInTheDocument()
  })

  test('has the language switch', () => {
    render(<Header year={1} age={23} total={0} change={0} mood="calm" />)
    expect(screen.getByRole('button', { name: 'EN' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'DE' })).toBeInTheDocument()
  })
})
