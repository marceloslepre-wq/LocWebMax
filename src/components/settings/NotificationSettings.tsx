import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Info, MessageSquare, Save } from 'lucide-react'
import useMainStore from '@/stores/main'
import { useToast } from '@/hooks/use-toast'

interface TriggerConfig {
  key: string
  label: string
  description: string
  variables: Array<{ key: string; desc: string }>
}

const NOTIFICATION_TRIGGERS: TriggerConfig[] = [
  {
    key: 'novo_contrato',
    label: 'Novo Contrato',
    description: 'Enviado quando uma nova locação é criada.',
    variables: [
      { key: '{cliente}', desc: 'Nome do cliente' },
      { key: '{contrato}', desc: 'Número do contrato' },
      { key: '{itens}', desc: 'Lista de itens alugados' },
      { key: '{valor}', desc: 'Valor total da locação' },
      { key: '{data_devolucao}', desc: 'Data prevista (DD/MM/AAAA)' },
    ],
  },
  {
    key: 'lembrete_devolucao',
    label: 'Lembrete de Devolução',
    description: 'Enviado 1 a 2 dias antes da data prevista de devolução.',
    variables: [
      { key: '{cliente}', desc: 'Nome do cliente' },
      { key: '{contrato}', desc: 'Número do contrato' },
      { key: '{data_devolucao}', desc: 'Data prevista (DD/MM/AAAA)' },
      { key: '{itens}', desc: 'Lista de itens alugados' },
    ],
  },
  {
    key: 'notificacao_atraso',
    label: 'Notificação de Atraso',
    description: 'Enviado quando um contrato fica em atraso.',
    variables: [
      { key: '{cliente}', desc: 'Nome do cliente' },
      { key: '{contrato}', desc: 'Número do contrato' },
      { key: '{data_devolucao}', desc: 'Data prevista (DD/MM/AAAA)' },
      { key: '{itens}', desc: 'Lista de itens alugados' },
    ],
  },
  {
    key: 'confirmacao_devolucao',
    label: 'Confirmação de Devolução',
    description: 'Enviado quando os itens são devolvidos com sucesso.',
    variables: [
      { key: '{cliente}', desc: 'Nome do cliente' },
      { key: '{contrato}', desc: 'Número do contrato' },
      { key: '{itens}', desc: 'Lista de itens devolvidos' },
    ],
  },
  {
    key: 'confirmacao_pagamento',
    label: 'Confirmação de Pagamento',
    description: 'Enviado quando um pagamento é registrado.',
    variables: [
      { key: '{cliente}', desc: 'Nome do cliente' },
      { key: '{contrato}', desc: 'Número do contrato' },
      { key: '{valor}', desc: 'Valor do pagamento' },
    ],
  },
]

const ALL_VARIABLES = [
  { key: '{cliente}', desc: 'Nome do cliente' },
  { key: '{contrato}', desc: 'Número do contrato' },
  { key: '{itens}', desc: 'Lista de itens' },
  { key: '{valor}', desc: 'Valor (locação ou pagamento)' },
  { key: '{data_devolucao}', desc: 'Data de devolução (DD/MM/AAAA)' },
]

export function NotificationSettings() {
  const { settings, updateSettings } = useMainStore()
  const { toast } = useToast()
  const [localTemplates, setLocalTemplates] = useState<Record<string, string>>({})

  const templates = settings.notificationTemplates || {}

  useEffect(() => {
    const map: Record<string, string> = {}
    NOTIFICATION_TRIGGERS.forEach((t) => {
      map[t.key] = templates[t.key]?.template || ''
    })
    setLocalTemplates(map)
  }, [settings.notificationTemplates])

  const updateTemplate = (key: string, field: 'enabled' | 'template', value: boolean | string) => {
    updateSettings({
      notificationTemplates: {
        ...templates,
        [key]: {
          enabled: templates[key]?.enabled ?? false,
          template: templates[key]?.template ?? '',
          [field]: value,
        },
      },
    })
  }

  const handleSaveAll = () => {
    const merged = { ...templates }
    NOTIFICATION_TRIGGERS.forEach((t) => {
      merged[t.key] = {
        enabled: templates[t.key]?.enabled ?? false,
        template: localTemplates[t.key] || '',
      }
    })
    updateSettings({ notificationTemplates: merged })
    toast({
      title: 'Modelos salvos!',
      description: 'As configurações de notificação foram atualizadas.',
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Modelos de Notificações WhatsApp
        </CardTitle>
        <CardDescription>
          Configure mensagens automáticas enviadas via WhatsApp para clientes em eventos específicos
          do sistema.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border bg-muted/50 p-4">
          <h4 className="font-semibold mb-2 flex items-center gap-2">
            <Info className="w-4 h-4" /> Guia de Variáveis Dinâmicas
          </h4>
          <p className="text-sm text-muted-foreground mb-3">
            Use os placeholders abaixo nos seus modelos. Eles serão substituídos automaticamente por
            dados reais antes do envio.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {ALL_VARIABLES.map((v) => (
              <div key={v.key} className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {v.key}
                </Badge>
                <span className="text-sm text-muted-foreground">{v.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {NOTIFICATION_TRIGGERS.map((trigger) => {
          const tpl = templates[trigger.key] || { enabled: false, template: '' }
          return (
            <div key={trigger.key} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">{trigger.label}</h4>
                  <p className="text-sm text-muted-foreground">{trigger.description}</p>
                </div>
                <Switch
                  checked={tpl.enabled}
                  onCheckedChange={(checked) => updateTemplate(trigger.key, 'enabled', checked)}
                />
              </div>
              <Textarea
                placeholder="Digite o modelo da mensagem..."
                value={localTemplates[trigger.key] || ''}
                onChange={(e) =>
                  setLocalTemplates((prev) => ({
                    ...prev,
                    [trigger.key]: e.target.value,
                  }))
                }
                onBlur={() =>
                  updateTemplate(trigger.key, 'template', localTemplates[trigger.key] || '')
                }
                rows={3}
                className="resize-none"
              />
              <div className="flex flex-wrap gap-2">
                {trigger.variables.map((v) => (
                  <Badge key={v.key} variant="secondary" className="font-mono text-xs">
                    {v.key}
                  </Badge>
                ))}
              </div>
            </div>
          )
        })}

        <Button onClick={handleSaveAll} className="w-full">
          <Save className="w-4 h-4 mr-2" /> Salvar Todos os Modelos
        </Button>
      </CardContent>
    </Card>
  )
}
