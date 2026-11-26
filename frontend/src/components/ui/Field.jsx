/**
 * Menyediakan komponen field dan input bersama, termasuk dropdown yang dapat dicari.
 */
import React, { useEffect, useMemo, useRef, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Merender komponen field dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function Field({
  label,
  hint,
  error,
  children,
  className = '',
  required = false,
}) {
  return (
    <label className={['field', className].filter(Boolean).join(' ')}>
      <span className="field-label">
        {label}
        {required ? <span className="field-required">*</span> : null}
      </span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

/**
 * Merender komponen text input dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function TextInput({ onChange, debounceMs = 0, ...props }) {
  const isNumber = props.type === 'number';
  const isTelephone = props.type === 'tel';
  const isDebounced = Number(debounceMs) > 0;
  const [internalValue, setInternalValue] = useState(
    props.value ?? props.defaultValue ?? '',
  );
  const debounceRef = useRef(null);
  const lastExternalValueRef = useRef(props.value ?? props.defaultValue ?? '');

  useEffect(() => {
    if (!isDebounced) return;
    const nextExternalValue = props.value ?? '';
    if (nextExternalValue !== lastExternalValueRef.current) {
      lastExternalValueRef.current = nextExternalValue;
      setInternalValue(nextExternalValue);
    }
  }, [isDebounced, props.value]);

  useEffect(() => () => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
  }, []);

    /**
   * Meneruskan perubahan nilai input ke callback yang diberikan pemanggil dengan format nilai yang konsisten.
   */
  const emitChange = (event) => {
    if (!isDebounced) {
      onChange?.(event);
      return;
    }

    const nextValue = event.target.value;
    setInternalValue(nextValue);

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      onChange?.(event);
    }, Number(debounceMs));
  };

  /**
   * Menangani aksi change dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleChange = (event) => {
    if (isTelephone) {
      const rawTelephone = event.target.value;
      const sanitizedTelephone = rawTelephone.replace(/[^0-9+-]/g, '');
      if (sanitizedTelephone !== rawTelephone) {
        const nextTarget = { ...event.target, value: sanitizedTelephone };
        emitChange({ ...event, target: nextTarget, currentTarget: nextTarget });
        return;
      }
      emitChange(event);
      return;
    }

    if (!isNumber) {
      emitChange(event);
      return;
    }

    const raw = event.target.value;
    if (raw === '') {
      emitChange(event);
      return;
    }

    // Numeric fields must never accept a negative value.
    // Keep the same event shape used by the existing form handlers.
    const sanitized = raw.replace(/-/g, '');
    if (sanitized !== raw) {
      const nextTarget = {
        ...event.target,
        value: sanitized,
      };
      emitChange({ ...event, target: nextTarget, currentTarget: nextTarget });
      return;
    }

    emitChange(event);
  };

  /**
   * Menangani aksi key down dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleKeyDown = (event) => {
    if (isNumber && event.key === '-') {
      event.preventDefault();
      return;
    }
    props.onKeyDown?.(event);
  };

  return (
    <input
      className="control"
      {...props}
      value={isDebounced ? internalValue : props.value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
    />
  );
}

/**
 * Mengubah opsi dropdown menjadi teks yang dapat dipakai untuk pencarian dan tampilan.
 */
function optionText(children) {
  return React.Children.toArray(children)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') {
        return String(child);
      }
      return child?.props?.children || '';
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Mengolah urutan atau kelompok options agar data tersaji sesuai kebutuhan tampilan atau proses.
 */
function flattenOptions(children) {
  const result = [];

  React.Children.forEach(children, (child) => {
    if (!child) return;

    if (child.type === React.Fragment) {
      result.push(...flattenOptions(child.props.children));
      return;
    }

    if (child.type === 'option') {
      const label = optionText(child.props.children);
      const value = child.props.value ?? label;
      if (String(label).trim().toLowerCase() === 'lainnya') return;
      if (String(value).trim().toLowerCase() === 'lainnya') return;
      const normalizedLabel = String(label).trim();
      const isPlaceholder =
        !String(value).trim() ||
        /^(pilih|select)(?:\s|$)/i.test(normalizedLabel) ||
        /^(?:--+|\.{3,})$/.test(normalizedLabel);
      result.push({
        value: String(value),
        label,
        isPlaceholder,
        disabled: Boolean(child.props.disabled) || isPlaceholder,
      });
      return;
    }

    if (child.type === 'optgroup') {
      flattenOptions(child.props.children).forEach((option) => {
        result.push(option);
      });
    }
  });

  return result;
}

/**
 * Merender komponen searchable select dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function SearchableSelect({
  value = '',
  onChange,
  children,
  optionsData = null,
  className = 'control',
  wrapperClassName = '',
  displayValue,
  placeholder = 'Pilih...',
  searchable = false,
  maxOptions = 100,
  searchDebounceMs = 400,
  minSearchLength = 0,
  minSearchHint = '',
  allowCustom = false,
  allowSpaceInput = false,
  filterOption,
  disabled = false,
  name,
  id,
  required = false,
  'aria-label': ariaLabel,
  multiple = false,
  onKeyDown,
  onBlur,
  ...rest
}) {
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const optionPageSize = Number.isFinite(Number(maxOptions)) && Number(maxOptions) > 0
    ? Math.max(1, Math.floor(Number(maxOptions)))
    : 100;
  const [visibleOptionCount, setVisibleOptionCount] = useState(optionPageSize);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [placement, setPlacement] = useState('bottom');
  const [menuStyle, setMenuStyle] = useState({});

  useEffect(() => {
    const delay = searchable ? Math.max(0, Number(searchDebounceMs) || 0) : 0;
    if (delay === 0) {
      setDebouncedSearch(search);
      return undefined;
    }
    const timer = window.setTimeout(() => setDebouncedSearch(search), delay);
    return () => window.clearTimeout(timer);
  }, [search, searchable, searchDebounceMs]);

  const clearSearch = () => {
    setSearch('');
    setDebouncedSearch('');
    setVisibleOptionCount(optionPageSize);
    setActiveIndex(-1);
  };

  const allOptions = useMemo(() => {
    if (!Array.isArray(optionsData)) return flattenOptions(children);
    return optionsData.map((option) => {
      const label = String(option?.label ?? option?.value ?? '');
      const value = String(option?.value ?? label);
      const isPlaceholder = Boolean(option?.isPlaceholder)
        || !value.trim()
        || /^(pilih|select)(?:\s|$)/i.test(label)
        || /^(?:--+|\.{3,})$/.test(label);
      return {
        value,
        label,
        isPlaceholder,
        disabled: Boolean(option?.disabled) || isPlaceholder,
      };
    }).filter((option) => (
      String(option.label).trim().toLowerCase() !== 'lainnya'
      && String(option.value).trim().toLowerCase() !== 'lainnya'
    ));
  }, [children, optionsData]);
  const placeholderOption = allOptions.find((option) => option.isPlaceholder);
  const options = useMemo(
    () => allOptions.filter((option) => !option.isPlaceholder),
    [allOptions],
  );
  const effectivePlaceholder = placeholder !== 'Pilih...'
    ? placeholder
    : (placeholderOption?.label || placeholder);

  const selectedValues = multiple && Array.isArray(value)
    ? value.map((item) => String(item))
    : (!multiple && value !== '' && value != null ? [String(value)] : []);
  const selectedLabels = selectedValues
    .map((selectedValue) => {
      const option = options.find((item) => String(item.value) === selectedValue);
      return option?.label || selectedValue;
    })
    .filter(Boolean);
  const selected = options.find(
    (option) => String(option.value) === String(value),
  );
  const hasSelection = multiple
    ? selectedLabels.length > 0
    : Boolean(selected) || (allowCustom && String(value ?? '').trim() !== '');

  // Searchable dropdowns share a short debounce and incremental result rendering,
  // while keeping selection-only dropdowns unchanged.
  const isSearchPending = searchable && search.trim() !== debouncedSearch.trim();
  const minimumSearchNotMet = searchable
    && Number(minSearchLength) > 0
    && debouncedSearch.trim().length < Number(minSearchLength);

  const filteredOptions = useMemo(() => {
    if (minimumSearchNotMet) return [];
    let matches = options;
    const queryText = debouncedSearch.trim();
    if (searchable && queryText) {
      const query = queryText.toLocaleLowerCase('id-ID');
      if (typeof filterOption === 'function') {
        matches = options.filter((option) => filterOption(option, queryText));
      } else {
        matches = options.filter((option) =>
          `${option.label || ''} ${option.value || ''}`.toLocaleLowerCase('id-ID').includes(query)
        );
      }
    }
    return matches;
  }, [options, searchable, debouncedSearch, filterOption, minimumSearchNotMet]);

  const visibleOptions = useMemo(
    () => filteredOptions.slice(0, visibleOptionCount),
    [filteredOptions, visibleOptionCount],
  );

  useEffect(() => {
    if (activeIndex >= visibleOptionCount) {
      setVisibleOptionCount(Math.min(filteredOptions.length, activeIndex + optionPageSize));
    }
  }, [activeIndex, visibleOptionCount, filteredOptions.length, optionPageSize]);

  const enabledIndexes = useMemo(
    () => filteredOptions
      .map((option, index) => (option.disabled ? -1 : index))
      .filter((index) => index >= 0),
    [filteredOptions],
  );

  /**
   * Menyimpan atau memperbarui placement dengan mengikuti validasi dan aturan bisnis pada modul.
   */
  const updatePlacement = () => {
    const element = inputRef.current;
    if (!element || !open) return;

    const rect = element.getBoundingClientRect();
    const viewportPadding = 12;
    const estimatedHeight = Math.min(240, Math.max(48, filteredOptions.length * 40 + 12));
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const fitsBelow = spaceBelow >= Math.min(estimatedHeight, 160);
    const fitsAbove = spaceAbove >= Math.min(estimatedHeight, 160);

    let nextPlacement = 'bottom';
    if (!fitsBelow && fitsAbove) nextPlacement = 'top';
    else if (!fitsBelow && !fitsAbove) {
      const spaceRight = window.innerWidth - rect.right - viewportPadding;
      const spaceLeft = rect.left - viewportPadding;
      nextPlacement = spaceRight >= spaceLeft ? 'right' : 'left';
    }

    const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
    const horizontalBase = nextPlacement === 'left'
      ? Math.max(viewportPadding, rect.left - width - 6)
      : nextPlacement === 'right'
        ? Math.min(window.innerWidth - width - viewportPadding, rect.right + 6)
        : Math.min(window.innerWidth - width - viewportPadding, Math.max(viewportPadding, rect.left));

    let top = rect.bottom + 6;
    let left = horizontalBase;
    if (nextPlacement === 'top') {
      top = Math.max(viewportPadding, rect.top - estimatedHeight - 6);
    } else if (nextPlacement === 'left' || nextPlacement === 'right') {
      top = Math.min(
        window.innerHeight - Math.min(estimatedHeight, 240) - viewportPadding,
        Math.max(viewportPadding, rect.top),
      );
    }

    setPlacement(nextPlacement);
    const availableHeight = nextPlacement === 'bottom'
      ? spaceBelow - 8
      : nextPlacement === 'top'
        ? spaceAbove - 8
        : window.innerHeight - top - viewportPadding;

    setMenuStyle({
      position: 'fixed',
      top,
      left,
      width,
      maxHeight: Math.max(80, Math.min(240, availableHeight)),
      boxSizing: 'border-box',
    });
  };

  useEffect(() => {
    /**
     * Menangani aksi pointer down dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
     */
    const handlePointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) {
        setOpen(false);
        clearSearch();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePlacement();
    const events = ['resize', 'scroll'];
    events.forEach((eventName) => window.addEventListener(eventName, updatePlacement, true));
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, updatePlacement, true));
    };
  }, [open, filteredOptions.length]);

  useEffect(() => {
    if (!open) return;
    // Do not highlight the current selection simply because the menu was opened.
    // Keyboard navigation activates an option only after ArrowUp/ArrowDown/Home/End.
    setActiveIndex(-1);
  }, [open, search, value, filteredOptions, enabledIndexes]);

  useEffect(() => {
    if (activeIndex < 0) return;
    const active = menuRef.current?.querySelector(`[data-option-index="${activeIndex}"]`);
    active?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, visibleOptionCount]);

    /**
   * Meneruskan perubahan nilai input ke callback yang diberikan pemanggil dengan format nilai yang konsisten.
   */
  const emitChange = (nextValue) => {
    onChange?.({
      target: {
        name,
        value: nextValue,
      },
      currentTarget: {
        name,
        value: nextValue,
      },
    });
  };

    /**
   * Menampilkan daftar opsi dropdown dan menyiapkan status interaksi agar pengguna dapat memilih nilai melalui mouse atau keyboard.
   */
  const openDropdown = () => {
    if (disabled) return;
    setOpen(true);
    clearSearch();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      updatePlacement();
    });
  };

    /**
   * Memilih opsi aktif; mode multi-pilih memperbarui daftar tanpa menutup dropdown, sedangkan mode tunggal menutupnya.
   */
  const selectOption = (option) => {
    if (!option || option.disabled) return;
    if (multiple) {
      const optionValue = String(option.value);
      const nextValues = selectedValues.includes(optionValue)
        ? selectedValues.filter((item) => item !== optionValue)
        : [...selectedValues, optionValue];
      emitChange(nextValues);
      clearSearch();
      return;
    }
    emitChange(option.value);
    setOpen(false);
    clearSearch();
  };

    /**
   * Memindahkan fokus opsi aktif saat pengguna menavigasi dropdown dengan tombol keyboard.
   */
  const moveActive = (direction) => {
    if (!enabledIndexes.length) return;
    const currentPosition = enabledIndexes.indexOf(activeIndex);
    const nextPosition = currentPosition < 0
      ? (direction > 0 ? 0 : enabledIndexes.length - 1)
      : currentPosition + direction;
    const bounded = Math.min(enabledIndexes.length - 1, Math.max(0, nextPosition));
    setActiveIndex(enabledIndexes[bounded]);
  };

  /**
   * Menangani aksi key down dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleKeyDown = (event) => {
    if (disabled) return;

    // Pada field pencarian nama obat, spasi merupakan bagian dari nama yang diketik,
    // bukan perintah untuk membuka dropdown atau memilih opsi.
    if ((searchable || allowSpaceInput) && open && event.key === ' ') return;

    if (!open && ['Enter', ' ', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      openDropdown();
      return;
    }

    if (!open) {
      onKeyDown?.(event);
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        moveActive(1);
        return;
      case 'ArrowUp':
        event.preventDefault();
        moveActive(-1);
        return;
      case 'Home':
        event.preventDefault();
        if (enabledIndexes.length) setActiveIndex(enabledIndexes[0]);
        return;
      case 'End':
        event.preventDefault();
        if (enabledIndexes.length) setActiveIndex(enabledIndexes[enabledIndexes.length - 1]);
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (activeIndex >= 0) {
          selectOption(filteredOptions[activeIndex]);
        } else if (allowCustom && search.trim()) {
          emitChange(search.trim());
          setOpen(false);
          clearSearch();
        }
        return;
      case 'Escape':
        event.preventDefault();
        setOpen(false);
        clearSearch();
        return;
      default:
        onKeyDown?.(event);
    }
  };

  return (
    <div
      ref={wrapperRef}
      className={`searchable-select ${open ? 'is-open' : ''} searchable-select-placement-${placement} ${wrapperClassName}`.trim()}
    >
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        className={`searchable-select-input ${className} ${!hasSelection ? 'is-placeholder' : ''} ${multiple && hasSelection ? 'has-selected-values' : ''}`.trim()}
        value={searchable && open ? search : (multiple ? '' : (displayValue ?? selected?.label ?? (allowCustom ? String(value ?? '') : '')))}
        placeholder={multiple
          ? (displayValue ?? (selectedLabels.length ? selectedLabels.join(', ') : effectivePlaceholder))
          : (displayValue ?? (selected ? selected.label : (allowCustom && String(value ?? '').trim() ? '' : effectivePlaceholder)))}
        disabled={disabled}
        readOnly={!searchable}
        aria-readonly={!searchable}
        onChange={searchable ? (event) => {
          const nextSearch = event.target.value;
          setSearch(nextSearch);
          setVisibleOptionCount(optionPageSize);
          setOpen(true);
          setActiveIndex(-1);
          if (allowCustom) emitChange(nextSearch);
        } : undefined}
        required={required && (multiple ? selectedValues.length === 0 : !value)}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? `${id || name || 'searchable-select'}-menu` : undefined}
        aria-autocomplete={searchable ? 'list' : 'none'}
        aria-activedescendant={open && activeIndex >= 0 ? `${id || name || 'searchable-select'}-option-${activeIndex}` : undefined}
        autoComplete="off"
        onFocus={() => { if (!open) openDropdown(); }}
        onClick={() => { if (!open) openDropdown(); }}
        {...rest}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          onBlur?.(event);
          window.setTimeout(() => {
            if (!wrapperRef.current?.contains(document.activeElement)) {
              setOpen(false);
              clearSearch();
            }
          }, 0);
        }}
      />

      {open && typeof document !== 'undefined' ? createPortal(
        <div
          ref={menuRef}
          id={`${id || name || 'searchable-select'}-menu`}
          className="searchable-select-menu"
          role="listbox"
          aria-multiselectable={multiple || undefined}
          style={menuStyle}
        >
          <div
            className="searchable-select-menu-scroll"
            onScroll={(event) => {
              const element = event.currentTarget;
              if (element.scrollTop + element.clientHeight >= element.scrollHeight - 48
                && visibleOptionCount < filteredOptions.length) {
                setVisibleOptionCount((current) => Math.min(filteredOptions.length, current + optionPageSize));
              }
            }}
          >
            {isSearchPending ? (
              <div className="searchable-select-empty">Mencari opsi...</div>
            ) : minimumSearchNotMet ? (
              <div className="searchable-select-empty">{minSearchHint || `Ketik minimal ${Number(minSearchLength)} karakter untuk mencari.`}</div>
            ) : filteredOptions.length ? (
              visibleOptions.map((option, index) => (
                <button
                  type="button"
                  id={`${id || name || 'searchable-select'}-option-${index}`}
                  key={`${option.value}-${option.label}`}
                  data-option-index={index}
                  className={`searchable-select-option ${multiple ? 'searchable-select-option-multiple' : ''} ${(multiple ? selectedValues.includes(String(option.value)) : String(option.value) === String(value)) ? 'is-selected' : ''} ${index === activeIndex ? 'is-active' : ''}`.trim()}
                  disabled={option.disabled}
                  role="option"
                  aria-selected={multiple ? selectedValues.includes(String(option.value)) : String(option.value) === String(value)}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                  onClick={() => selectOption(option)}
                >
                  {multiple ? (
                    <>
                      <span className={`searchable-select-multi-checkbox ${selectedValues.includes(String(option.value)) ? 'is-checked' : ''}`} aria-hidden="true">
                        {selectedValues.includes(String(option.value)) ? '✓' : ''}
                      </span>
                      <span>{option.label || option.value}</span>
                    </>
                  ) : (option.label || option.value)}
                </button>
              ))
            ) : (
              <div className="searchable-select-empty">
                {allowCustom && search.trim() ? 'Nama baru akan digunakan.' : 'Data tidak ditemukan.'}
              </div>
            )}
            {!isSearchPending && !minimumSearchNotMet && filteredOptions.length > visibleOptionCount ? (
              <div className="searchable-select-more" aria-live="polite">
                Menampilkan {visibleOptionCount.toLocaleString('id-ID')} dari {filteredOptions.length.toLocaleString('id-ID')} hasil. Gulir untuk menampilkan pilihan lainnya.
              </div>
            ) : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
