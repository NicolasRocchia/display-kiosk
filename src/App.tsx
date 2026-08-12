import { useEffect, useState } from 'react'
import { registry } from './widgets/registry'

// Anti burn-in AMOLED: todo el contenido se desplaza unos px siguiendo un ciclo lento.
const SHIFT_CYCLE: Array<[number, number]> = [
  [0, 0],
  [2, 1],
  [0, 2],
  [-2, 1],
  [-2, -1],
  [0, -2],
  [2, -1],
]
const SHIFT_MS = 5 * 60 * 1000

function App() {
  const [shiftIndex, setShiftIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setShiftIndex((i) => (i + 1) % SHIFT_CYCLE.length)
    }, SHIFT_MS)
    return () => clearInterval(id)
  }, [])

  const [x, y] = SHIFT_CYCLE[shiftIndex]

  return (
    <main className="dashboard" style={{ translate: `${x}px ${y}px` }}>
      {registry.map(({ id, area, Component }) => (
        <div key={id} className={`cell cell--${area}`} style={{ gridArea: area }}>
          <Component />
        </div>
      ))}
    </main>
  )
}

export default App
