import { de } from './de'
import { en } from './en'
import { money, percent, signed } from './format'
import { crashNameKey, detectLang, t, type Key } from './index'

// The brief's tests, verbatim.

test('German has exactly the English keys', () => { expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort()); });
test('placeholders match between languages', () => {
  const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
  for (const k of Object.keys(en) as Key[]) expect(ph(de[k])).toBe(ph(en[k]));
});
test('formats', () => {
  expect(money(18420.4, 'en')).toBe('€18,420'); expect(money(18420.4, 'de').replace(/\s/g, ' ')).toBe('18.420 €');
  expect(signed(-9480, 'en')).toContain('▼'); expect(signed(2310, 'en')).toContain('▲');
  expect(t('en', 'header.year', { n: 3, of: 20 })).toContain('3');
  expect(detectLang('de-AT')).toBe('de'); expect(detectLang(undefined)).toBe('en');
});
test('no forbidden words', () => {
  const all = [...Object.values(en), ...Object.values(de)].join(' ');
  expect(all).not.toMatch(/Finanzfluss/i); expect(all).not.toMatch(/Bernd/);
  expect(en['card.lumpSum.history']).not.toMatch(/always/i);
});

// More checks on the functions.

/** Intl puts a no-break space into German amounts; tests compare with a plain one. */
const plain = (s: string) => s.replace(/\s/g, ' ')

test('t fills each placeholder and leaves a missing one visible', () => {
  expect(t('en', 'header.year', { n: 3, of: 20 })).toBe('Year 3 of 20')
  expect(t('de', 'header.year', { n: 3, of: 20 })).toBe('Jahr 3 von 20')
  expect(t('en', 'header.year', { n: 3 })).toBe('Year 3 of {of}')
  expect(t('en', 'year.next')).toBe('Next year')
  expect(t('de', 'year.next')).toBe('Nächstes Jahr')
})

test('money is whole euros and never shows a minus zero', () => {
  expect(money(0.4, 'en')).toBe('€0')
  expect(money(-0.4, 'en')).toBe('€0')
  expect(money(-9480, 'en')).toBe('-€9,480')
  expect(plain(money(2200, 'de'))).toBe('2.200 €')
})

test('percent follows the locale', () => {
  expect(percent(0.34, 'en')).toBe('34%')
  expect(plain(percent(0.34, 'de'))).toBe('34 %')
  expect(percent(0.018, 'en', 1)).toBe('1.8%')
  expect(plain(percent(0.018, 'de', 1))).toBe('1,8 %')
  expect(percent(-0.001, 'en')).toBe('0%')
  expect(percent(-0.34, 'en')).toBe('-34%')
})

test('signed carries an arrow for gains and losses, none for nothing', () => {
  expect(signed(2310, 'en')).toBe('▲ €2,310')
  expect(signed(-9480, 'en')).toBe('▼ €9,480')
  expect(plain(signed(-9480, 'de'))).toBe('▼ 9.480 €')
  expect(signed(0.3, 'en')).toBe('€0')
})

test('detectLang picks German for any German locale, English otherwise', () => {
  expect(detectLang('de')).toBe('de')
  expect(detectLang('DE-ch')).toBe('de')
  expect(detectLang('en-GB')).toBe('en')
  expect(detectLang('fr-FR')).toBe('en')
  expect(detectLang('')).toBe('en')
})

test('crashNameKey: an exact year, else the nearest within a year (the later on a tie), else generic', () => {
  expect(crashNameKey(1930)).toBe('crashName.1930')
  expect(crashNameKey(1929)).toBe('crashName.1929')
  expect(crashNameKey(2001)).toBe('crashName.2002')
  expect(crashNameKey(1988)).toBe('crashName.1987')
  expect(crashNameKey(1906)).toBe('crashName.1907')
  expect(crashNameKey(1950)).toBe('crashName.generic')
})

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

test('German is typed by the English keys, so a missing or extra key does not compile', () => {
  const typed: Equal<typeof de, Record<Key, string>> = true
  expect(typed).toBe(true)
})

// Every key the screens were promised.

const EVENT_REPLIES: Record<string, string[]> = {
  werner: ['follow', 'decline'],
  keller: ['follow', 'decline'],
  jonas: ['follow', 'decline'],
  windfall: ['lump', 'spread', 'cash'],
  bill: ['ok'],
  raise: ['ok'],
}

const required = [
  'start.title',
  'start.button',
  'header.year',
  'header.age',
  'header.change',
  'year.next',
  'year.emergency',
  'year.emergencyMonths',
  'dial.save.label',
  'dial.split.label',
  'action.getBackIn',
  'action.switchBackToEtf',
  'action.sellStock',
  ...Object.entries(EVENT_REPLIES).flatMap(([id, choices]) => [
    `event.${id}.from`,
    `event.${id}.text`,
    ...choices.map((c) => `event.${id}.reply.${c}`),
  ]),
  'event.bill.text.covered',
  'event.bill.text.sold',
  'event.bill.text.unpaid',
  ...[1, 2, 3, 4].map((n) => `crash.headline.${n}`),
  'crash.werner',
  'crash.keller',
  'crash.lena',
  'crash.sell',
  'crash.hold',
  'crash.buyMore',
  'crash.buyMore.disabled',
  'crash.fall',
  'crash.fall.now',
  'crash.fall.none',
  'crash.chartLabel',
  'crash.investedLabel',
  ...['up', 'flat', 'down'].flatMap((mood) => [1, 2, 3].map((n) => `headline.${mood}.${n}`)),
  'ending.result',
  'ending.reveal.us',
  'ending.reveal.world',
  ...['held', 'sold', 'etfOnly', 'fundOnly', 'cashOnly'].map((id) => `ending.line.${id}`),
  'ending.share.button',
  'ending.again',
  'ending.toPractice',
  ...['time', 'lumpSum', 'savingsRate', 'split', 'costs', 'stock', 'emergency'].flatMap((id) => [`card.${id}.title`, `card.${id}.other`]),
  'card.time.you.fell',
  'card.time.you.fellOne',
  'card.time.you.notBack',
  'card.time.you.noFall',
  'card.time.history.never15',
  'card.time.history.lost',
  'card.time.history.lostExact',
  'card.lumpSum.you.lump',
  'card.lumpSum.you.spread',
  'card.lumpSum.you.cash',
  'card.lumpSum.history',
  'card.savingsRate.you',
  'card.savingsRate.history',
  'card.split.you',
  'card.split.history',
  'card.costs.you.followed',
  'card.costs.you.declined',
  'card.costs.history',
  'card.stock.you.followed',
  'card.stock.you.followedEmpty',
  'card.stock.you.declined',
  'card.stock.history',
  'card.emergency.you.covered',
  'card.emergency.you.sold',
  'card.emergency.you.unpaid',
  'card.emergency.history',
  ...['1907', '1929', '1930', '1937', '1973', '2000', '2007', 'generic'].map((y) => `crashName.${y}`),
  'practice.option.world',
  'practice.option.theme',
  'practice.option.fund',
  'practice.reason.theme',
  'practice.reason.fund',
  'practice.amount',
  'practice.start',
  'smallprint.advice',
  'smallprint.monthly',
  'smallprint.credit',
  'smallprint.crash',
  'ending.paidIn',
  'ending.paidIn.unpaid',
]

test('every promised key exists', () => {
  for (const k of required) expect(Object.keys(en)).toContain(k)
})

test('placeholders the screens rely on', () => {
  const ph = (k: Key) => (en[k].match(/\{\w+\}/g) ?? []).sort().join()
  expect(ph('header.year')).toBe('{n},{of}')
  expect(ph('card.time.you.fell')).toBe('{drop},{months}')
  expect(ph('card.time.you.fellOne')).toBe('{drop}')
  expect(ph('card.time.you.notBack')).toBe('{drop}')
  expect(ph('card.time.you.noFall')).toBe('')
  expect(ph('card.time.history.never15')).toBe('')
  expect(ph('card.time.history.lost')).toBe('{lostYears},{safeYears}')
  expect(ph('card.time.history.lostExact')).toBe('{lostYears},{safeYears}')
  expect(ph('card.lumpSum.history')).toBe('{pct}')
  expect(ph('card.emergency.you.sold')).toBe('{drop},{sold}')
  expect(ph('card.emergency.you.unpaid')).toBe('')
  expect(ph('event.bill.text.sold')).toBe('{amount}')
  expect(ph('crash.fall')).toBe('{loss},{pct}')
  expect(ph('crash.fall.now')).toBe('{loss},{pct}')
  expect(ph('event.bill.text.unpaid')).toBe('')
  expect(ph('crash.fall.none')).toBe('{pct}')
  expect(ph('ending.paidIn')).toBe('{paidIn}')
  expect(ph('ending.paidIn.unpaid')).toBe('{paidIn}')
  expect(ph('card.savingsRate.you')).toBe('{rate},{saved}')
  expect(ph('card.stock.you.followedEmpty')).toBe('')
  expect(ph('ending.reveal.us')).toBe('{from},{to}')
  expect(ph('ending.crash.history')).toBe('{total},{wins}')
})

// The copy rules.

const entries = (dict: Record<Key, string>) => Object.entries(dict) as [Key, string][]
const both = [...entries(en), ...entries(de)]

test('no em or en dashes', () => {
  for (const [k, v] of both) expect(v, k).not.toMatch(/[\u2013\u2014]/)
})

test('a space follows sentence punctuation', () => {
  // Excepted: the "Mr." abbreviation.
  for (const [k, v] of both) expect(v.replace(/\bMr\./g, 'Mr'), k).not.toMatch(/[a-z\u00e4\u00f6\u00fc\u00df][.!?;:,][A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc]/)
})

test('no verdicts outside the ending cards', () => {
  for (const [k, v] of both) {
    if (!k.startsWith('card.')) expect(v, k).not.toMatch(/mistake|wrong|good choice|well done|fehler|falsch|gute wahl|gut gemacht/i)
  }
})

test('no calendar year outside the crash names', () => {
  for (const [k, v] of both) if (!k.startsWith('crashName.')) expect(v, k).not.toMatch(/\b(18|19|20)\d\d\b/)
})

test('index names appear only in the practice step', () => {
  for (const [k, v] of both) if (!k.startsWith('practice.')) expect(v, k).not.toMatch(/MSCI|FTSE/)
})

test('the cast has its German names', () => {
  expect(en['event.werner.from']).toBe('Uncle Werner')
  expect(de['event.werner.from']).toBe('Onkel Werner')
  expect(de['event.keller.from']).toMatch(/^Herr Keller/)
  for (const [k, v] of entries(de)) expect(v, k).not.toMatch(/Mr\.|Uncle/)
})

test('German says du, except Herr Keller, who is formal with the player and the player with him', () => {
  const keller = new Set<Key>(['event.keller.text', 'event.keller.reply.follow', 'event.keller.reply.decline', 'event.keller.after.follow', 'event.keller.after.decline', 'crash.keller'])
  for (const [k, v] of entries(de)) if (!keller.has(k)) expect(v, k).not.toMatch(/\b(Sie|Ihnen|Ihr|Ihre|Ihren|Ihrem)\b/)
})

test('the themed ETF never says world and carries no cost figure', () => {
  const theme = (d: Record<Key, string>) => [d['practice.option.theme'], d['practice.option.theme.note'], d['practice.reason.theme']].join(' ')
  expect(theme(en)).not.toMatch(/world/i)
  expect(theme(de)).not.toMatch(/welt/i)
  expect(theme(en) + theme(de)).not.toMatch(/\d/)
})

test('history is history, and lump sum wins usually', () => {
  expect(en['card.lumpSum.history']).toMatch(/usually/)
  expect(de['card.lumpSum.history']).toMatch(/meistens/)
  for (const k of ['card.time.history.never15', 'card.time.history.lost', 'card.time.history.lostExact'] as const) {
    expect(en[k]).toMatch(/not a guarantee/)
    expect(de[k]).toMatch(/keine Garantie/)
  }
})

test('the reveal names the US market, its currency and inflation, and the worldwide idea', () => {
  for (const pattern of [/US stock market/, /US dollars/, /inflation/, /worldwide ETF/, /many more countries/]) expect(en['ending.reveal.us']).toMatch(pattern)
  for (const pattern of [/US-Aktienmarkt/, /US-Dollar/, /inflationsbereinigt/, /weltweiter ETF/, /viel mehr Länder/]) expect(de['ending.reveal.us']).toMatch(pattern)
})

test('the small print covers what the brief lists', () => {
  const print = (d: Record<Key, string>) => entries(d).filter(([k]) => k.startsWith('smallprint.')).map(([, v]) => v).join(' ')
  for (const pattern of [/not investment advice/, /no guarantee/, /not adjusted for inflation/, /US stock market/, /US dollars/, /many more countries/, /Robert Shiller/, /DataHub/, /chosen to contain at least one serious crash/]) {
    expect(print(en)).toMatch(pattern)
  }
  for (const pattern of [/keine Anlageberatung/, /keine Garantie/, /nicht inflationsbereinigt/, /US-Aktienmarkt/, /US-Dollar/, /viel mehr Länder/, /Robert Shiller/, /DataHub/, /mindestens einen schweren Crash enthält/]) {
    expect(print(de)).toMatch(pattern)
  }
})

test('labels later screens find by name', () => {
  expect(en['start.button']).toMatch(/start/i)
  expect(en['year.next']).toMatch(/next year/i)
  expect(en['crash.hold']).toMatch(/^hold$/i)
  expect(en['ending.share.button']).toMatch(/share/i)
  expect(en['ending.again']).toMatch(/again/i)
  expect(en['practice.amount']).toMatch(/how much/i)
  expect(en['practice.option.fund']).toMatch(/managed fund/i)
  expect(en['practice.option.world']).toMatch(/world/i)
  expect(en['practice.option.fund'] + en['practice.option.fund.note']).not.toMatch(/world/i)
  expect(en['practice.start']).toMatch(/start savings plan/i)
})
