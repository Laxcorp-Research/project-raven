import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  componentName?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const componentName = this.props.componentName || 'Unknown'
    console.error(`[ErrorBoundary] ${componentName}:`, error, info)

    try {
      window.raven?.analyticsTrack?.('error_boundary_caught', {
        component: componentName,
        error_message: error.message,
        error_name: error.name,
      })
    } catch {
      // analytics may not be available
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full p-8">
          <div className="text-center max-w-sm">
            <p className="text-gray-500 text-sm mb-2">Something went wrong.</p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
