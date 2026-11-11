import { type CSSProperties, type JSX, useId } from 'react'

/**
 * A labelled slider: a native range input underneath, so it works with touch, mouse and keyboard.
 * The value is shown as `format` writes it, which is also what a screen reader hears. `marks` shades
 * a zone of the track, in the same units as the value, without any words.
 */
export function Dial(p: {
  label: string
  value: number
  min: number
  max: number
  step: number
  marks?: readonly [number, number]
  format(v: number): string
  onChange(v: number): void
  disabled?: boolean
}): JSX.Element {
  const id = useId()
  /** Where a value sits along the track, from 0 to 1. */
  const along = (v: number): number => (p.max > p.min ? (v - p.min) / (p.max - p.min) : 0)
  const position = {
    '--at': along(p.value),
    ...(p.marks && { '--lo': along(p.marks[0]), '--hi': along(p.marks[1]) }),
  } as CSSProperties
  const text = p.format(p.value)
  return (
    <div className="dial">
      <div className="dial-head">
        <label htmlFor={id}>{p.label}</label>
        <span className="dial-value">{text}</span>
      </div>
      <div className="dial-track" style={position}>
        {p.marks && <span className="dial-zone" aria-hidden="true" />}
        <input
          id={id}
          className="dial-input"
          type="range"
          min={p.min}
          max={p.max}
          step={p.step}
          value={p.value}
          aria-valuetext={text}
          disabled={p.disabled}
          onChange={(e) => p.onChange(Number(e.currentTarget.value))}
        />
      </div>
    </div>
  )
}
