import type { JSX } from 'react'
import { useLang } from '../lang'

type Emphasis = 'main' | 'strong' | 'faint'

/** Drawing units; the SVG stretches to its box, and strokes keep their pixel width. */
const WIDTH = 1000,
  HEIGHT = 400,
  PAD_X = 8,
  PAD_Y = 16
const STROKE: Record<Emphasis, number> = { main: 3, strong: 2, faint: 1.25 }
/** Fainter lines first, so the main line is drawn on top. */
const LAYER: Record<Emphasis, number> = { faint: 0, strong: 1, main: 2 }
const NICE_STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
const HEADROOM = 1.05

/** A round number at least 5% above `max` (1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6 or 8 times a power of ten); 1 when nothing is above zero. */
function niceMax(max: number): number {
  if (!(max > 0)) return 1
  const target = max * HEADROOM
  const power = 10 ** Math.floor(Math.log10(target))
  return NICE_STEPS.find((step) => step * power >= target)! * power
}

const round1 = (n: number): string => String(Math.round(n * 10) / 10)

/**
 * Line chart of one or more series over a run of `length` points. Only values[0..shown] are drawn
 * and only they set the scale, so the blank future gives nothing away. y runs from zero.
 * With `lossFrom`, the main series is drawn in the loss colour from that point on (the crash).
 * `label` names what the chart shows when it is not the player's money.
 */
export function Chart(props: {
  series: { id: string; values: number[]; emphasis: Emphasis }[]
  length: number
  shown: number
  mood: 'calm' | 'crash'
  lossFrom?: number
  label?: string
}): JSX.Element {
  const { series, length, shown, mood, lossFrom, label } = props
  const { t } = useLang()
  const last = Math.max(0, Math.min(shown, length - 1))
  const visible = [...series]
    .sort((a, b) => LAYER[a.emphasis] - LAYER[b.emphasis])
    .map((s) => ({ ...s, values: s.values.slice(0, last + 1) }))
  const top = niceMax(Math.max(0, ...visible.flatMap((s) => s.values)))

  const x = (i: number): number => PAD_X + (length > 1 ? i / (length - 1) : 0) * (WIDTH - 2 * PAD_X)
  const y = (v: number): number => HEIGHT - PAD_Y - (v / top) * (HEIGHT - 2 * PAD_Y)
  const main = visible.find((s) => s.emphasis === 'main')
  const head = main && main.values.length > 0 ? { x: x(main.values.length - 1), y: y(main.values[main.values.length - 1]) } : null
  const losing = lossFrom !== undefined && last > lossFrom

  /** One polyline through values that start at point `from`. */
  const line = (id: string, values: number[], from: number, className: string, width: number): JSX.Element => (
    <polyline
      key={id}
      className={`chart-line ${className}`}
      data-series={id}
      points={values.map((v, i) => `${round1(x(from + i))},${round1(y(v))}`).join(' ')}
      fill="none"
      strokeWidth={width}
      strokeLinejoin="round"
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
  )

  return (
    <svg className="chart" data-mood={mood} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={label ?? t('chart.label')}>
      {last < length - 1 && <rect className="chart-future" x={x(last)} y={0} width={WIDTH - x(last)} height={HEIGHT} />}
      <line className="chart-baseline" x1={0} x2={WIDTH} y1={y(0)} y2={y(0)} vectorEffect="non-scaling-stroke" />
      {visible.flatMap((s) =>
        s === main && losing
          ? [
              line(s.id, s.values.slice(0, lossFrom + 1), 0, `chart-line--${s.emphasis}`, STROKE[s.emphasis]),
              line(`${s.id}-loss`, s.values.slice(lossFrom), lossFrom, 'chart-line--loss', STROKE[s.emphasis]),
            ]
          : [line(s.id, s.values, 0, `chart-line--${s.emphasis}`, STROKE[s.emphasis])],
      )}
      {head && (
        // A zero-length stroke with round caps: a dot that stays round when the SVG is stretched.
        <path
          className={losing ? 'chart-head chart-head--loss' : 'chart-head'}
          d={`M${round1(head.x)} ${round1(head.y)}h0`}
          strokeWidth={9}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  )
}
