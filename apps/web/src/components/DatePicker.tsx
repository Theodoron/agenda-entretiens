import { useEffect, useRef, useState } from "react";

type DatePickerProps = {
  label: string;
  value: string[];
  min?: string;
  onChange: (value: string[]) => void;
};

const capitalizeDatePart = (value: string) =>
  value ? value.charAt(0).toLocaleUpperCase("fr-FR") + value.slice(1) : value;
const padDatePart = (value: number) => String(value).padStart(2, "0");
const localDateValue = (date: Date) =>
  `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;

export function DatePicker({
  label,
  value,
  min,
  onChange,
}: DatePickerProps) {
  const initialDate = value[0] ? new Date(`${value[0]}T12:00:00`) : new Date();
  const pickerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draftValue, setDraftValue] = useState<string[]>(value);
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(initialDate.getFullYear(), initialDate.getMonth(), 1),
  );
  const monthLabel = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  }).format(visibleMonth);
  const firstWeekday = (visibleMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    0,
  ).getDate();
  const displayedValue = value.length
    ? `${value.length} date${value.length > 1 ? "s" : ""} sélectionnée${value.length > 1 ? "s" : ""}`
    : "Choisir les dates";

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: PointerEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function toggle() {
    if (!open) {
      setDraftValue([...value]);
      const source = value[0] ? new Date(`${value[0]}T12:00:00`) : new Date();
      setVisibleMonth(new Date(source.getFullYear(), source.getMonth(), 1));
    }
    setOpen((current) => !current);
  }

  function confirm() {
    if (!draftValue.length) return;
    onChange([...draftValue].sort());
    setOpen(false);
  }

  function toggleDate(date: string) {
    setDraftValue((current) =>
      current.includes(date)
        ? current.filter((item) => item !== date)
        : [...current, date].sort(),
    );
  }

  return (
    <div className="date-time-field repeat-date-picker" ref={pickerRef}>
      <span className="date-time-label">{label}</span>
      <button
        aria-expanded={open}
        className="date-time-trigger"
        onClick={toggle}
        type="button"
      >
        <span>{displayedValue}</span>
        <span aria-hidden="true" className="calendar-icon">
          ▣
        </span>
      </button>
      {open && (
        <section
          aria-label={`Sélectionner : ${label}`}
          className="date-time-popover"
        >
          <button
            aria-label={`Fermer sans modifier ${label.toLocaleLowerCase("fr-FR")}`}
            className="picker-dismiss"
            onClick={() => setOpen(false)}
            type="button"
          >
            ×
          </button>
          <div className="calendar-heading">
            <button
              aria-label="Mois précédent"
              onClick={() =>
                setVisibleMonth(
                  new Date(
                    visibleMonth.getFullYear(),
                    visibleMonth.getMonth() - 1,
                    1,
                  ),
                )
              }
              type="button"
            >
              ‹
            </button>
            <strong>{capitalizeDatePart(monthLabel)}</strong>
            <button
              aria-label="Mois suivant"
              onClick={() =>
                setVisibleMonth(
                  new Date(
                    visibleMonth.getFullYear(),
                    visibleMonth.getMonth() + 1,
                    1,
                  ),
                )
              }
              type="button"
            >
              ›
            </button>
          </div>
          <div className="calendar-grid" role="grid">
            {["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"].map((day) => (
              <span className="calendar-weekday" key={day}>
                {day}
              </span>
            ))}
            {Array.from({ length: firstWeekday }, (_, index) => (
              <span aria-hidden="true" key={`empty-${index}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const day = index + 1;
              const dateObject = new Date(
                visibleMonth.getFullYear(),
                visibleMonth.getMonth(),
                day,
              );
              const date = localDateValue(dateObject);
              const disabled = Boolean(min && date < min);
              return (
                <button
                  aria-selected={draftValue.includes(date)}
                  className={draftValue.includes(date) ? "selected" : ""}
                  disabled={disabled}
                  key={date}
                  onClick={() => toggleDate(date)}
                  role="gridcell"
                  type="button"
                >
                  {day}
                </button>
              );
            })}
          </div>
          <p className="calendar-selection-count" role="status">
            {draftValue.length
              ? `${draftValue.length} date${draftValue.length > 1 ? "s" : ""} sélectionnée${draftValue.length > 1 ? "s" : ""}`
              : "Aucune date sélectionnée"}
          </p>
          <button
            className="calendar-close"
            disabled={!draftValue.length}
            onClick={confirm}
            type="button"
          >
            {draftValue.length
              ? `Ajouter ${draftValue.length} date${draftValue.length > 1 ? "s" : ""}`
              : "Ajouter les dates sélectionnées"}
          </button>
        </section>
      )}
    </div>
  );
}
