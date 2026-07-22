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

  private handleRetry = () => {
    this.setState({ hasError: false })
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
          <Card className="w-full max-w-md text-center py-8">
            <CardContent className="space-y-4 flex flex-col items-center pt-6">
              <AlertCircle className="w-16 h-16 text-destructive" />
              <h2 className="text-xl font-bold">Ocorreu um erro ao carregar esta página</h2>
              <p className="text-muted-foreground">
                Tente novamente. Se o problema persistir, entre em contato com o suporte.
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
