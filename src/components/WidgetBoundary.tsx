import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

/**
 * Aísla cada widget: un dato inesperado de una API externa (un número donde se
 * esperaba texto) tiraba el render de toda la pantalla y dejaba el kiosk en
 * negro hasta la recarga diaria. Con esto cae solo el widget afectado.
 */
export class WidgetBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Widget caído:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <section className="widget">
          <p className="widget__error">✕ widget no disponible</p>
        </section>
      )
    }
    return this.props.children
  }
}
