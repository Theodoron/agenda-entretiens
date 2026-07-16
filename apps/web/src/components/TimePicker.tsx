import { useState } from "react";

type TimePickerProps = {
  label: string;
  value: string;
  defaultTime: string;
  min?: string | undefined;
  onChange: (value: string) => void;
};

const hours = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, "0"),
);
const minutes = ["00", "15", "30", "45"];

export function TimePicker({
  label,
  value,
  defaultTime,
  min,
  onChange,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [draftHour, setDraftHour] = useState(defaultTime.slice(0, 2));
  const [draftMinute, setDraftMinute] = useState(defaultTime.slice(3, 5));
  const draftValue = `${draftHour}:${draftMinute}`;
  const invalid = Boolean(min && draftValue <= min);

  function toggle() {
    if (!open) {
      const source = value || defaultTime;
      setDraftHour(source.slice(0, 2));
      setDraftMinute(source.slice(3, 5));
    }
    setOpen((current) => !current);
  }

  function confirm() {
    if (invalid) return;
    onChange(draftValue);
    setOpen(false);
  }

  return (
    <div className="date-time-field time-picker">
      <span className="date-time-label">{label}</span>
      <button
        aria-expanded={open}
        className="date-time-trigger"
        onClick={toggle}
        type="button"
      >
        <span>{value || "--:--"}</span>
        <span aria-hidden="true" className="calendar-icon">
          ◷
        </span>
      </button>
      {open && (
        <section
          aria-label={`Sélectionner : ${label}`}
          className="date-time-popover time-picker-popover"
        >
          <strong>Choisir l’horaire</strong>
          <div className="time-selectors">
            <label>
              Heure
              <select
                onChange={(event) => setDraftHour(event.target.value)}
                value={draftHour}
              >
                {hours.map((hour) => (
                  <option key={hour} value={hour}>
                    {hour}
                  </option>
                ))}
              </select>
            </label>
            <span aria-hidden="true">:</span>
            <label>
              Minutes
              <select
                onChange={(event) => setDraftMinute(event.target.value)}
                value={draftMinute}
              >
                {minutes.map((minute) => (
                  <option key={minute} value={minute}>
                    {minute}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {invalid && (
            <p className="time-picker-error">
              Choisissez une heure postérieure à {min}.
            </p>
          )}
          <button
            className="calendar-close"
            disabled={invalid}
            onClick={confirm}
            type="button"
          >
            Valider {draftValue}
          </button>
        </section>
      )}
    </div>
  );
}
