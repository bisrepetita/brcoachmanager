import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils/cn'

const badgeVariants = cva(
  'inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium transition-colors',
  {
    variants: {
      variant: {
        default:
          'bg-accent-subtle text-text-primary rounded-badge',
        planned:
          'bg-border text-text-secondary rounded-badge',
        done:
          'bg-success-bg text-success rounded-badge',
        cancelled:
          'bg-payment-cancelled-bg text-payment-cancelled-text rounded-badge',
        payment_to_request:
          'bg-payment-request-bg text-payment-request-text rounded-badge',
        link_sent:
          'bg-payment-sent-bg text-payment-sent-text rounded-badge',
        paid:
          'bg-payment-paid-bg text-payment-paid-text rounded-badge',
        offered:
          'bg-payment-offered-bg text-payment-offered-text rounded-badge',
        credits:
          'bg-[#E8F3EE] text-[#2D7A4F] rounded-badge',
        gold:
          'bg-gold-bg text-gold-text rounded-badge',
        muted:
          'bg-border text-text-tertiary rounded-badge',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
