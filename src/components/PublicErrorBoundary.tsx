import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message: string
}

/**
 * Mensagem curta e amigável para diagnóstico, sem dados sensíveis:
 * pega só a primeira linha do erro e limita o tamanho.
 */
export function summarizeError(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Erro desconhecido'
  const firstLine = String(raw).split('\n')[0].trim()
  return firstLine.length > 140 ? `${firstLine.slice(0, 140)}…` : firstLine || 'Erro desconhecido'
}

export class PublicErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    message: '',
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: summarizeError(error) }
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
              <h2 className="text-xl font-bold">
                <span>Ops! Algo deu errado.</span>
              </h2>
              <p className="text-muted-foreground">
                <span>
                  Ocorreu um erro ao carregar o formulário. Por favor, tente recarregar a página.
                </span>
              </p>
              {this.state.message && (
                <p className="text-xs text-muted-foreground/80 break-words max-w-full px-2 font-mono">
                  <span>{this.state.message}</span>
                </p>
              )}
              <Button onClick={() => window.location.reload()} className="mt-4">
                <span>Recarregar</span>
              </Button>
            </CardContent>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
