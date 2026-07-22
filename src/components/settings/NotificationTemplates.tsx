import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { Info, Plus, Edit, Trash2, Bell, Loader2 } from 'lucide-react'
import useMainStore from '@/stores/main'

interface NotificationTemplate {
  trigger: string
  message: string
  enabled: boolean
}

const TRIGGER_OPTIONS = [
  { value: 'novo_contrato', label: 'Novo Contrato' },
  { value: 'lembrete_devolucao', label: 'Lembrete de Devolução' },
  { value: 'contrato_atrasado', label: 'Alerta de Atraso' },
  { value: 'devolucao_concluida', label: 'Devolução Concluída' },
  { value: 'confirmacao_pagamento', label: 'Confirmação de Pagamento' },
]

const VARIABLE_GUIDE = [
  { var: '{cliente}', desc: 'Nome completo do cliente' },
  { var: '{contrato}', desc: 'Número do contrato' },
  { var: '{itens}', desc: 'Lista de itens locados (apenas descrição)' },
  { var: '{data_devolucao}', desc: 'Data prevista de devolução (DD/MM/AAAA)' },
  { var: '{valor}', desc: 'Valor total da locação' },
]

export function NotificationTemplates() {
  const { settings, updateSettings } = useMainStore()
  const { toast } = useToast()

  const templates: NotificationTemplate[] = (settings.notificationTemplates || []).map(
    (t: any) => ({
      trigger: t.trigger,
      message: t.message,
      enabled: t.enabled !== false,
    }),
  )

  const [selectedTrigger, setSelectedTrigger] = useState('')
  const [message, setMessage] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [editingTrigger, setEditingTrigger] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const persistTemplates = async (newTemplates: NotificationTemplate[]): Promise<boolean> => {
    setSaving(true)
    try {
      const success = await updateSettings({ notificationTemplates: newTemplates })
      return success
    } finally {
      setSaving(false)
    }
  }

  const resetForm = () => {
    setSelectedTrigger('')
    setMessage('')
    setEnabled(true)
    setEditingTrigger(null)
  }

  const handleSave = async () => {
    if (!selectedTrigger || !message.trim()) {
      toast({ title: 'Preencha todos os campos', variant: 'destructive' })
      return
    }
    const existing = templates.filter((t) => t.trigger !== selectedTrigger)
    const newTemplates = [
      ...existing,
      { trigger: selectedTrigger, message: message.trim(), enabled },
    ]
    const success = await persistTemplates(newTemplates)
    if (success) {
      toast({ title: 'Template salvo com sucesso!' })
      resetForm()
    } else {
      toast({
        title: 'Erro ao salvar template',
        description: 'Não foi possível salvar no banco de dados. Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  const handleEdit = (tpl: NotificationTemplate) => {
    setEditingTrigger(tpl.trigger)
    setSelectedTrigger(tpl.trigger)
    setMessage(tpl.message)
    setEnabled(tpl.enabled)
  }

  const handleDelete = async (trigger: string) => {
    const newTemplates = templates.filter((t) => t.trigger !== trigger)
    const success = await persistTemplates(newTemplates)
    if (success) {
      toast({ title: 'Template excluído' })
      if (editingTrigger === trigger) resetForm()
    } else {
      toast({
        title: 'Erro ao excluir template',
        description: 'Não foi possível excluir no banco de dados. Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  const handleToggleEnabled = async (trigger: string, newEnabled: boolean) => {
    const newTemplates = templates.map((t) =>
      t.trigger === trigger ? { ...t, enabled: newEnabled } : t,
    )
    const success = await persistTemplates(newTemplates)
    if (success) {
      toast({
        title: newEnabled ? 'Notificação ativada' : 'Notificação desativada',
      })
    } else {
      toast({
        title: 'Erro ao atualizar notificação',
        description: 'Não foi possível salvar no banco de dados. Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  const getTriggerLabel = (value: string) =>
    TRIGGER_OPTIONS.find((t) => t.value === value)?.label || value

  return (
    <div className="space-y-6">
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-900">
            <Info className="w-5 h-5" /> Variáveis Disponíveis
          </CardTitle>
          <CardDescription className="text-blue-700">
            Use estas variáveis nos seus templates. Elas serão substituídas automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {VARIABLE_GUIDE.map((v) => (
              <div
                key={v.var}
                className="flex flex-col gap-1 rounded-lg bg-white p-3 border border-blue-100"
              >
                <code className="text-sm font-semibold text-blue-900">{v.var}</code>
                <span className="text-xs text-muted-foreground">{v.desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5" /> {editingTrigger ? 'Editar Template' : 'Novo Template'}
          </CardTitle>
          <CardDescription>
            Configure mensagens automáticas para cada gatilho do sistema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Gatilho</Label>
            <Select
              value={selectedTrigger}
              onValueChange={setSelectedTrigger}
              disabled={!!editingTrigger}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um gatilho" />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea
              rows={4}
              placeholder="Digite a mensagem usando as variáveis disponíveis..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="enabled-toggle">Ativar notificação</Label>
              <p className="text-xs text-muted-foreground">
                Quando ativado, a mensagem será enviada automaticamente quando o gatilho ocorrer.
              </p>
            </div>
            <Switch id="enabled-toggle" checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" /> {editingTrigger ? 'Atualizar' : 'Adicionar'}
                </>
              )}
            </Button>
            {editingTrigger && (
              <Button variant="outline" onClick={resetForm}>
                Cancelar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {templates.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhum template configurado. Crie seu primeiro template acima.
            </CardContent>
          </Card>
        ) : (
          templates.map((tpl) => (
            <Card key={tpl.trigger} className={tpl.enabled ? '' : 'opacity-60'}>
              <CardContent className="flex items-start justify-between gap-4 py-4">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{getTriggerLabel(tpl.trigger)}</p>
                    <Badge variant={tpl.enabled ? 'default' : 'secondary'}>
                      {tpl.enabled ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2">{tpl.message}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={tpl.enabled}
                    disabled={saving}
                    onCheckedChange={(checked) => handleToggleEnabled(tpl.trigger, checked)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={saving}
                    onClick={() => handleEdit(tpl)}
                  >
                    <Edit className="w-4 h-4 text-primary" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={saving}
                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Template</AlertDialogTitle>
                        <AlertDialogDescription>
                          Tem certeza que deseja excluir este template? Esta ação não pode ser
                          desfeita.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(tpl.trigger)}
                          className="bg-destructive text-white"
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
