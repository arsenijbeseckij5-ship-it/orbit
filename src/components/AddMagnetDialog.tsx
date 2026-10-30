import { Link2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { FormEvent } from "react";

interface AddMagnetDialogProps {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (magnet: string) => Promise<void>;
}

export function AddMagnetDialog({
  open,
  busy,
  onClose,
  onSubmit,
}: AddMagnetDialogProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  if (!open) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const magnet = inputRef.current?.value.trim();
    if (magnet) await onSubmit(magnet);
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
      <form
        aria-labelledby="magnet-title"
        className="dialog-card"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="dialog-header">
          <span className="dialog-icon">
            <Link2 size={19} />
          </span>
          <div>
            <h2 id="magnet-title">Добавить по Magnet-ссылке</h2>
            <p>Вставьте ссылку, чтобы добавить торрент в очередь.</p>
          </div>
          <button
            aria-label="Закрыть"
            className="icon-button modal-close"
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        </div>
        <label className="field-label" htmlFor="magnet-input">
          Ссылка
        </label>
        <textarea
          autoComplete="off"
          className="text-input magnet-input"
          id="magnet-input"
          placeholder="magnet:?xt=urn:btih:…"
          ref={inputRef}
          rows={3}
        />
        <div className="dialog-footer">
          <button className="button button-quiet" onClick={onClose} type="button">
            Отмена
          </button>
          <button
            className="button button-primary"
            disabled={busy}
            type="submit"
          >
            {busy ? "Добавление…" : "Добавить торрент"}
          </button>
        </div>
      </form>
    </div>
  );
}
