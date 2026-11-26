/**
 * Menyediakan kontrol rentang tanggal dan filter periode untuk tabel atau grafik.
 */
import { formatDate } from '../../lib/date';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, PencilLine } from 'lucide-react';
import { SearchableSelect, TextInput } from '../ui/Field';

const DEFAULT_FILTER_OPTIONS = [
  { value: 'all', label: 'Semua' },
  { value: 'today', label: 'Hari ini' },
  { value: 'custom', label: 'Tanggal' },
];

/**
 * Memisahkan nilai rentang filter kustom menjadi tanggal mulai dan tanggal akhir untuk mengisi kontrol kalender.
 */
const getRangeParts = (value) => {
  if (value && typeof value === 'object') {
    return {
      start: String(value.start || ''),
      end: String(value.end || ''),
    };
  }
  // Backward compatibility for callers still providing a single YYYY-MM-DD date.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { start: value, end: value };
  }
  return { start: '', end: '' };
};

/**
 * Memformat range tanggal untuk tampilan pengguna atau keluaran laporan tanpa mengubah nilai sumber.
 */
const formatRangeDate = (value) => {
  if (!value) return '';
  const formatted = formatDate(value);
  return formatted === '-' ? String(value) : formatted;
};

/**
 * Merender komponen tanggal filter bar dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function DateFilterBar({
  value,
  onChange,
  customDate,
  onCustomDateChange,
  options = DEFAULT_FILTER_OPTIONS,
  customValue = 'custom',
  fallbackValue = 'all',
  className = '',
  controlClassName = 'control',
  dateLabel = 'Tanggal',
}) {
  const controlRef = useRef(null);
  const popoverRef = useRef(null);
  const [isDatePopoverOpen, setIsDatePopoverOpen] = useState(false);
  const initialRange = getRangeParts(customDate);
  const [draftStart, setDraftStart] = useState(initialRange.start);
  const [draftEnd, setDraftEnd] = useState(initialRange.end);
  const [popoverStyle, setPopoverStyle] = useState({});
  const [validationMessage, setValidationMessage] = useState('');

  const range = getRangeParts(customDate);
  const hasAppliedRange = Boolean(range.start && range.end && range.start <= range.end);
  const rangeLabel = hasAppliedRange
    ? `${formatRangeDate(range.start)} - ${formatRangeDate(range.end)}`
    : undefined;
  const resolvedOptions = options.map((option) => (
    String(option.value) === String(customValue) && option.label === 'Tanggal'
      ? { ...option, label: dateLabel }
      : option
  ));
  const customOptionLabel = resolvedOptions.find(
    (option) => String(option.value) === String(customValue),
  )?.label || dateLabel;

  useEffect(() => {
    if (value !== customValue || !hasAppliedRange) {
      const nextRange = getRangeParts(customDate);
      setDraftStart(nextRange.start);
      setDraftEnd(nextRange.end);
    }
  }, [customDate, customValue, hasAppliedRange, value]);

  const updatePopoverPosition = useCallback(() => {
    const trigger = controlRef.current?.querySelector('.searchable-select-input');
    if (!trigger || !isDatePopoverOpen) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const gap = 5;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const width = Math.min(rect.width, viewportWidth - viewportPadding * 2);
    const left = Math.max(
      viewportPadding,
      Math.min(rect.left, viewportWidth - width - viewportPadding),
    );
    const popoverHeight = popoverRef.current?.scrollHeight || 250;
    const availableBelow = Math.max(0, viewportHeight - rect.bottom - gap - viewportPadding);
    const availableAbove = Math.max(0, rect.top - gap - viewportPadding);
    let top;
    let maxHeight;

    if (popoverHeight <= availableBelow) {
      top = rect.bottom + gap;
      maxHeight = popoverHeight;
    } else if (popoverHeight <= availableAbove) {
      top = rect.top - gap - popoverHeight;
      maxHeight = popoverHeight;
    } else if (availableAbove > availableBelow) {
      maxHeight = Math.max(100, Math.min(popoverHeight, availableAbove));
      top = Math.max(viewportPadding, rect.top - gap - maxHeight);
      maxHeight = Math.min(maxHeight, rect.top - gap - top);
    } else {
      top = Math.min(rect.bottom + gap, viewportHeight - viewportPadding - 100);
      maxHeight = Math.max(100, Math.min(popoverHeight, viewportHeight - viewportPadding - top));
    }

    // Keep the popover within the viewport even when neither side has enough room.
    maxHeight = Math.max(80, Math.min(maxHeight, viewportHeight - viewportPadding * 2));
    top = Math.max(viewportPadding, Math.min(top, viewportHeight - viewportPadding - maxHeight));

    const nextStyle = {
      position: 'fixed',
      top,
      left,
      width,
      maxWidth: `calc(100vw - ${viewportPadding * 2}px)`,
      maxHeight,
      overflowY: 'hidden',
      boxSizing: 'border-box',
    };
    setPopoverStyle((current) => (
      current.top === nextStyle.top
      && current.left === nextStyle.left
      && current.width === nextStyle.width
      && current.maxHeight === nextStyle.maxHeight
        ? current
        : nextStyle
    ));
  }, [isDatePopoverOpen]);

  useLayoutEffect(() => {
    if (!isDatePopoverOpen) return undefined;
    updatePopoverPosition();
    /**
     * Menangani aksi resize or scroll dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
     */
    const handleResizeOrScroll = () => updatePopoverPosition();
    window.addEventListener('resize', handleResizeOrScroll);
    window.addEventListener('scroll', handleResizeOrScroll, true);
    const resizeObserver = typeof ResizeObserver !== 'undefined' && popoverRef.current
      ? new ResizeObserver(handleResizeOrScroll)
      : null;
    if (resizeObserver && popoverRef.current) resizeObserver.observe(popoverRef.current);
    return () => {
      window.removeEventListener('resize', handleResizeOrScroll);
      window.removeEventListener('scroll', handleResizeOrScroll, true);
      resizeObserver?.disconnect();
    };
  }, [isDatePopoverOpen, updatePopoverPosition]);

  useEffect(() => {
    if (!isDatePopoverOpen) return undefined;

    /**
     * Menutup tampilan popover dan membersihkan state antarmuka yang hanya berlaku selama tampilan terbuka.
     */
    const dismissPopover = () => {
      setIsDatePopoverOpen(false);
      if (value === customValue && !hasAppliedRange) {
        onCustomDateChange?.({ start: '', end: '' });
        onChange?.(fallbackValue);
      }
    };
    /**
     * Menangani aksi pointer down dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
     */
    const handlePointerDown = (event) => {
      if (
        !controlRef.current?.contains(event.target)
        && !popoverRef.current?.contains(event.target)
      ) {
        dismissPopover();
      }
    };
    /**
     * Menangani aksi key down dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
     */
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') dismissPopover();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDatePopoverOpen, value, customValue, fallbackValue, hasAppliedRange, onChange, onCustomDateChange]);

    /**
   * Membuka popover kalender dan mengisi tanggal sementara dari filter kustom yang sedang aktif.
   */
  const openDatePopover = () => {
    const nextRange = getRangeParts(customDate);
    setDraftStart(nextRange.start);
    setDraftEnd(nextRange.end);
    setValidationMessage('');
    setIsDatePopoverOpen(true);
  };

  /**
   * Menangani aksi filter change dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleFilterChange = (event) => {
    const nextValue = event?.target?.value;
    onChange?.(nextValue);
    if (String(nextValue) === String(customValue)) {
      const nextRange = getRangeParts(customDate);
      setDraftStart(nextRange.start);
      setDraftEnd(nextRange.end);
      setValidationMessage('');
      setIsDatePopoverOpen(true);
    } else {
      setIsDatePopoverOpen(false);
    }
  };

    /**
   * Menerapkan rentang tanggal yang dipilih ke kontrol filter setelah nilai awal dan akhir diperiksa.
   */
  const applyDateRange = () => {
    if (!draftStart || !draftEnd) {
      setValidationMessage('Isi Tanggal Mulai dan Tanggal Akhir terlebih dahulu.');
      return;
    }
    if (draftStart > draftEnd) {
      setValidationMessage('Tanggal Mulai tidak boleh melewati Tanggal Akhir.');
      return;
    }

    onCustomDateChange?.({ start: draftStart, end: draftEnd });
    setValidationMessage('');
    setIsDatePopoverOpen(false);
  };

  return (
    <div className={['date-filter-bar', className].filter(Boolean).join(' ')}>
      <div className="field">
        <span className="field-label">Filter</span>
        <div
          ref={controlRef}
          className={`date-filter-control ${hasAppliedRange && String(value) === String(customValue) ? 'has-range' : ''}`.trim()}
        >
          <SearchableSelect
            className={controlClassName}
            value={value}
            onChange={handleFilterChange}
            displayValue={String(value) === String(customValue) ? (rangeLabel || customOptionLabel) : undefined}
            aria-label="Filter tanggal"
          >
            {resolvedOptions.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </SearchableSelect>
          {String(value) === String(customValue) && hasAppliedRange ? (
            <button
              type="button"
              className="date-filter-edit-button"
              title="Ubah rentang tanggal"
              aria-label="Ubah rentang tanggal"
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                openDatePopover();
              }}
            >
              <PencilLine size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {isDatePopoverOpen && typeof document !== 'undefined' ? createPortal(
        <div
          ref={popoverRef}
          className="date-range-popover"
          style={popoverStyle}
          role="dialog"
          aria-label="Pilih rentang tanggal"
        >
          <div className="date-range-popover-inner">
          <h4 className="date-range-popover-title">Pilih Rentang Tanggal</h4>
          <label className="date-range-field">
            <span>Tanggal Mulai</span>
            <TextInput
              type="date"
              className="control"
              value={draftStart}
              max={draftEnd || undefined}
              onChange={(event) => {
                setDraftStart(event.target.value);
                setValidationMessage('');
              }}
            />
          </label>
          <label className="date-range-field">
            <span>Tanggal Akhir</span>
            <TextInput
              type="date"
              className="control"
              value={draftEnd}
              min={draftStart || undefined}
              onChange={(event) => {
                setDraftEnd(event.target.value);
                setValidationMessage('');
              }}
            />
          </label>
          {validationMessage ? <p className="date-range-validation">{validationMessage}</p> : null}
          <div className="date-range-popover-actions">
            <button type="button" className="btn btn-primary" onClick={applyDateRange}>
              <Check size={15} strokeWidth={2} aria-hidden="true" />
              Terapkan
            </button>
          </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
