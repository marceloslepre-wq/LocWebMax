import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from './AppSidebar'
import { Bell, Search, UserCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import useMainStore from '@/stores/main'
import { hexToHSL } from '@/lib/utils'

export default function Layout() {
  const navigate = useNavigate()
  const { rentals, settings, currentUser, globalSearch, setGlobalSearch } = useMainStore()

  useEffect(() => {
    if (!currentUser) {
      navigate('/')
    }
  }, [currentUser, navigate])

  useEffect(() => {
    if (settings.primaryColor) {
      const hsl = hexToHSL(settings.primaryColor)
      document.documentElement.style.setProperty('--primary', hsl)
      document.documentElement.style.setProperty('--sidebar-primary', hsl)
      document.documentElement.style.setProperty('--sidebar-ring', hsl)
      document.documentElement.style.setProperty('--ring', hsl)
    }
  }, [settings.primaryColor])

  if (!currentUser) {
    return null
  }

  const today = new Date().toISOString().split('T')[0]
  const overdue = rentals.filter((r) => r.status === 'Atrasado')
  const dueToday = rentals.filter((r) => r.status === 'Ativo' && r.expectedReturnDate === today)
  const notifsCount = overdue.length + dueToday.length

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background overflow-hidden">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 h-screen">
          <header className="h-16 border-b bg-card flex items-center justify-between px-4 sticky top-0 z-10 shadow-sm print:hidden">
            <div className="flex items-center gap-4 flex-1">
              <SidebarTrigger />
              <div className="relative max-w-md hidden sm:block w-full">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Buscar locações, itens ou clientes..."
                  className="pl-9 bg-muted/50 border-none w-full focus-visible:ring-1"
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative text-muted-foreground">
                    <Bell className="w-5 h-5" />
                    {notifsCount > 0 && (
                      <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full" />
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0" align="end">
                  <div className="px-4 py-3 border-b font-medium text-sm">
                    Notificações ({notifsCount})
                  </div>
                  <div className="max-h-[300px] overflow-auto">
                    {notifsCount === 0 ? (
                      <div className="p-4 text-sm text-muted-foreground text-center">
                        Nenhuma notificação no momento.
                      </div>
                    ) : (
                      <div className="flex flex-col">
                        {overdue.map((r) => (
                          <div
                            key={r.id}
                            className="p-3 border-b text-sm flex gap-3 hover:bg-muted/50 cursor-pointer"
                          >
                            <div className="mt-0.5 w-2 h-2 rounded-full bg-destructive flex-shrink-0" />
                            <div>
                              <p className="font-medium text-destructive">Locação Atrasada</p>
                              <p className="text-muted-foreground">
                                A locação {r.id} está com devolução atrasada.
                              </p>
                            </div>
                          </div>
                        ))}
                        {dueToday.map((r) => (
                          <div
                            key={r.id}
                            className="p-3 border-b text-sm flex gap-3 hover:bg-muted/50 cursor-pointer"
                          >
                            <div className="mt-0.5 w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                            <div>
                              <p className="font-medium text-amber-600">Devolução Hoje</p>
                              <p className="text-muted-foreground">
                                A locação {r.id} deve ser devolvida hoje.
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <div className="flex items-center gap-2 border-l pl-4">
                <UserCircle className="w-8 h-8 text-primary" />
                <div className="hidden md:flex flex-col text-sm">
                  <span className="font-semibold leading-none">{currentUser.name}</span>
                  <span className="text-xs text-muted-foreground">{currentUser.role}</span>
                </div>
              </div>
            </div>
          </header>
          <main className="flex-1 p-6 overflow-y-auto animate-fade-in-up pb-20 print:p-0 print:overflow-visible print:h-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}
