import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";

type ReservationDialogProps = {
  description: string;
  error: string;
  onClose: () => void;
  onDescriptionChange: (value: string) => void;
  onReasonIdsChange: (value: string[]) => void;
  onSubjectChange: (value: string) => void;
  onSubmit: () => Promise<boolean>;
  reasonIds: string[];
  reasons: { id: string; label: string }[];
  slot: {
    startsAt: string;
    mode: string;
    advisor: { user: { firstName: string; lastName: string } };
  };
  subject: string;
  formatDate: (value: string) => string;
  formatMode: (value: string) => string;
};

export function ReservationDialog({
  description,
  error,
  formatDate,
  formatMode,
  onClose,
  onDescriptionChange,
  onReasonIdsChange,
  onSubjectChange,
  onSubmit,
  reasonIds,
  reasons,
  slot,
  subject,
}: ReservationDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  const submittingRef = useRef(submitting);
  onCloseRef.current = onClose;
  submittingRef.current = submitting;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submittingRef.current) {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!focusable.includes(document.activeElement as HTMLElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyboard);
    return () => {
      document.removeEventListener("keydown", handleKeyboard);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    const succeeded = await onSubmit();
    setSubmitting(false);
    if (succeeded) onClose();
  }

  function closeFromBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !submitting) onClose();
  }

  return (
    <div className="dialog-backdrop" onMouseDown={closeFromBackdrop}>
      <section
        aria-labelledby="reservation-title"
        aria-modal="true"
        className="reservation-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="reservation-dialog-header">
          <div>
            <p className="eyebrow">Finaliser la réservation</p>
            <h2 id="reservation-title">Votre demande d’entretien</h2>
          </div>
          <button
            aria-label="Fermer la fenêtre"
            className="dialog-close"
            disabled={submitting}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="selected-slot-summary">
          <strong>{formatDate(slot.startsAt)}</strong>
          <span>{slot.advisor.user.firstName} {slot.advisor.user.lastName}</span>
          <span>Modalité : {formatMode(slot.mode)}</span>
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        <form onSubmit={submit}>
          <fieldset className="reason-picker" aria-required="true">
            <legend>Motif(s)</legend>
            <p>Sélectionnez un ou plusieurs motifs.</p>
            <div className="reason-options">
              {reasons.map((reason) => (
                <label className="reason-option" key={reason.id}>
                  <input
                    checked={reasonIds.includes(reason.id)}
                    onChange={(event) =>
                      onReasonIdsChange(
                        event.target.checked
                          ? [...reasonIds, reason.id]
                          : reasonIds.filter((id) => id !== reason.id),
                      )
                    }
                    type="checkbox"
                  />
                  <span>{reason.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            Objet
            <input maxLength={160} minLength={3} onChange={(event) => onSubjectChange(event.target.value)} required value={subject} />
          </label>
          <label>
            Décrivez votre demande
            <textarea maxLength={4000} minLength={10} onChange={(event) => onDescriptionChange(event.target.value)} required value={description} />
          </label>
          <div className="dialog-actions">
            <button className="secondary" disabled={submitting} onClick={onClose} type="button">
              Choisir un autre créneau
            </button>
            <button disabled={submitting} type="submit">
              {submitting ? "Réservation…" : "Confirmer la réservation"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
