import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export type ButtonVariant = 'default' | 'outline' | 'ghost' | 'destructive' | 'secondary' | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const variantClasses: Record<ButtonVariant, string> = {
  default:     'bg-primary text-primary-foreground hover:bg-primary-hover',
  outline:     'border border-border bg-transparent text-foreground hover:bg-surface-raised',
  ghost:       'bg-transparent text-foreground hover:bg-surface-raised',
  destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
  secondary:   'bg-secondary text-secondary-foreground hover:opacity-90',
  link:        'bg-transparent text-primary underline-offset-4 hover:underline p-0 h-auto',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm:   'h-8 px-3 text-xs',
  md:   'h-9 px-4 text-sm',
  lg:   'h-10 px-6 text-sm',
  icon: 'h-9 w-9 p-0',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium rounded-md transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:pointer-events-none',
          'touch-target',
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button }
export default Button
