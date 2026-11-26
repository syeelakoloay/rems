/**
 * Menampilkan dialog konfirmasi sistem dan meneruskan hasil keputusan pengguna.
 */
import React, { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Field, TextInput } from './Field';

/**
 * Merender komponen system dialog dan menghubungkan data serta callback yang diterima dengan tampilan dan interaksi bagiannya.
 */
export function SystemDialog({
  open,
  type = 'confirm',
  title = 'Konfirmasi',
  message = '',
  contentMessage = '',
  inputLabel = '',
  inputPlaceholder = '',
  defaultValue = '',
  confirmText = 'Ya',
  cancelText = 'Batal',
  confirmVariant = 'primary',
  cancelVariant = 'ghost',
  onConfirm,
  onCancel,
}) {
  const [value, setValue] = useState(defaultValue);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(defaultValue || '');
      setShowPassword(false);
    }
  }, [open, defaultValue]);

  if (!open) return null;

  /**
   * Menangani aksi confirm dari pengguna dan menjalankan validasi serta pembaruan state yang diperlukan alur ini.
   */
  const handleConfirm = () => {
    onConfirm?.(type === 'prompt' ? value : true);
  };

  const descriptionLines = String(message || '').split(/\r?\n/);

  return (
    <Modal
      open={open}
      title={
        <div className="section-head preview-modal-head">
          <div>
            <h3>{title}</h3>
            <p>
              {descriptionLines.map((line, index) => (
                <React.Fragment key={`${line}-${index}`}>
                  {index > 0 ? <br /> : null}
                  {line || '\u00a0'}
                </React.Fragment>
              ))}
            </p>
          </div>
        </div>
      }
      onClose={() => onCancel?.()}
      size="md"
      scrollable={false}
    >
      {type === 'prompt' ? (
        <div className="stack">
          <Field label={inputLabel || 'Password'}>
            <div className="password-input-wrapper">
              <TextInput
                autoFocus
                type={showPassword ? 'text' : 'password'}
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={inputPlaceholder}
                autoComplete="new-password"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleConfirm();
                }}
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>

          <div className="row-actions system-dialog-actions">
            <Button type="button" variant={confirmVariant} onClick={handleConfirm}>
              {confirmText}
            </Button>
          </div>
        </div>
      ) : (
        <div className="stack system-dialog-content-wrap">
          {contentMessage ? <p className="system-dialog-content">{contentMessage}</p> : null}
          <div className="row-actions system-dialog-actions">
            <Button type="button" variant={confirmVariant} onClick={handleConfirm}>
              {confirmText}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
