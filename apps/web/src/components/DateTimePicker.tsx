import { useState } from "react";

type DateTimePickerProps = {
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

export function DateTimePicker({ label, value, min, onChange }: DateTimePickerProps) {
  const initialDate = value ? new Date(value) : new Date();
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(initialDate.getFullYear(), initialDate.getMonth(), 1),
  );
  const selectedDate = value.slice(0, 10);
  const selectedTime = value.slice(11, 16) || "09:00";
  const [parsedHour, parsedMinute] = selectedTime.split(":").map(Number);
  const hour = parsedHour ?? 9;
  const minute = parsedMinute ?? 0;
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

  function update(nextDate: string, nextTime: string) {
    let nextValue = `${nextDate}T${nextTime}`;
    if (min && nextValue < min) nextValue = min;
    onChange(nextValue);
  }

  function chooseDate(day: number) {
    const date = localDateValue(
      new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day),
    );
    update(date, selectedTime);
  }

  const displayedValue = value
    ? new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "long",
        timeStyle: "short",
      }).format(new Date(value))
    : "jj/mm/aaaa --:--";

  return (
    <div className="date-time-field">
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
              const date = localDateValue(
                new Date(
                  visibleMonth.getFullYear(),
                  visibleMonth.getMonth(),
                  day,
                ),
              );
              const disabled = Boolean(min && date < min.slice(0, 10));
              return (
                <button
                  aria-selected={date === selectedDate}
                  className={date === selectedDate ? "selected" : ""}
                  disabled={disabled}
                  key={date}
                  onClick={() => chooseDate(day)}
                  role="gridcell"
                  type="button"
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="time-fields">
            <label>
              Heure
              <input
                max={23}
                min={0}
                onChange={(event) => {
                  const nextHour = Math.max(
                    0,
                    Math.min(23, Number(event.target.value)),
                  );
                  update(
                    selectedDate || localDateValue(new Date()),
                    `${padDatePart(nextHour)}:${padDatePart(minute)}`,
                  );
                }}
                type="number"
                value={hour}
              />
            </label>
            <span aria-hidden="true">:</span>
            <label>
              Minutes
              <input
                max={59}
                min={0}
                onChange={(event) => {
                  const nextMinute = Math.max(
                    0,
                    Math.min(59, Number(event.target.value)),
                  );
                  update(
                    selectedDate || localDateValue(new Date()),
                    `${padDatePart(hour)}:${padDatePart(nextMinute)}`,
                  );
                }}
                type="number"
                value={minute}
              />
            </label>
          </div>
          <button
            className="calendar-close"
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
