import { render, screen } from '@testing-library/react'
import { Chart } from './Chart'

test('chart hides the future', () => {
  const { container } = render(<Chart series={[{ id: 'you', values: [0, 1, 2, 3, 4], emphasis: 'main' }]} length={5} shown={2} mood="calm" />);
  expect(container.querySelector('polyline')!.getAttribute('points')!.trim().split(/\s+/).length).toBe(3);
});

/** The [x, y] pairs of a polyline. */
const pointsOf = (polyline: Element): number[][] =>
  polyline.getAttribute('points')!.trim().split(/\s+/).map((pair) => pair.split(',').map(Number))

const viewBoxOf = (container: HTMLElement): { width: number; height: number } => {
  const [, , width, height] = container.querySelector('svg')!.getAttribute('viewBox')!.split(/\s+/).map(Number)
  return { width, height }
}

test('is an image with a label', () => {
  render(<Chart series={[{ id: 'you', values: [0, 10], emphasis: 'main' }]} length={2} shown={1} mood="calm" />)
  expect(screen.getByRole('img', { name: 'Your money over the years' })).toBeInTheDocument()
})

test('scales to its container instead of a fixed pixel size', () => {
  const { container } = render(<Chart series={[{ id: 'you', values: [0, 10], emphasis: 'main' }]} length={2} shown={1} mood="calm" />)
  const svg = container.querySelector('svg')!
  expect(svg.getAttribute('viewBox')).toBeTruthy()
  expect(svg.getAttribute('width')).toBeNull()
  expect(svg.getAttribute('height')).toBeNull()
})

test('the scale gives nothing away about what comes next', () => {
  const draw = (future: number): string => {
    const { container, unmount } = render(
      <Chart series={[{ id: 'you', values: [0, 100, 200, future, future], emphasis: 'main' }]} length={5} shown={2} mood="calm" />,
    )
    const points = container.querySelector('polyline')!.getAttribute('points')!
    unmount()
    return points
  }
  expect(draw(5)).toBe(draw(1_000_000))
})

test('x is sized for the whole run, y runs up from zero and the top stays clear', () => {
  const { container } = render(<Chart series={[{ id: 'you', values: [0, 50, 90, 0, 0], emphasis: 'main' }]} length={5} shown={2} mood="calm" />)
  const { width, height } = viewBoxOf(container)
  const [p0, p1, p2] = pointsOf(container.querySelector('polyline')!)
  // Three of five points shown: the newest sits halfway across, evenly spaced.
  expect(p2[0] / width).toBeCloseTo(0.5, 1)
  expect(p1[0] - p0[0]).toBeCloseTo(p2[0] - p1[0], 5)
  // Higher values are higher up; the highest shown value stays below the top edge.
  expect(p0[1]).toBeGreaterThan(p1[1])
  expect(p1[1]).toBeGreaterThan(p2[1])
  expect(p2[1]).toBeGreaterThan(0.05 * height)
  // Zero is the same height whatever the scale.
  const other = render(<Chart series={[{ id: 'you', values: [0, 5000], emphasis: 'main' }]} length={5} shown={1} mood="calm" />)
  expect(pointsOf(other.container.querySelector('polyline')!)[0][1]).toBe(p0[1])
})

test('every series is cut at the same month, and the main one is drawn strongest and on top', () => {
  const { container } = render(
    <Chart
      series={[
        { id: 'you', values: [0, 10, 20, 30], emphasis: 'main' },
        { id: 'held', values: [0, 12, 24, 36], emphasis: 'strong' },
        { id: 'cashOnly', values: [0, 9, 18, 27], emphasis: 'faint' },
      ]}
      length={4}
      shown={2}
      mood="calm"
    />,
  )
  const lines = [...container.querySelectorAll('polyline')]
  expect(lines.map((l) => pointsOf(l).length)).toEqual([3, 3, 3])
  const width = (id: string) => Number(lines.find((l) => l.getAttribute('data-series') === id)!.getAttribute('stroke-width'))
  expect(width('you')).toBeGreaterThan(width('held'))
  expect(width('held')).toBeGreaterThan(width('cashOnly'))
  expect(lines.at(-1)!.getAttribute('data-series')).toBe('you')
})

test('from lossFrom on, the main line is drawn in the loss colour, joined at the high', () => {
  const { container } = render(
    <Chart series={[{ id: 'you', values: [0, 10, 20, 15, 12, 30], emphasis: 'main' }]} length={6} shown={4} mood="crash" lossFrom={2} />,
  )
  const lines = [...container.querySelectorAll('polyline')]
  expect(lines.map((l) => [l.getAttribute('data-series'), pointsOf(l).length])).toEqual([
    ['you', 3],
    ['you-loss', 3],
  ])
  expect(lines[0]).toHaveClass('chart-line--main')
  expect(lines[1]).toHaveClass('chart-line--loss')
  expect(pointsOf(lines[1])[0]).toEqual(pointsOf(lines[0])[2])
  expect(lines[1].getAttribute('stroke-width')).toBe(lines[0].getAttribute('stroke-width'))
  expect(container.querySelector('.chart-head')).toHaveClass('chart-head--loss')
})

test('before lossFrom is reached, nothing is drawn in the loss colour', () => {
  const { container } = render(<Chart series={[{ id: 'you', values: [0, 10, 20, 15], emphasis: 'main' }]} length={4} shown={2} mood="crash" lossFrom={2} />)
  expect(container.querySelectorAll('polyline')).toHaveLength(1)
  expect(container.querySelector('.chart-head')).not.toHaveClass('chart-head--loss')
})

test('the very first month draws without NaN', () => {
  const { container } = render(<Chart series={[{ id: 'you', values: [0, 0, 0], emphasis: 'main' }]} length={3} shown={0} mood="crash" />)
  expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
  expect(pointsOf(container.querySelector('polyline')!)).toHaveLength(1)
})
