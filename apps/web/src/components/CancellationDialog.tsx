import { useState, type FormEvent } from "react";

type CancellationDialogProps = {
  onClose: () => void;
  onConfirm: (reason: string) => Promise<boolean>;
};

export function CancellationDialog({ onClose, onConfirm }: CancellationDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    const succeeded = await onConfirm(reason.trim());
    setSubmitting(false);
    if (succeeded) onClose();
  }

  return (
    <div className="dialog-backdrop">
      <section
        aria-labelledby="cancellation-title"
        aria-modal="true"
        className="cancellation-dialog"
        role="dialog"
      >
        <h2 id="cancellation-title">Annuler l’entretien</h2>
        <p>Le motif sera conservé dans l’historique de l’entretien.</p>
        <form onSubmit={submit}>
          <label>
            Motif de l’annulation
            <textarea
              autoFocus
              maxLength={500}
              minLength={3}
              onChange={(event) => setReason(event.target.value)}
              required
              value={reason}
            />
          </label>
          <div className="dialog-actions">
            <button className="secondary" disabled={submitting} onClick={onClose} type="button">
              Conserver l’entretien
            </button>
            <button disabled={submitting || reason.trim().length < 3} type="submit">
              {submitting ? "Annulation…" : "Confirmer l’annulation"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
