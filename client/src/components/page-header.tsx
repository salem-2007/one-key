import type { ReactNode } from 'react'
import { useI18n } from '@/lib/i18n'

export function PageHeader({
  titleKey,
  descKey,
  title,
  description,
  actions,
}: {
  titleKey?: string
  descKey?: string
  title?: string
  description?: string
  actions?: ReactNode
}) {
  const { t } = useI18n()
  const displayTitle = titleKey ? t(titleKey) : title
  const displayDesc = descKey ? t(descKey) : description

  return (
    <div className="flex items-end justify-between gap-6 pb-6 mb-6 border-b">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{displayTitle}</h1>
        {displayDesc && (
          <p className="text-sm text-muted-foreground mt-1">{displayDesc}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
