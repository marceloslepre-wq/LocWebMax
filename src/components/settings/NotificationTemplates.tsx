import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Info, Plus, Edit, Trash2, Bell } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import useMainStore from '@/stores/main'

interface NotificationTemplate {
  trigger: string
  message: string
}

const TRIGGER_OPTIONS = [
  { value: 'novo_contrato', label: 'Novo Contrato' },
  { value: 'lembrete_devolucao', label: 'Lembrete de Devolução' },
  { value: 'contrato_atrasado', label: 'Contrato Atrasado' },
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

  const templates: NotificationTemplate[] =
    settings.notificationTemplates || settings.notification_templates || []

  const [selectedTrigger, setSelectedTrigger] = useState('')
  const [message, setMessage] = useState('')
  const [editingTrigger, setEditingTrigger] = useState<string | null>(null)

  const persistTemplates = async (newTemplates: NotificationTemplate[]) => {
    updateSettings({ notificationTemplates: newTemplates })
    try {
      const records = await pb.collection('settings').getFullList()
      if (records.length > 0) {
        await pb.collection('settings').update(records[0].id, {
          notification_templates: newTemplates,
        })
      }
    } catch (err) {
      console.error('Failed to persist notification templates:', err)
    }
  }

  const resetForm = () => {
    setSelectedTrigger('')
    setMessage('')
    setEditingTrigger(null)
  }

  const handleSave = async () => {
    if (!selectedTrigger || !message.trim()) {
      toast({ title: 'Preencha todos os campos', variant: 'destructive' })
      return
    }
    const existing = templates.filter((t) => t.trigger !== selectedTrigger)
    const newTemplates = [...existing, { trigger: selectedTrigger, message: message.trim() }]
    await persistTemplates(newTemplates)
    toast({ title: 'Template salvo com sucesso!' })
    resetForm()
  }

  const handleEdit = (tpl: NotificationTemplate) => {
    setEditingTrigger(tpl.trigger)
    setSelectedTrigger(tpl.trigger)
    setMessage(tpl.message)
  }

  const handleDelete = async (trigger: string) => {
    const newTemplates = templates.filter((t) => t.trigger !== trigger)
    await persistTemplates(newTemplates)
    toast({ title: 'Template excluído' })
    if (editingTrigger === trigger) resetForm()
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
            <Select value={selectedTrigger} onValueChange={setSelectedTrigger}>
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
          <div className="flex gap-2">
            <Button onClick={handleSave}>
              <Plus className="w-4 h-4 mr-2" /> {editingTrigger ? 'Atualizar' : 'Adicionar'}
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
            <Card key={tpl.trigger}>
              <CardContent className="flex items-start justify-between gap-4 py-4">
                <div className="flex-1 space-y-1">
                  <p className="font-semibold text-sm">{getTriggerLabel(tpl.trigger)}</p>
                  <p className="text-sm text-muted-foreground line-clamp-2">{tpl.message}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleEdit(tpl)}
                  >
                    <Edit className="w-4 h-4 text-primary" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
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
