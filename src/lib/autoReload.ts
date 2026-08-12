// Higiene de kiosk 24/7: recarga diaria (purga memory leaks) y auto-update tras cada deploy.

const DAILY_RELOAD_HOUR = 4
const DAILY_RELOAD_MINUTE = 30
const VERSION_POLL_MS = 10 * 60 * 1000

export function initAutoReload(): void {
  scheduleDailyReload()
  setInterval(() => void checkVersion(), VERSION_POLL_MS)
}

function scheduleDailyReload(): void {
  const now = new Date()
  const next = new Date(now)
  next.setHours(DAILY_RELOAD_HOUR, DAILY_RELOAD_MINUTE, 0, 0)
  if (next <= now) {
    next.setDate(next.getDate() + 1)
  }
  setTimeout(() => location.reload(), next.getTime() - now.getTime())
}

// version.json solo existe en el build de producción; en dev el 404 sale por res.ok.
async function checkVersion(): Promise<void> {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' })
    if (!res.ok) return
    const { buildId } = (await res.json()) as { buildId?: string }
    if (buildId && buildId !== __BUILD_ID__) {
      location.reload()
    }
  } catch {
    // sin red: el próximo poll reintenta
  }
}
