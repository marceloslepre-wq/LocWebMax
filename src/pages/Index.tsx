import { useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Package, WifiOff, AlertCircle, RefreshCw } from 'lucide-react'
import { isNetworkError as checkIsNetworkError, getErrorMessage } from '@/lib/pocketbase/errors'

export default function Index() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirmPassword, setRegConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('login')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isNetworkFailure, setIsNetworkFailure] = useState(false)

  const { signIn, signUp, user, loading } = useAuth()
  const { toast } = useToast()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (user) return <Navigate to="/dashboard" replace />

  const performLogin = async (loginEmail: string, loginPass: string) => {
    setIsSubmitting(true)
    setErrorMessage(null)
    setIsNetworkFailure(false)

    const { error } = await signIn(loginEmail, loginPass)

    if (error) {
      setIsSubmitting(false)
      const networkErr = checkIsNetworkError(error)
      const desc = networkErr
        ? 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
        : getErrorMessage(error) || 'Email ou senha inválidos. Tente novamente.'

      setErrorMessage(desc)
      setIsNetworkFailure(networkErr)

      toast({
        title: networkErr ? 'Falha de Conexão' : 'Erro de Autenticação',
        description: desc,
        variant: 'destructive',
      })
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    await performLogin(email, password)
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regEmail || !regPassword || !regConfirmPassword) return

    if (regPassword !== regConfirmPassword) {
      setErrorMessage('As senhas não coincidem.')
      setIsNetworkFailure(false)
      return toast({
        title: 'Erro de Cadastro',
        description: 'As senhas não coincidem.',
        variant: 'destructive',
      })
    }

    if (regPassword.length < 8) {
      setErrorMessage('A senha deve ter no mínimo 8 caracteres.')
      setIsNetworkFailure(false)
      return toast({
        title: 'Erro de Cadastro',
        description: 'A senha deve ter no mínimo 8 caracteres.',
        variant: 'destructive',
      })
    }

    setIsSubmitting(true)
    setErrorMessage(null)
    setIsNetworkFailure(false)
    const { error } = await signUp(regEmail, regPassword)
    setIsSubmitting(false)

    if (error) {
      const networkErr = checkIsNetworkError(error)
      const desc = networkErr
        ? 'Não foi possível conectar ao servidor para efetuar o cadastro. Verifique sua conexão e tente novamente.'
        : getErrorMessage(error) || error.message || 'Não foi possível realizar o cadastro.'
      setErrorMessage(desc)
      setIsNetworkFailure(networkErr)
      toast({
        title: networkErr ? 'Falha de Conexão' : 'Erro de Cadastro',
        description: desc,
        variant: 'destructive',
      })
    } else {
      toast({
        title: 'Cadastro realizado',
        description: 'Sua conta foi criada com sucesso! Faça login para continuar.',
      })
      setEmail(regEmail)
      setPassword(regPassword)
      setActiveTab('login')
      setRegEmail('')
      setRegPassword('')
      setRegConfirmPassword('')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md shadow-lg border-primary/10">
        <CardHeader className="space-y-2 text-center pb-4">
          <div className="flex justify-center mb-2">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <Package className="w-8 h-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Gestão de Locação</CardTitle>
          <CardDescription>Acesse o painel administrativo ou crie sua conta</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Cadastrar</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2 text-left">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (errorMessage) setErrorMessage(null)
                    }}
                    required
                  />
                </div>
                <div className="space-y-2 text-left">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (errorMessage) setErrorMessage(null)
                    }}
                    required
                  />
                </div>

                {errorMessage ? (
                  <div
                    role="alert"
                    className={`p-3 rounded-md text-sm border flex flex-col gap-2 ${
                      isNetworkFailure
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200'
                        : 'bg-destructive/10 border-destructive/20 text-destructive'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {isNetworkFailure ? (
                        <WifiOff className="w-4 h-4 mt-0.5 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      )}
                      <span className="flex-1">{errorMessage}</span>
                    </div>
                    {isNetworkFailure ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => performLogin(email, password)}
                        disabled={isSubmitting || !email || !password}
                        className="self-start h-8 text-xs gap-1.5 mt-1 border-amber-500/40 hover:bg-amber-500/20"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-spin' : ''}`}
                        />
                        Tentar novamente
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                <div className="pt-2 flex flex-col gap-3">
                  <Button type="submit" className="w-full text-base h-11" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
                    Entrar no Sistema
                  </Button>
                  <div className="text-center mt-1">
                    <Link
                      to="/public/forgot-password"
                      className="text-sm text-primary hover:underline font-medium"
                    >
                      Esqueceu a senha?
                    </Link>
                  </div>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2 text-left">
                  <Label htmlFor="regEmail">Email</Label>
                  <Input
                    id="regEmail"
                    type="email"
                    placeholder="seu@email.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2 text-left">
                  <Label htmlFor="regPassword">Senha</Label>
                  <Input
                    id="regPassword"
                    type="password"
                    placeholder="Mínimo 8 caracteres"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
                <div className="space-y-2 text-left">
                  <Label htmlFor="regConfirmPassword">Confirme a Senha</Label>
                  <Input
                    id="regConfirmPassword"
                    type="password"
                    placeholder="Confirme sua senha"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full text-base h-11 mt-2"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
                  Criar Conta
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
