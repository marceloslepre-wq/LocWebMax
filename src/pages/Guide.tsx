import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Package,
  Users,
  FileText,
  Smartphone,
  ArrowRight,
  Share2,
  Search,
  RefreshCw,
} from 'lucide-react'
import { Link } from 'react-router-dom'

export default function Guide() {
  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      <div className="text-center py-6">
        <h1 className="text-4xl font-bold tracking-tight">Guia de Uso do Sistema</h1>
        <p className="text-lg text-muted-foreground mt-2 max-w-2xl mx-auto">
          Manual completo das funcionalidades, incluindo todas as atualizações mais recentes.
        </p>
      </div>

      <div className="grid gap-6">
        <Card className="border-l-4 border-l-primary shadow-sm hover:shadow transition-shadow">
          <CardHeader className="flex flex-row items-center gap-4 pb-2">
            <div className="bg-primary/10 p-3 rounded-full shrink-0">
              <Package className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-xl">1. Gestão de Estoque e Patrimônio</CardTitle>
              <CardDescription>Cadastre modelos e gerencie cada unidade física</CardDescription>
            </div>
            <Link
              to="/inventory"
              className="hidden sm:flex items-center text-sm font-medium text-primary hover:underline"
            >
              Ir para Estoque <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </CardHeader>
          <CardContent className="ml-[68px] sm:ml-[72px]">
            <p className="text-muted-foreground mb-3">
              Mantenha o controle preciso de tudo o que você pode alugar.
            </p>
            <ul className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
              <li>
                <strong>Estoque:</strong> Cadastre o modelo geral (ex: Cama Hospitalar) definindo o
                valor e a categoria.
              </li>
              <li>
                <strong>Patrimônio (Novo):</strong> Acesse a aba Patrimônio para adicionar um
                identificador único, foto individual, data de aquisição e estado atual (Disponível,
                Manutenção, Vendido, etc.) para cada unidade que você possui desse modelo.
              </li>
              <li>
                <strong>Busca Rápida (Novo):</strong> Utilize a barra de busca no Patrimônio para
                localizar facilmente uma unidade específica pela sua placa ou código.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500 shadow-sm hover:shadow transition-shadow">
          <CardHeader className="flex flex-row items-center gap-4 pb-2">
            <div className="bg-blue-500/10 p-3 rounded-full shrink-0">
              <Share2 className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-xl">2. Compartilhamento de Links Públicos</CardTitle>
              <CardDescription>Delegue cadastros de forma segura</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="ml-[68px] sm:ml-[72px]">
            <p className="text-muted-foreground mb-3">
              Você pode solicitar que clientes ou funcionários externos façam inserções no sistema
              sem precisar dar acesso completo a eles.
            </p>
            <ul className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
              <li>
                <strong>Cadastro de Clientes:</strong> Envie o link público de cadastro para que o
                próprio cliente preencha seus dados de contato e endereço. Eles aparecerão
                automaticamente na aba "Clientes".
              </li>
              <li>
                <strong>Inclusão de Patrimônios (Novo):</strong> Na aba Patrimônio, clique em
                "Gerenciar" e use os botões de WhatsApp ou E-mail para enviar um link específico.
                Qualquer pessoa com o link poderá adicionar um novo patrimônio àquele modelo
                enviando foto e número de série, ideal para equipes que estão no campo ou recebendo
                novas remessas.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500 shadow-sm hover:shadow transition-shadow">
          <CardHeader className="flex flex-row items-center gap-4 pb-2">
            <div className="bg-amber-500/10 p-3 rounded-full shrink-0">
              <FileText className="w-6 h-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-xl">3. Contratos e Recibos Automatizados</CardTitle>
              <CardDescription>Documentação padronizada e com segurança jurídica</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="ml-[68px] sm:ml-[72px]">
            <p className="text-muted-foreground mb-3">
              O sistema agora gera toda a sua documentação com os dados oficiais da sua empresa.
            </p>
            <ul className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
              <li>
                <strong>Contrato Inteligente:</strong> Ao criar uma locação, o sistema puxa o
                endereço completo, CEP, CPF e contato do cliente, além do local de retirada,
                injetando tudo na sua minuta padrão.
              </li>
              <li>
                <strong>Identidade Visual:</strong> A logo da sua empresa aparece em todos os
                recibos e contratos gerados pelo sistema de forma automática.
              </li>
              <li>
                <strong>Lei 8846/94:</strong> Os recibos já possuem a nota de conformidade de
                dispensa de Nota Fiscal para locação de bens móveis, garantindo transparência
                fiscal.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500 shadow-sm hover:shadow transition-shadow">
          <CardHeader className="flex flex-row items-center gap-4 pb-2">
            <div className="bg-emerald-500/10 p-3 rounded-full shrink-0">
              <RefreshCw className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-xl">4. Atalhos e Renovações</CardTitle>
              <CardDescription>Agilize as rotinas do balcão</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="ml-[68px] sm:ml-[72px]">
            <p className="text-muted-foreground mb-3">
              Recursos para economizar cliques no momento do atendimento.
            </p>
            <ul className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
              <li>
                Ao gerar uma "Nova Locação", utilize os atalhos de <strong>+15 dias</strong> e{' '}
                <strong>+30 dias</strong> para preencher as datas de devolução num piscar de olhos.
              </li>
              <li>
                Use o botão de <strong>Renovar</strong> dentro de uma locação existente. O sistema
                calculará o valor adicional do novo período e permitirá a emissão imediata de um
                recibo específico para a renovação.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500 shadow-sm hover:shadow transition-shadow">
          <CardHeader className="flex flex-row items-center gap-4 pb-2">
            <div className="bg-purple-500/10 p-3 rounded-full shrink-0">
              <Smartphone className="w-6 h-6 text-purple-600" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-xl">5. Instalação Mobile</CardTitle>
              <CardDescription>Tenha o sistema sempre à mão</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="ml-[68px] sm:ml-[72px]">
            <p className="text-muted-foreground mb-3">
              Para usar como um App sem baixar nada nas lojas:
            </p>
            <ul className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
              <li>No celular, acesse a URL do sistema pelo Safari (iOS) ou Chrome (Android).</li>
              <li>
                Toque em Compartilhar (iOS) ou nos Três Pontinhos (Android) e escolha{' '}
                <strong>"Adicionar à Tela de Início"</strong>.
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
