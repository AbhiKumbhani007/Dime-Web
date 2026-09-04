'use client'

import { useMemo, useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { usePageChrome } from '@/components/layout/PageChrome'
import { DateRangePicker } from '@/components/insights/DateRangePicker'
import { ImportPreviewModal } from '@/components/settings/ImportPreviewModal'
import { exportCsv, previewImport, type PreviewResult } from '@/lib/api/csv'
import { toastError } from '@/lib/toast'
import { toISODateString } from '@/lib/utils/date'

export default function DataPage() {
  usePageChrome(useMemo(() => ({ title: 'Data & CSV' }), []))

  const [range, setRange] = useState<DateRange | undefined>(undefined)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const exportMutation = useMutation({
    mutationFn: () =>
      exportCsv({
        from: range?.from ? toISODateString(range.from) : undefined,
        to: range?.to ? toISODateString(range.to) : undefined,
      }),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `paisa-export-${toISODateString(new Date())}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    },
    onError: () => {
      toastError('Could not export CSV. Please try again.')
    },
  })

  const previewMutation = useMutation({
    mutationFn: (file: File) => previewImport(file),
    onSuccess: (result) => {
      setPreview(result)
      setModalOpen(true)
    },
    onError: () => {
      toastError('Could not read that file. Please check it and try again.')
      setSelectedFile(null)
    },
  })

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Reset so re-selecting the same filename still fires a change event.
    event.target.value = ''
    if (!file) return
    setSelectedFile(file)
    previewMutation.mutate(file)
  }

  function resetImportFlow() {
    setSelectedFile(null)
    setPreview(null)
  }

  return (
    <div className="flex flex-col gap-(--gap) p-(--pad-page)">
      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-(--pad-card)">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold text-foreground">Export</h3>
          <p className="text-xs text-muted-foreground">
            Download your transactions as a CSV file. Leave the date range empty to export everything.
          </p>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
        <Button
          type="button"
          onClick={() => exportMutation.mutate()}
          disabled={exportMutation.isPending}
          className="w-fit gap-1.5"
        >
          <Download className="h-4 w-4" />
          {exportMutation.isPending ? 'Exporting…' : 'Export CSV'}
        </Button>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-(--pad-card)">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold text-foreground">Import</h3>
          <p className="text-xs text-muted-foreground">
            Upload a CSV file to add transactions in bulk. You&apos;ll see a preview before anything is saved.
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          data-testid="csv-file-input"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={previewMutation.isPending}
          className="w-fit gap-1.5"
        >
          <Upload className="h-4 w-4" />
          {previewMutation.isPending ? 'Reading file…' : 'Choose file'}
        </Button>
        {selectedFile && <p className="text-xs text-muted-foreground">{selectedFile.name}</p>}
      </section>

      <ImportPreviewModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        file={selectedFile}
        preview={preview}
        onImported={resetImportFlow}
        onFileMismatch={resetImportFlow}
      />
    </div>
  )
}
