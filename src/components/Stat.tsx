interface Props {
  value: string
  unit?: string
  label: string
}

// Stat tile mínimo: valor en tinta (nunca en color de dato), etiqueta muted debajo.
export function Stat({ value, unit, label }: Props) {
  return (
    <div className="stat">
      <div className="stat__value">
        {value}
        {unit && <span className="stat__unit"> {unit}</span>}
      </div>
      <div className="stat__label">{label}</div>
    </div>
  )
}
