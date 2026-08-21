'use client'

import { useState } from 'react'
import { CalendarIcon, X } from 'lucide-react'
import type { DateRange } from 'react-day-picker'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatDateLong } from '@/lib/utils/date'

interface DateRangePickerProps {
  value?: DateRange
  onChange: (range: DateRange | undefined) => void
}

/**
 * Optional custom range. When set it overrides the period tabs, so the parent
 * should treat `value` as the source of truth for every query.
 */
export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const active = Boolean(value?.from)

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 justify-start text-xs font-normal"
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
            {value?.from
              ? value.to
                ? `${formatDateLong(value.from)} – ${formatDateLong(value.to)}`
                : formatDateLong(value.from)
              : 'Custom date range'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            selected={value}
            onSelect={(range) => {
              // Deliberately no auto-close: react-day-picker fills `to` on the
              // first click of a range, so closing on "both set" would dismiss
              // the calendar before the user picks the end date.
              onChange(range)
            }}
            autoFocus
          />
        </PopoverContent>
      </Popover>

      {active && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Clear date range"
          onClick={() => onChange(undefined)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}
