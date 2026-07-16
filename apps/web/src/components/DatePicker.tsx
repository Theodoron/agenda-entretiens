import { useState } from "react";

type DatePickerProps = {
  label: string;
  value: string;
  min?: string;
  onChange: (value: string) => void;
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
  const initialDate = value ? new Date(`${value}T12:00:00`) : new Date();
  const [open, setOpen] = useState(false);
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
  const displayedValue = value
    ? capitalizeDatePart(
        new Intl.DateTimeFormat("fr-FR", { dateStyle: "full" }).format(
          new Date(`${value}T12:00:00`),
        ),
      )
    : "jj/mm/aaaa";

  return (
    <div className="date-time-field repeat-date-picker">
      <span className="date-time-label">{label}</span>
      <button
        aria-expanded={open}
        className="date-time-trigger"
        onClick={() => setOpen((current) => !current)}
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
                  aria-selected={date === value}
                  className={date === value ? "selected" : ""}
                  disabled={disabled}
                  key={date}
                  onClick={() => onChange(date)}
                  role="gridcell"
                  type="button"
                >
                  {day}
                </button>
              );
            })}
          </div>
          <button
            className="calendar-close"
            disabled={!value}
            onClick={() => setOpen(false)}
            type="button"
          >
            Valider
          </button>
        </section>
      )}
    </div>
  );
}
