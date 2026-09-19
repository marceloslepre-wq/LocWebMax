import { Component, ErrorInfo, ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'
import { Outlet } from 'react-router-dom'

interface Props {
  children?: ReactNode
}

interface State {
  hasError: boolean
}

export class RouteErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false }

  public static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('RouteErrorBoundary caught:', error, errorInfo)
  }

  private isRateLimitError(): boolean {
    const error = (this.state as any).error
    return (
      error?.status === 429 ||
      error?.message?.includes('429') ||
      error?.message?.includes('Too Many Requests')
    )
  }

  private handleRetry = () => {
    this.setState({ hasError: false })
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
          <Card className="w-full max-w-md text-center py-8">
            <CardContent className="space-y-4 flex flex-col items-center pt-6">
              <AlertCircle className="w-16 h-16 text-amber-500" />
              <h2 className="text-xl font-bold">Muitas requisições simultâneas</h2>
              <p className="text-muted-foreground text-sm">
                O sistema recebeu um volume temporariamente alto de requisições (especialmente se
                houver múltiplas abas abertas). Aguarde alguns segundos e clique no botão abaixo.
              </p>
              <Button onClick={this.handleRetry} className="mt-4">
                Tentar Novamente
              </Button>
            </CardContent>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}

export function ErrorBoundaryOutlet() {
  return (
    <RouteErrorBoundary>
      <Outlet />
    </RouteErrorBoundary>
  )
}
