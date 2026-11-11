import { createRng } from './rng'

test('same seed, same sequence', () => {
  const a = createRng(7)
  const b = createRng(7)
  expect([a.next(), a.next()]).toEqual([b.next(), b.next()])
})

test('int stays in range', () => {
  const r = createRng(1)
  for (let i = 0; i < 500; i++) {
    const v = r.int(2, 5)
    expect(v >= 2 && v <= 5).toBe(true)
  }
})
