import { AlertTriangle, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import useMainStore from '@/stores/main'
import { useToast } from '@/hooks/use-toast'

export function SupportAccessBanner() {
  const { supportSession, exitSupportAccess } = useMainStore()
  const navigate = useNavigate()
  const { toast } = useToast()

  if (!supportSession) return null

  const handleExit = () => {
    const tenantName = supportSession.tenant.name
    exitSupportAccess()
    toast({
      title: 'Acesso de suporte encerrado',
      description: `Você saiu do painel da empresa ${tenantName} e voltou ao Painel Master.`,
    })
    navigate('/master')
  }

  return (
    <div
      role="banner"
      aria-label="Aviso de acesso de suporte"
      className="bg-amber-500 text-slate-950 font-medium px-4 py-2 sm:py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm shadow-md shrink-0 z-50 sticky top-0 print:hidden"
    >
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="w-4 h-4 text-slate-950 shrink-0 stroke-[2.5]" />
        <span className="truncate">
          Você está acessando como suporte:{' '}
          <strong className="font-bold underline decoration-slate-950/40 underline-offset-2">
            {supportSession.tenant.name}
          </strong>{' '}
          <span className="hidden md:inline text-slate-900/80 font-normal">
            ({supportSession.targetUser.name} &bull; {supportSession.targetUser.role || 'Gestor'})
          </span>
        </span>
      </div>

      <button
        type="button"
        onClick={handleExit}
        className="shrink-0 bg-slate-950 hover:bg-slate-900 text-white font-semibold text-xs px-3.5 py-1.5 rounded-md shadow-sm transition-all hover:scale-[1.02] flex items-center gap-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-1 focus:ring-offset-amber-500"
      >
        <span>Sair do acesso</span>
        <LogOut className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
