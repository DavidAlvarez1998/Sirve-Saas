import { cn } from '@/lib/utils'

export type BadgeVariant = 'default' | 'success' | 'warning' | 'destructive' | 'info' | 'muted' | 'outline'

const variantClasses: Record<BadgeVariant, string> = {
  default:     'bg-primary text-primary-foreground',
  success:     'bg-success/15 text-success',
  warning:     'bg-warning/15 text-warning',
  destructive: 'bg-destructive/15 text-destructive',
  info:        'bg-info/15 text-info',
  muted:       'bg-muted text-muted-foreground',
  outline:     'border border-border text-foreground bg-transparent',
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  )
}

export default Badge
