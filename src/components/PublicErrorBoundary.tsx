import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class PublicErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  }

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Erro na interface pública:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
          <Card className="w-full max-w-md text-center py-8">
            <CardContent className="space-y-4 flex flex-col items-center pt-6">
              <AlertCircle className="w-16 h-16 text-destructive" />
              <h2 className="text-xl font-bold">Oops! Algo deu errado.</h2>
              <p className="text-muted-foreground">
                Ocorreu um erro ao carregar o formulário. Por favor, tente recarregar a página.
              </p>
              <Button onClick={() => window.location.reload()} className="mt-4">
                Recarregar
              </Button>
            </CardContent>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
