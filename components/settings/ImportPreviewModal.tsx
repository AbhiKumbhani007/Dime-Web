'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { commitImport, type PreviewResult } from '@/lib/api/csv'
import { TRANSACTIONS_KEY } from '@/hooks/useTransactions'
import { toastSuccess, toastError } from '@/lib/toast'
import { formatINR } from '@/lib/utils/currency'

interface ImportPreviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  file: File | null
  preview: PreviewResult | null
  /** Called after a successful commit — the parent should clear the staged file/preview. */
  onImported: () => void
  /** Called when the backend reports the file changed since preview (409) — the parent should clear the staged file/preview so the user re-picks. */
  onFileMismatch: () => void
}

/**
 * Shows the dry-run summary from `previewImport` and confirms the commit.
 * Uses `Dialog` (not `AlertDialog`) because there's real content here —
 * counts, an error table, a duplicates list — beyond a yes/no prompt.
 */
export function ImportPreviewModal({
  open,
  onOpenChange,
  file,
  preview,
  onImported,
  onFileMismatch,
}: ImportPreviewModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {preview && (
          // Keyed by previewToken so a newly previewed file remounts this body
          // with fresh state (e.g. `mismatch`) instead of needing an effect to
          // reset it.
          <ImportPreviewBody
            key={preview.previewToken}
            file={file}
            preview={preview}
            onOpenChange={onOpenChange}
            onImported={onImported}
            onFileMismatch={onFileMismatch}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

interface ImportPreviewBodyProps {
  file: File | null
  preview: PreviewResult
  onOpenChange: (open: boolean) => void
  onImported: () => void
  onFileMismatch: () => void
}

function ImportPreviewBody({
  file,
  preview,
  onOpenChange,
  onImported,
  onFileMismatch,
}: ImportPreviewBodyProps) {
  const queryClient = useQueryClient()
  const [mismatch, setMismatch] = useState(false)

  const commitMutation = useMutation({
    mutationFn: () => {
      if (!file) {
        return Promise.reject(new Error('Missing file'))
      }
      return commitImport(file, preview.previewToken)
    },
    onSuccess: (result) => {
      const suffix = result.driftedFromPreview ? ' (counts changed since preview)' : ''
      const noun = result.imported === 1 ? 'transaction' : 'transactions'
      toastSuccess(`Imported ${result.imported} ${noun}${suffix}`)
      queryClient.invalidateQueries({ queryKey: TRANSACTIONS_KEY })
      onOpenChange(false)
      onImported()
    },
    onError: (err: unknown) => {
      const anyErr = err as { response?: { status?: number } }
      if (anyErr?.response?.status === 409) {
        setMismatch(true)
      } else {
        toastError('Could not import file. Please try again.')
      }
    },
  })

  function handleChooseDifferentFile() {
    onOpenChange(false)
    onFileMismatch()
  }

  const visibleErrors = preview.errors.slice(0, 20)

  return (
    <>
      <DialogHeader>
        <DialogTitle>Import preview</DialogTitle>
        <DialogDescription>{preview.fileName}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        {/* Summary counts */}
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center gap-0.5 rounded-xl border border-border bg-card p-(--pad-card)">
            <span className="text-lg font-semibold text-foreground">{preview.readyCount}</span>
            <span className="text-xs text-muted-foreground">Ready</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 rounded-xl border border-border bg-card p-(--pad-card)">
            <span className="text-lg font-semibold text-foreground">{preview.duplicateCount}</span>
            <span className="text-xs text-muted-foreground">Duplicates</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 rounded-xl border border-border bg-card p-(--pad-card)">
            <span className="text-lg font-semibold text-foreground">{preview.errorCount}</span>
            <span className="text-xs text-muted-foreground">Errors</span>
          </div>
        </div>

        {mismatch && (
          <div className="flex flex-col gap-2 rounded-xl border border-[var(--destructive)] bg-card p-(--pad-card)">
            <p className="text-sm text-[var(--destructive)]">
              This file has changed since it was previewed, so it can&apos;t be imported as-is.
              Please re-select the file and try again.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={handleChooseDifferentFile}
            >
              Choose a different file
            </Button>
          </div>
        )}

        {/* Errors table */}
        {preview.errorCount > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Errors
            </h4>
            <div className="flex flex-col gap-1 rounded-xl border border-border p-(--pad-card)">
              {visibleErrors.map((error, i) => (
                <div
                  key={`${error.row}-${i}`}
                  className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground"
                >
                  <span className="font-mono text-foreground">Row {error.row}</span>
                  <span>{error.reason}</span>
                  {error.field && <span className="text-muted-foreground">({error.field})</span>}
                </div>
              ))}
              {preview.errorsTruncated && (
                <p className="text-xs text-muted-foreground">
                  and {preview.errorCount - preview.errors.length} more
                </p>
              )}
            </div>
          </div>
        )}

        {/* Duplicates list */}
        {preview.duplicateCount > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Duplicates (skipped)
            </h4>
            <div className="flex flex-col gap-1 rounded-xl border border-border p-(--pad-card)">
              {preview.duplicates.map((dup, i) => (
                <div
                  key={`${dup.row}-${i}`}
                  className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground"
                >
                  <span className="font-mono text-foreground">Row {dup.row}</span>
                  <span>{dup.date}</span>
                  <span>{formatINR(dup.amount)}</span>
                  {dup.note && <span className="truncate">{dup.note}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button
          type="button"
          onClick={() => commitMutation.mutate()}
          disabled={commitMutation.isPending || mismatch || preview.readyCount === 0}
        >
          {commitMutation.isPending ? 'Importing…' : `Confirm import (${preview.readyCount})`}
        </Button>
      </DialogFooter>
    </>
  )
}
