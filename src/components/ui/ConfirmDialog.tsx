'use client'

import Modal from './Modal'
import { Button } from '@/components/ui/Button'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}

export default function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  danger = true,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm">
      <p className="text-muted-foreground text-sm mb-6">{message}</p>
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={onCancel}
          className="flex-1 rounded-2xl h-11"
        >
          Cancelar
        </Button>
        <Button
          variant={danger ? 'destructive' : 'default'}
          onClick={onConfirm}
          className="flex-1 rounded-2xl h-11"
        >
          Confirmar
        </Button>
      </div>
    </Modal>
  )
}
