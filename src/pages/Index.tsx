import { useState } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Package } from 'lucide-react'

export default function Index() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirmPassword, setRegConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('login')

  const { signIn, signUp, user, loading } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (user) return <Navigate to="/dashboard" replace />

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return

    setIsSubmitting(true)
    const { error } = await signIn(email, password)

    if (error) {
      setIsSubmitting(false)
      toast({
        title: 'Erro de Autenticação',
        description: 'Email ou senha inválidos. Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regEmail || !regPassword || !regConfirmPassword) return

    if (regPassword !== regConfirmPassword) {
      return toast({
        title: 'Erro de Cadastro',
        description: 'As senhas não coincidem.',
        variant: 'destructive',
      })
    }

    if (regPassword.length < 8) {
      return toast({
        title: 'Erro de Cadastro',
        description: 'A senha deve ter no mínimo 8 caracteres.',
        variant: 'destructive',
      })
    }

    setIsSubmitting(true)
    const { error } = await signUp(regEmail, regPassword)
    setIsSubmitting(false)

    if (error) {
      toast({
        title: 'Erro de Cadastro',
        description: error.message || 'Não foi possível realizar o cadastro.',
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
                    onChange={(e) => setEmail(e.target.value)}
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
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
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
