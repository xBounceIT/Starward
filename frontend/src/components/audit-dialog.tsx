import { useEffect, useState } from 'react'
import { Clock, History } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { vaultApi, type AuditLog, type Vault } from '@/lib/api'
import { formatRelativeDate, formatShortDate } from '@/lib/vault-utils'

interface AuditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vault: Vault | null
}

export function AuditDialog({ open, onOpenChange, vault }: AuditDialogProps) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !vault) return
    let active = true
    setLoading(true)
    vaultApi
      .getVaultAudit(vault.id)
      .then((data) => {
        if (active) setLogs(data)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, vault])

  if (!vault) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-5 text-primary" />
            Registro attività — {vault.name}
          </DialogTitle>
          <DialogDescription>
            Cronologia delle modifiche e condivisioni su questa cartella.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-3">
          {loading ? (
            <div className="grid grid-cols-1 gap-2.5 py-2 sm:grid-cols-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                  <Skeleton className="h-3 w-3/4" />
                </div>
              ))}
            </div>
          ) : logs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nessuna attività registrata finora.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-xl border border-border/70 bg-card/60 px-3.5 py-2.5 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {log.actor_name}
                      </span>
                      <Badge
                        variant="outline"
                        className="px-1.5 py-0 font-mono text-[10px] text-muted-foreground"
                      >
                        {log.action}
                      </Badge>
                    </div>
                    <span
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                      title={formatShortDate(log.created_at)}
                    >
                      <Clock className="size-3" />
                      {formatRelativeDate(log.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {log.details}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
