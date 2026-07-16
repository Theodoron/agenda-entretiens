import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api";
import { CancellationDialog } from "./components/CancellationDialog";
import { DateTimePicker } from "./components/DateTimePicker";
import { ReservationDialog } from "./components/ReservationDialog";
import "./styles.css";

type Role = "STUDENT" | "ADVISOR" | "ADMIN";
type User = {
  firstName: string;
  lastName: string;
  email: string;
  roles: { role: { code: Role } }[];
};
type Slot = {
  id: string;
  startsAt: string;
  mode: string;
  advisor: { userId: string; user: { firstName: string; lastName: string } };
};
type Reason = { id: string; label: string };
type Appointment = {
  id: string;
  studentId: string;
  advisorId: string;
  status: string;
  availability: { startsAt: string; mode: string };
  request: { subject: string };
  advisor: { user: { firstName: string; lastName: string } };
  student: {
    universityId: string;
    user: { firstName: string; lastName: string };
  };
  history?: { toStatus: string; reason?: string | null; createdAt: string }[];
};
type AdvisorSlot = {
  id: string;
  startsAt: string;
  endsAt: string;
  mode: string;
  status: string;
  appointment: null | {
    id: string;
    status: string;
    historyCount: number;
    request: { subject: string };
    student: {
      universityId: string;
      user: { firstName: string; lastName: string };
    };
  };
};

const capitalizeDatePart = (value: string) =>
  value ? value.charAt(0).toLocaleUpperCase("fr-FR") + value.slice(1) : value;
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
  })
    .formatToParts(new Date(value))
    .map((part) =>
      part.type === "weekday" || part.type === "month"
        ? capitalizeDatePart(part.value)
        : part.value,
    )
    .join("");
const active = (status: string) => ["BOOKED", "CONFIRMED"].includes(status);
const isUpcomingAppointment = (appointment: Appointment, now = new Date()) =>
  active(appointment.status) &&
  new Date(appointment.availability.startsAt) >= now;
const formatMode = (mode: string) =>
  ({ IN_PERSON: "Présentiel", PHONE: "Téléphone", VIDEO: "Visioconférence" })[
    mode
  ] ?? mode;
const formatStatus = (status: string) =>
  ({
    BOOKED: "Confirmé",
    CONFIRMED: "Confirmé",
    COMPLETED: "Réalisé",
    CANCELLED_BY_STUDENT: "Annulé par l’étudiant",
    CANCELLED_BY_ADVISOR: "Annulé par le conseiller",
    CANCELLED_BY_ADMIN: "Annulé par l’administrateur",
    RESCHEDULED: "Reporté",
    STUDENT_NO_SHOW: "Étudiant absent",
    ADVISOR_NO_SHOW: "Conseiller absent",
    AVAILABLE: "Disponible",
    HELD: "Réservation en cours",
    CANCELLED: "Annulé",
    ACTIVE: "Actif",
    DISABLED: "Désactivé",
    PENDING: "En attente d’analyse",
    CLEAN: "Analysé et sûr",
    INFECTED: "Fichier bloqué",
    FAILED: "Échec de l’analyse",
  })[status] ?? status;

type Communication = {
  id: string;
  authorId: string;
  author?: { firstName: string; lastName: string };
  authorRole?: "STUDENT" | "ADVISOR" | "ADMIN";
  content: string;
  createdAt: string;
};
type DocumentItem = {
  id: string;
  originalName: string;
  sizeBytes: number;
  scanStatus: "PENDING" | "CLEAN" | "INFECTED" | "FAILED";
  studentDownloadedAt?: string | null;
  advisorDownloadedAt?: string | null;
};

function CommunicationsHub({
  role,
  appointmentId,
  onClose,
}: {
  role: "student" | "advisor";
  appointmentId: string;
  onClose: () => void;
}) {
  const [currentId, setCurrentId] = useState(appointmentId);
  const [details, setDetails] = useState<Appointment>();
  const [history, setHistory] = useState<Appointment[]>([]);
  const [messages, setMessages] = useState<Communication[]>([]),
    [summaries, setSummaries] = useState<Communication[]>([]),
    [notes, setNotes] = useState<Communication[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]),
    [file, setFile] = useState<File>();
  const [message, setMessage] = useState(""),
    [summary, setSummary] = useState(""),
    [note, setNote] = useState(""),
    [error, setError] = useState("");
  async function reload(id = currentId) {
    if (!id) return;
    try {
      const common = Promise.all([
        api<Appointment>(`/appointments/${id}`),
        api<Communication[]>(`/appointments/${id}/messages`),
        api<Communication[]>(`/appointments/${id}/shared-contents`),
        api<DocumentItem[]>(`/appointments/${id}/documents`),
      ]);
      const [nextDetails, nextMessages, nextSummaries, nextDocuments] =
        await common;
      setDetails(nextDetails);
      setHistory(
        role === "advisor"
          ? await api<Appointment[]>(
              `/appointments/student/${nextDetails.studentId}/history`,
            )
          : [],
      );
      setMessages(nextMessages);
      setSummaries(nextSummaries);
      setDocuments(nextDocuments);
      setNotes(
        role === "advisor"
          ? await api<Communication[]>(`/appointments/${id}/internal-notes`)
          : [],
      );
    } catch (value) {
      setError((value as Error).message);
    }
  }
  useEffect(() => {
    setCurrentId(appointmentId);
  }, [appointmentId]);
  useEffect(() => {
    reload(currentId);
  }, [currentId]);
  async function send(
    event: React.FormEvent,
    kind: "messages" | "shared-contents" | "internal-notes",
    content: string,
    clear: () => void,
  ) {
    event.preventDefault();
    setError("");
    try {
      await api(`/appointments/${currentId}/${kind}`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      clear();
      await reload();
    } catch (value) {
      setError((value as Error).message);
    }
  }
  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setError("");
    const body = new FormData();
    body.append("file", file);
    const response = await fetch(
      `/api/v1/appointments/${currentId}/documents`,
      { method: "POST", credentials: "include", body },
    );
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.message ?? "Échec du chargement");
      return;
    }
    setFile(undefined);
    await reload();
  }
  async function removeDocument(item: DocumentItem) {
    if (!window.confirm(`Supprimer définitivement le document « ${item.originalName} » ?`)) return;
    setError("");
    try {
      await api(`/documents/${item.id}`, { method: "DELETE" });
      await reload();
    } catch (value) {
      setError((value as Error).message);
    }
  }
  async function downloadDocument(item: DocumentItem) {
    setError("");
    try {
      const response = await fetch(`/api/v1/documents/${item.id}/download`, {
        credentials: "include",
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message ?? "Échec du téléchargement");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = item.originalName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      await reload();
    } catch (value) {
      setError((value as Error).message);
    }
  }
  async function removeSummary(item: Communication) {
    if (!window.confirm("Supprimer définitivement cette synthèse partagée ?")) return;
    setError("");
    try {
      await api(`/appointments/${currentId}/shared-contents/${item.id}`, {
        method: "DELETE",
      });
      await reload();
    } catch (value) {
      setError((value as Error).message);
    }
  }
  async function removeMessage(item: Communication) {
    if (!window.confirm("Supprimer définitivement ce message partagé ?")) return;
    setError("");
    try {
      await api(`/appointments/${currentId}/messages/${item.id}`, {
        method: "DELETE",
      });
      await reload();
    } catch (value) {
      setError((value as Error).message);
    }
  }
  return (
    <section className="communications">
      <div className="sheet-heading">
        <div>
          <p className="eyebrow">Fiche entretien</p>
          <h2>Conversation, synthèse et documents</h2>
        </div>
        <div className="sheet-actions print-actions">
          <button className="compact" onClick={() => window.print()}>
            Imprimer la fiche
          </button>
          <button className="secondary compact" onClick={onClose}>
            Fermer la fiche
          </button>
        </div>
      </div>
      {details && (
        <dl className="sheet-summary">
          {role === "advisor" ? (
            <>
              <div>
                <dt>Étudiant</dt>
                <dd>
                  {details.student.user.lastName}{" "}
                  {details.student.user.firstName}
                </dd>
              </div>
              <div>
                <dt>Numéro étudiant</dt>
                <dd>{details.student.universityId}</dd>
              </div>
              <div>
                <dt>Objet</dt>
                <dd>{details.request.subject}</dd>
              </div>
            </>
          ) : (
            <div>
              <dt>Conseiller</dt>
              <dd>
                {details.advisor.user.firstName} {details.advisor.user.lastName}
              </dd>
            </div>
          )}
          <div>
            <dt>Date et heure</dt>
            <dd>{formatDate(details.availability.startsAt)}</dd>
          </div>
        </dl>
      )}
      {role === "advisor" && history.length > 0 && (
        <details className="history">
          <summary>
            {history.length} entretien{history.length > 1 ? "s" : ""} avec cet
            étudiant
          </summary>
          <ul>
            {history.map((item) => (
              <li key={item.id}>
                <button
                  className="link-button"
                  onClick={() => setCurrentId(item.id)}
                >
                  {formatDate(item.availability.startsAt)} —{" "}
                  {item.request.subject}
                </button>
                {(() => {
                  const cancellations = item.history?.filter((entry) => entry.toStatus.startsWith("CANCELLED")) ?? [];
                  const cancellation = cancellations[cancellations.length - 1];
                  return cancellation ? (
                    <span className="history-cancellation">
                      <strong>{formatStatus(cancellation.toStatus)}</strong>
                      {cancellation.reason && <> — Motif : {cancellation.reason}</>}
                    </span>
                  ) : null;
                })()}
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="communication-grid">
        <div>
          <h3>Messages partagés</h3>
          <div className="thread">
            {messages.length ? (
              messages.map((item) => (
                <article
                  className={`message-${(item.authorRole ?? "ADMIN").toLowerCase()}`}
                  key={item.id}
                >
                  <p>
                    <strong>
                      {item.author
                        ? `${item.author.firstName} ${item.author.lastName}`
                        : "Utilisateur"}{" "}
                      :
                    </strong>{" "}
                    {item.content}
                  </p>
                  <small>
                    {new Date(item.createdAt).toLocaleString("fr-FR")}
                  </small>
                  {((role === "advisor" &&
                    item.authorRole === "ADVISOR" &&
                    item.authorId === details?.advisorId) ||
                    (role === "student" &&
                      item.authorRole === "STUDENT" &&
                      item.authorId === details?.studentId)) && (
                      <div className="message-actions no-print">
                        <button
                          className="danger compact message-delete"
                          onClick={() => removeMessage(item)}
                          type="button"
                        >
                          Supprimer
                        </button>
                      </div>
                    )}
                </article>
              ))
            ) : (
              <p className="empty">Aucun message.</p>
            )}
          </div>
          <form
            onSubmit={(event) =>
              send(event, "messages", message, () => setMessage(""))
            }
          >
            <label>
              Nouveau message
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                required
                maxLength={4000}
              />
            </label>
            <button>Envoyer</button>
          </form>
        </div>
        <div>
          <h3>Synthèses partagées</h3>
          {summaries.length ? (
            summaries.map((item) => (
              <article className="shared-note" key={item.id}>
                <p>{item.content}</p>
                {role === "advisor" && item.authorId === details?.advisorId && (
                  <button
                    className="danger compact no-print"
                    onClick={() => removeSummary(item)}
                  >
                    Supprimer
                  </button>
                )}
              </article>
            ))
          ) : (
            <p className="empty">Aucune synthèse.</p>
          )}
          {role === "advisor" && (
            <form
              onSubmit={(event) =>
                send(event, "shared-contents", summary, () => setSummary(""))
              }
            >
              <label>
                Publier une synthèse
                <textarea
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  required
                  maxLength={4000}
                />
              </label>
              <button>Partager avec l’étudiant</button>
            </form>
          )}
        </div>
      </div>
      <div className="documents-panel">
        <h3>Documents privés</h3>
        <p className="hint">
          PDF, PNG, JPEG ou texte, 10 Mo maximum. Un document reste en
          quarantaine jusqu’à la fin de son analyse.
        </p>
        {documents.length ? (
          <ul className="document-list">
            {documents.map((item) => (
              <li key={item.id}>
                <span>
                  <strong>{item.originalName}</strong>
                  <small>
                    {Math.ceil(item.sizeBytes / 1024)} Ko ·{" "}
                    {formatStatus(item.scanStatus)}
                  </small>
                  {item.advisorDownloadedAt && (
                    <small>Consulté par le conseiller le {formatDate(item.advisorDownloadedAt)}</small>
                  )}
                  {item.studentDownloadedAt && (
                    <small>Consulté par l’étudiant(e) le {formatDate(item.studentDownloadedAt)}</small>
                  )}
                </span>
                {item.scanStatus === "CLEAN" && (
                  <button
                    className="link-button"
                    onClick={() => downloadDocument(item)}
                  >
                    Télécharger
                  </button>
                )}
                {role === "advisor" && (
                  <button
                    className="danger compact"
                    onClick={() => removeDocument(item)}
                  >
                    Supprimer
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Aucun document disponible.</p>
        )}
        <form onSubmit={upload}>
          <label>
            Ajouter un document
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.txt"
              onChange={(event) => setFile(event.target.files?.[0])}
              required
            />
          </label>
          <button>Charger en quarantaine</button>
        </form>
      </div>
      {role === "advisor" && (
        <details className="internal">
          <summary>Notes internes — invisibles à l’étudiant</summary>
          {notes.map((item) => (
            <article className="internal-note" key={item.id}>
              {item.content}
            </article>
          ))}
          <form
            onSubmit={(event) =>
              send(event, "internal-notes", note, () => setNote(""))
            }
          >
            <label>
              Nouvelle note interne
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                required
                maxLength={4000}
              />
            </label>
            <button>Ajouter la note privée</button>
          </form>
        </details>
      )}
    </section>
  );
}

function Profile({
  role,
  onClose,
}: {
  role: "student" | "advisor";
  onClose: () => void;
}) {
  const [data, setData] = useState<any>(),
    [title, setTitle] = useState(""),
    [notice, setNotice] = useState(""),
    [subscription, setSubscription] = useState<{ url: string }>();
  useEffect(() => {
    Promise.all([
      api<any>(`/profiles/${role}/me`),
      api<{ url: string }>("/calendar/subscription"),
    ])
      .then(([value, calendar]) => {
        setData(value);
        setTitle(value.title ?? "");
        setSubscription(calendar);
      })
      .catch((error) => setNotice((error as Error).message));
  }, [role]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      await api(`/profiles/${role}/me`, {
        method: "PATCH",
        body: JSON.stringify(role === "advisor" ? { title } : {}),
      });
      setNotice("Profil enregistré.");
    } catch (error) {
      setNotice((error as Error).message);
    }
  }
  const calendarUrl = subscription
    ? new URL(subscription.url, window.location.origin).href
    : "";
  async function copyCalendarUrl() {
    try {
      await navigator.clipboard.writeText(calendarUrl);
      setNotice("Lien d’abonnement copié.");
    } catch {
      setNotice("La copie automatique a échoué. Sélectionnez le lien ci-dessous.");
    }
  }
  async function rotateCalendarUrl() {
    if (
      !window.confirm(
        "Régénérer le lien ? L’ancien abonnement cessera de fonctionner.",
      )
    )
      return;
    try {
      const calendar = await api<{ url: string }>(
        "/calendar/subscription/rotate",
        { method: "POST" },
      );
      setSubscription(calendar);
      setNotice("Nouveau lien créé. Il faut remplacer l’ancien dans Outlook.");
    } catch (error) {
      setNotice((error as Error).message);
    }
  }
  return (
    <section className="profile-page">
      <div className="sheet-heading">
        <div>
          <p className="eyebrow">Compte</p>
          <h1>Mon profil</h1>
        </div>
        <button className="secondary compact" onClick={onClose}>
          Retour au tableau de bord
        </button>
      </div>
      {data && (
        <>
          <form onSubmit={save}>
            <p>
              <strong>
                {data.user.firstName} {data.user.lastName}
              </strong>
              <br />
              {data.user.email}
            </p>
            {role === "student" ? (
              <p>
                Identifiant : {data.universityId}
                <br />
                Formation : {data.degree?.name ?? "Non renseignée"}
                <br />
                Composante : {data.component?.name ?? "Non renseignée"}
              </p>
            ) : (
              <label>
                Fonction
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={120}
                />
              </label>
            )}
            <button>Enregistrer</button>
          </form>
          {subscription && (
            <section
              aria-labelledby="calendar-subscription-title"
              className="calendar-subscription"
            >
              <p className="eyebrow">Outlook et calendriers externes</p>
              <h2 id="calendar-subscription-title">Mon abonnement calendrier</h2>
              <p>
                Dans Outlook, choisissez <strong>Ajouter un calendrier</strong>,
                puis <strong>S’abonner à partir du web</strong> et collez ce lien.
              </p>
              <label>
                Lien privé d’abonnement
                <input readOnly value={calendarUrl} />
              </label>
              <p className="calendar-warning">
                Ce lien donne accès aux informations de votre calendrier. Ne le
                transmettez pas. Vous pouvez le régénérer s’il a été partagé par
                erreur.
              </p>
              <div className="calendar-subscription-actions">
                <button onClick={copyCalendarUrl} type="button">
                  Copier le lien Outlook
                </button>
                <button
                  className="secondary"
                  onClick={rotateCalendarUrl}
                  type="button"
                >
                  Régénérer le lien
                </button>
              </div>
            </section>
          )}
          {notice && (
            <div className="success" role="status">
              {notice}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function StudentDashboard() {
  const [slots, setSlots] = useState<Slot[]>([]),
    [reasons, setReasons] = useState<Reason[]>([]),
    [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selected, setSelected] = useState(""),
    [advisorFilter, setAdvisorFilter] = useState(""),
    [reasonIds, setReasonIds] = useState<string[]>([]),
    [subject, setSubject] = useState(""),
    [description, setDescription] = useState("");
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [sheetId, setSheetId] = useState(""),
    [cancellingId, setCancellingId] = useState("");
  const reload = () =>
    Promise.all([
      api<Slot[]>("/availabilities"),
      api<Reason[]>("/references/reasons"),
      api<Appointment[]>("/appointments"),
    ]).then(([s, r, a]) => {
      setSlots(s);
      setReasons(r);
      setAppointments(a);
    });
  useEffect(() => {
    reload().catch((value) => setError(value.message));
  }, []);
  function choose(id: string) {
    setError("");
    setSelected(id);
  }
  async function book() {
    setError("");
    if (reasonIds.length === 0) {
      setError("Veuillez sélectionner au moins un motif.");
      return false;
    }
    try {
      await api("/appointments", {
        method: "POST",
        body: JSON.stringify({
          availabilityId: selected,
          reasonIds,
          subject,
          description,
        }),
      });
      setMessage("Votre rendez-vous est réservé.");
      setSelected("");
      setReasonIds([]);
      setSubject("");
      setDescription("");
      await reload();
      return true;
    } catch (value) {
      setError((value as Error).message);
      await reload();
      return false;
    }
  }
  async function cancel(id: string, reason: string) {
    try {
      await api(`/appointments/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "CANCELLED_BY_STUDENT", reason }),
      });
      setMessage("Rendez-vous annulé.");
      await reload();
      return true;
    } catch (value) {
      setError((value as Error).message);
      return false;
    }
  }
  const advisors = Array.from(
    new Map(slots.map((slot) => [slot.advisor.userId, slot.advisor])).values(),
  ).sort((a, b) =>
    `${a.user.lastName} ${a.user.firstName}`.localeCompare(
      `${b.user.lastName} ${b.user.firstName}`,
      "fr",
    ),
  );
  const filteredSlots = advisorFilter
    ? slots.filter((slot) => slot.advisor.userId === advisorFilter)
    : slots;
  const selectedSlot = slots.find((slot) => slot.id === selected);
  const upcomingAppointments = appointments.filter((item) =>
    isUpcomingAppointment(item),
  );
  const historicalAppointments = appointments.filter(
    (item) => !isUpcomingAppointment(item),
  );
  function appointmentTable(items: Appointment[], emptyMessage: string) {
    if (!items.length) return <p className="empty">{emptyMessage}</p>;
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date et heure</th>
              <th>Conseiller</th>
              <th>Objet</th>
              <th>Modalité</th>
              <th>Statut</th>
              <th><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="table-date">{formatDate(item.availability.startsAt)}</td>
                <td>{item.advisor.user.firstName} {item.advisor.user.lastName}</td>
                <td>{item.request.subject}</td>
                <td>{formatMode(item.availability.mode)}</td>
                <td>
                  <span className={["CANCELLED_BY_ADVISOR", "CANCELLED_BY_ADMIN"].includes(item.status) ? "status cancelled-by-advisor" : "status"}>
                    {formatStatus(item.status)}
                  </span>
                </td>
                <td className="table-actions">
                  {!item.status.startsWith("CANCELLED") && (
                    <button className="compact" onClick={() => setSheetId(item.id)}>
                      Fiche entretien
                    </button>
                  )}
                  {active(item.status) && (
                    <button className="secondary compact" onClick={() => setCancellingId(item.id)}>
                      Annuler
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="dashboard">
      <section>
        <p className="eyebrow">Mes rendez-vous</p>
        <h1 className="student-dashboard-title">Mon tableau de bord</h1>
        <h2 className="student-upcoming-title">À venir</h2>
        {appointmentTable(upcomingAppointments, "Aucun rendez-vous à venir.")}
      </section>
      {sheetId && (
        <CommunicationsHub
          role="student"
          appointmentId={sheetId}
          onClose={() => setSheetId("")}
        />
      )}
      {cancellingId && (
        <CancellationDialog
          onClose={() => setCancellingId("")}
          onConfirm={(reason) => cancel(cancellingId, reason)}
        />
      )}
      {selectedSlot && (
        <ReservationDialog
          description={description}
          error={error}
          formatDate={formatDate}
          formatMode={formatMode}
          onClose={() => setSelected("")}
          onDescriptionChange={setDescription}
          onReasonIdsChange={setReasonIds}
          onSubjectChange={setSubject}
          onSubmit={book}
          reasonIds={reasonIds}
          reasons={reasons}
          slot={selectedSlot}
          subject={subject}
        />
      )}
      <section>
        <h2>Mobiliser un entretien</h2>
        {message && (
          <div className="success" role="status">
            {message}
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {slots.length === 0 ? (
          <p className="empty">Aucun créneau disponible.</p>
        ) : (
          <div className="slot-picker">
            <label>
              Filtrer par conseiller
              <select
                value={advisorFilter}
                onChange={(event) => {
                  setAdvisorFilter(event.target.value);
                  setSelected("");
                }}
              >
                <option value="">Tous les conseillers</option>
                {advisors.map((advisor) => (
                  <option key={advisor.userId} value={advisor.userId}>
                    {advisor.user.firstName} {advisor.user.lastName}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>Choisissez un créneau</legend>
              {filteredSlots.length === 0 ? (
                <p className="empty">
                  Aucun créneau disponible pour ce conseiller.
                </p>
              ) : (
                filteredSlots.map((slot) => (
                  <label className="slot" key={slot.id}>
                    <input
                      type="radio"
                      name="slot"
                      checked={selected === slot.id}
                      onChange={() => choose(slot.id)}
                    />
                    <span>
                      <strong>{formatDate(slot.startsAt)}</strong>
                      <small>
                        {slot.advisor.user.firstName}{" "}
                        {slot.advisor.user.lastName}
                      </small>
                      <small>Modalité : {formatMode(slot.mode)}</small>
                    </span>
                  </label>
                ))
              )}
            </fieldset>
          </div>
        )}
      </section>
      <section>
        <h2>Historique</h2>
        {appointmentTable(historicalAppointments, "Aucun rendez-vous dans l’historique.")}
      </section>
    </div>
  );
}

function AdvisorDashboard() {
  const [schedule, setSchedule] = useState<AdvisorSlot[]>([]),
    [startsAt, setStartsAt] = useState(""),
    [endsAt, setEndsAt] = useState(""),
    [duration, setDuration] = useState(45),
    [mode, setMode] = useState("IN_PERSON"),
    [videoUrl, setVideoUrl] = useState(""),
    [notice, setNotice] = useState(""),
    [sheetId, setSheetId] = useState(""),
    [cancellingId, setCancellingId] = useState("");
  const reload = () =>
    api<AdvisorSlot[]>("/availabilities/advisor/mine").then(setSchedule);
  useEffect(() => {
    reload();
  }, []);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    setNotice("");
    if (!startsAt || !endsAt) {
      setNotice("Sélectionnez le début et la fin de la plage.");
      return;
    }
    try {
      const body = {
        startsAt: new Date(startsAt).toISOString(),
        durationMinutes: duration,
        mode,
        ...(videoUrl ? { videoUrl } : {}),
        endsAt: new Date(endsAt).toISOString(),
      };
      const result = await api<{ count: number }>("/availabilities/batch", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setNotice(
        `${result.count} créneau${result.count > 1 ? "x" : ""} publié${result.count > 1 ? "s" : ""}.`,
      );
      setStartsAt("");
      setEndsAt("");
      await reload();
    } catch (value) {
      setNotice((value as Error).message);
    }
  }
  async function changeStatus(id: string, status: string, reason?: string) {
    try {
      await api(`/appointments/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, ...(reason ? { reason } : {}) }),
      });
      await reload();
      return true;
    } catch (value) {
      setNotice((value as Error).message);
      return false;
    }
  }
  async function cancelSlot(id: string) {
    if (!window.confirm("Annuler ce créneau libre ?")) return;
    try {
      await api(`/availabilities/${id}`, { method: "DELETE" });
      setNotice("Créneau annulé.");
      await reload();
    } catch (value) {
      setNotice((value as Error).message);
    }
  }
  return (
    <div className="dashboard">
      <section>
        <p className="eyebrow">Agenda conseiller</p>
        <h1 className="agenda-title">Mes entretiens</h1>
        <h2 className="advisor-upcoming-title">À venir</h2>
        {schedule.some((slot) => slot.appointment) ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nom et prénom</th>
                  <th>Numéro étudiant</th>
                  <th>Date et heure</th>
                  <th>Objet</th>
                  <th>Statut</th>
                  <th>Fréquentation</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {schedule
                  .filter((slot) => slot.appointment)
                  .map((slot) => {
                    const item = slot.appointment;
                    return (
                      <tr
                        key={slot.id}
                        className={!item ? "free-slot" : undefined}
                      >
                        <td>
                          {item
                            ? `${item.student.user.lastName} ${item.student.user.firstName}`
                            : "—"}
                        </td>
                        <td>{item?.student.universityId ?? "—"}</td>
                        <td className="table-date">{formatDate(slot.startsAt)}</td>
                        <td>{item?.request.subject ?? "Créneau disponible"}</td>
                        <td>
                          <span className="status">
                            {formatStatus(item?.status ?? "AVAILABLE")}
                          </span>
                        </td>
                        <td className="advisor-history-count">
                          {item && (
                            <>
                              {item.historyCount} ent.
                            </>
                          )}
                        </td>
                        <td className="table-actions advisor-table-actions">
                          {item && (
                            <div className="advisor-action-buttons">
                              <button
                                className="compact"
                                onClick={() => setSheetId(item.id)}
                              >
                                Fiche entretien
                              </button>
                              {["BOOKED", "CONFIRMED"].includes(item.status) && (
                                <button
                                  className="compact completed-button"
                                  onClick={() =>
                                    changeStatus(item.id, "COMPLETED")
                                  }
                                >
                                  Réalisé
                                </button>
                              )}
                              {active(item.status) && (
                                <button
                                  className="secondary compact"
                                  onClick={() => setCancellingId(item.id)}
                                >
                                  Annuler
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">Aucun entretien à venir.</p>
        )}
        {sheetId && (
          <CommunicationsHub
            role="advisor"
            appointmentId={sheetId}
            onClose={() => setSheetId("")}
          />
        )}
        {cancellingId && (
          <CancellationDialog
            onClose={() => setCancellingId("")}
            onConfirm={(reason) => changeStatus(cancellingId, "CANCELLED_BY_ADVISOR", reason)}
          />
        )}
        <h2 className="subsection-title">Créneaux libres</h2>
        {schedule.some((slot) => !slot.appointment) ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date et heure</th>
                  <th>Fin</th>
                  <th>Modalité</th>
                  <th>Statut</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {schedule
                  .filter((slot) => !slot.appointment)
                  .map((slot) => (
                    <tr className="free-slot" key={slot.id}>
                      <td className="table-date">{formatDate(slot.startsAt)}</td>
                      <td>
                        {new Intl.DateTimeFormat("fr-FR", {
                          timeStyle: "short",
                        }).format(new Date(slot.endsAt))}
                      </td>
                      <td>{formatMode(slot.mode)}</td>
                      <td>
                        <span className="status">
                          {formatStatus("AVAILABLE")}
                        </span>
                      </td>
                      <td>
                        <button
                          className="secondary compact"
                          onClick={() => cancelSlot(slot.id)}
                        >
                          Annuler le créneau
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">Aucun créneau libre.</p>
        )}
      </section>
      <section>
        <h2>Organiser une plage d’entretiens</h2>
        {notice && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}
        <form onSubmit={create}>
          <div className="date-time-row">
            <DateTimePicker
              label="Début de la plage"
              onChange={(value) => {
                setStartsAt(value);
                if (endsAt && endsAt < value) setEndsAt(value);
              }}
              value={startsAt}
            />
            <DateTimePicker
              label="Fin de la plage"
              min={startsAt}
              onChange={setEndsAt}
              value={endsAt}
            />
          </div>
          <label>
            Durée de chaque entretien
            <select
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
            >
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>1 heure</option>
            </select>
          </label>
          <label>
            Modalité
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value)}
            >
              <option value="IN_PERSON">Présentiel</option>
              <option value="PHONE">Téléphone</option>
              <option value="VIDEO">Visioconférence</option>
            </select>
          </label>
          {mode === "VIDEO" && (
            <label>
              Lien de visioconférence
              <input
                type="url"
                value={videoUrl}
                onChange={(event) => setVideoUrl(event.target.value)}
                required
              />
            </label>
          )}
          <button>Publier</button>
        </form>
      </section>
    </div>
  );
}

type AdminUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: "ACTIVE" | "DISABLED";
  roles: { role: { code: Role } }[];
};
type PendingDocument = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploaderId: string;
  createdAt: string;
  appointment: {
    id: string;
    studentId: string;
    advisorId: string;
    availability: { startsAt: string };
    student: { user: { firstName: string; lastName: string } };
    advisor: { user: { firstName: string; lastName: string } };
  };
};
function AdminDashboard() {
  const [overview, setOverview] = useState<{
    users: number;
    appointments: number;
    pendingDocuments: number;
    failedNotifications: number;
  }>();
  const [users, setUsers] = useState<AdminUser[]>([]),
    [pendingDocuments, setPendingDocuments] = useState<PendingDocument[]>([]),
    [error, setError] = useState("");
  const reload = () =>
    Promise.all([
      api<any>("/admin/overview"),
      api<AdminUser[]>("/admin/users"),
      api<PendingDocument[]>("/admin/documents/pending"),
    ]).then(([stats, items, documents]) => {
      setOverview(stats);
      setUsers(items);
      setPendingDocuments(documents);
    });
  useEffect(() => {
    reload().catch((value) => setError(value.message));
  }, []);
  async function toggle(user: AdminUser) {
    try {
      await api(`/admin/users/${user.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: user.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
        }),
      });
      await reload();
    } catch (value) {
      setError((value as Error).message);
    }
  }
  async function reviewDocument(document: PendingDocument, status: "CLEAN" | "FAILED") {
    const action = status === "CLEAN" ? "déclarer ce document sûr" : "rejeter ce document";
    if (!window.confirm(`Voulez-vous ${action} ?`)) return;
    setError("");
    try {
      await api(`/documents/${document.id}/scan-result`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await reload();
    } catch (value) {
      setError((value as Error).message);
    }
  }
  return (
    <div className="dashboard">
      <section>
        <p className="eyebrow">Administration</p>
        <h1>Pilotage du service</h1>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {overview && (
          <div className="cards">
            <article className="card">
              <strong>{overview.users}</strong>
              <p>utilisateurs</p>
            </article>
            <article className="card">
              <strong>{overview.appointments}</strong>
              <p>rendez-vous</p>
            </article>
            <article className="card">
              <strong>{overview.pendingDocuments}</strong>
              <p>documents en quarantaine</p>
            </article>
            <article className="card">
              <strong>{overview.failedNotifications}</strong>
              <p>notifications en échec</p>
            </article>
          </div>
        )}
      </section>
      <section>
        <h2>Documents à valider</h2>
        <p className="notice">
          Examinez uniquement des fichiers attendus. Un document déclaré sûr devient téléchargeable par les participants à l’entretien.
        </p>
        {pendingDocuments.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Entretien</th>
                  <th>Déposé par</th>
                  <th>Date du dépôt</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {pendingDocuments.map((document) => {
                  const appointment = document.appointment;
                  const uploader = document.uploaderId === appointment.studentId
                    ? `${appointment.student.user.firstName} ${appointment.student.user.lastName}`
                    : document.uploaderId === appointment.advisorId
                      ? `${appointment.advisor.user.firstName} ${appointment.advisor.user.lastName}`
                      : "Administrateur";
                  return (
                    <tr key={document.id}>
                      <td>
                        <strong>{document.originalName}</strong><br />
                        <small>{Math.ceil(document.sizeBytes / 1024)} Ko · {document.mimeType}</small>
                      </td>
                      <td>
                        {appointment.student.user.firstName} {appointment.student.user.lastName}<br />
                        <small className="table-date">{formatDate(appointment.availability.startsAt)}</small>
                      </td>
                      <td>{uploader}</td>
                      <td className="table-date">{formatDate(document.createdAt)}</td>
                      <td className="table-actions">
                        <a className="download compact" href={`/api/v1/documents/${document.id}/download`}>
                          Examiner
                        </a>
                        <button className="compact" onClick={() => reviewDocument(document, "CLEAN")}>
                          Déclarer sûr
                        </button>
                        <button className="secondary compact" onClick={() => reviewDocument(document, "FAILED")}>
                          Rejeter
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">Aucun document en attente de validation.</p>
        )}
      </section>
      <section>
        <h2>Comptes</h2>
        <div className="admin-users">
          {users.map((item) => (
            <article className="card" key={item.id}>
              <h3>
                {item.firstName} {item.lastName}
              </h3>
              <p>{item.email}</p>
              <p>
                {item.roles.map((role) => role.role.code).join(", ")} ·{" "}
                {formatStatus(item.status)}
              </p>
              <button className="secondary" onClick={() => toggle(item)}>
                {item.status === "ACTIVE" ? "Désactiver" : "Réactiver"}
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

type StatItem = { label: string; count: number };
type Statistics = {
  totals: {
    appointments: number;
    students: number;
    repeatStudents: number;
    averagePerStudent: number;
  };
  monthly: StatItem[];
  statuses: StatItem[];
  reasons: StatItem[];
  reasonByMonth: { month: string; reasons: Record<string, number> }[];
  origins: {
    components: StatItem[];
    degrees: StatItem[];
    academicYears: StatItem[];
  };
  repeatByComponent: {
    label: string;
    students: number;
    appointments: number;
    repeated: number;
    average: number;
  }[];
  occupancy: {
    totalSlots: number;
    bookedSlots: number;
    rate: number;
    monthly: { label: string; total: number; booked: number; rate: number }[];
  };
  accessDelay: { averageDays: number; medianDays: number };
  cancellations: { cancelled: number; noShows: number; rate: number };
  demand: { weekdays: StatItem[]; hours: StatItem[] };
  repeatReasons: StatItem[];
  privacy: {
    smallCohortThreshold: number;
    aggregatedOnly: boolean;
    scope: "GLOBAL" | "ADVISOR";
  };
};
const monthLabel = (month: string) =>
  capitalizeDatePart(
    new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric" }).format(
      new Date(`${month}-01T12:00:00`),
    ),
  );
function StatTable({
  title,
  items,
  translate = false,
}: {
  title: string;
  items: StatItem[];
  translate?: boolean;
}) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <section className="stat-block">
      <h2>{title}</h2>
      {items.length ? (
        <div className="stat-bars">
          {items.map((item) => (
            <div className="stat-bar" key={item.label}>
              <span>{translate ? formatStatus(item.label) : item.label}</span>
              <div>
                <i style={{ width: `${(item.count / max) * 100}%` }} />
              </div>
              <strong>{item.count}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty">Aucune donnée.</p>
      )}
    </section>
  );
}
function StatisticsDashboard({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<Statistics>(),
    [error, setError] = useState("");
  useEffect(() => {
    api<Statistics>("/statistics/overview")
      .then(setData)
      .catch((value) => setError(value.message));
  }, []);
  const max = Math.max(1, ...(data?.monthly.map((item) => item.count) ?? [1]));
  const points =
    data?.monthly
      .map(
        (item, index, list) =>
          `${list.length === 1 ? 50 : (index / (list.length - 1)) * 100},${100 - (item.count / max) * 90}`,
      )
      .join(" ") ?? "";
  const allReasons = Array.from(
    new Set(
      data?.reasonByMonth.flatMap((item) => Object.keys(item.reasons)) ?? [],
    ),
  );
  return (
    <div className="dashboard statistics-page">
      <section>
        <div className="sheet-heading">
          <div>
            <p className="eyebrow">Pilotage</p>
            <h1>Statistiques des entretiens</h1>
          </div>
          <button className="secondary compact" onClick={onClose}>
            Retour au tableau de bord
          </button>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {data && (
          <>
            <div className="cards stat-cards">
              <article className="card">
                <strong>{data.totals.appointments}</strong>
                <p>entretiens</p>
              </article>
              <article className="card">
                <strong>{data.totals.students}</strong>
                <p>étudiants accompagnés</p>
              </article>
              <article className="card">
                <strong>{data.totals.averagePerStudent.toFixed(2)}</strong>
                <p>entretiens par étudiant en moyenne</p>
              </article>
              <article className="card">
                <strong>{data.totals.repeatStudents}</strong>
                <p>étudiants avec plusieurs entretiens</p>
              </article>
              <article className="card">
                <strong>{(data.occupancy.rate * 100).toFixed(1)} %</strong>
                <p>taux d’occupation des créneaux</p>
              </article>
              <article className="card">
                <strong>{data.accessDelay.medianDays.toFixed(1)} j</strong>
                <p>délai médian d’accès à un entretien</p>
              </article>
              <article className="card">
                <strong>{(data.cancellations.rate * 100).toFixed(1)} %</strong>
                <p>annulations, reports ou absences</p>
              </article>
            </div>
            <p className="hint">
              Périmètre : {data.privacy.scope === "ADVISOR" ? "vos entretiens" : "ensemble du service"}.
              Données agrégées uniquement ; les ventilations inférieures à {" "}
              {data.privacy.smallCohortThreshold} personnes sont masquées.
            </p>
          </>
        )}
      </section>
      {data && (
        <>
          <section className="stat-block">
            <h2>Fréquence des entretiens par mois</h2>
            {data.monthly.length ? (
              <>
                <svg
                  className="frequency-chart"
                  viewBox="0 0 100 105"
                  preserveAspectRatio="none"
                  role="img"
                  aria-label="Courbe du nombre d’entretiens par mois"
                >
                  <polyline
                    points={points}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                <div className="chart-labels">
                  {data.monthly.map((item) => (
                    <span key={item.label}>
                      {monthLabel(item.label)}
                      <strong>{item.count}</strong>
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="empty">Aucune donnée.</p>
            )}
          </section>
          <section className="stat-block">
            <h2>Occupation des créneaux par mois</h2>
            <div className="stat-bars">
              {data.occupancy.monthly.map((item) => (
                <div className="stat-bar" key={item.label}>
                  <span>{monthLabel(item.label)}</span>
                  <div>
                    <i style={{ width: `${item.rate * 100}%` }} />
                  </div>
                  <strong>
                    {(item.rate * 100).toFixed(0)} % ({item.booked}/{item.total}
                    )
                  </strong>
                </div>
              ))}
            </div>
          </section>
          <StatTable
            title="Demande par jour de la semaine"
            items={data.demand.weekdays}
          />
          <StatTable title="Demande par heure" items={data.demand.hours} />
          <StatTable
            title="Motifs associés à plusieurs entretiens"
            items={data.repeatReasons}
          />
          <StatTable
            title="Origine — composantes"
            items={data.origins.components}
          />
          <StatTable title="Origine — diplômes" items={data.origins.degrees} />
          <StatTable
            title="Origine — années d’études"
            items={data.origins.academicYears}
          />
          <StatTable title="Motifs des entretiens" items={data.reasons} />
          <section className="stat-block">
            <h2>Motifs par période</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mois</th>
                    {allReasons.map((reason) => (
                      <th key={reason}>{reason}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.reasonByMonth.map((item) => (
                    <tr key={item.month}>
                      <td>{monthLabel(item.month)}</td>
                      {allReasons.map((reason) => (
                        <td key={reason}>{item.reasons[reason] ?? 0}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="stat-block">
            <h2>Entretiens multiples par composante</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Composante</th>
                    <th>Étudiants</th>
                    <th>Entretiens</th>
                    <th>Étudiants avec plusieurs entretiens</th>
                    <th>Moyenne</th>
                  </tr>
                </thead>
                <tbody>
                  {data.repeatByComponent.map((item) => (
                    <tr key={item.label}>
                      <td>{item.label}</td>
                      <td>{item.students}</td>
                      <td>{item.appointments}</td>
                      <td>{item.repeated}</td>
                      <td>{item.average.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <StatTable
            title="Statuts des entretiens"
            items={data.statuses}
            translate
          />
        </>
      )}
    </div>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null),
    [email, setEmail] = useState("etudiant@example.test"),
    [password, setPassword] = useState("Demo-Agenda-2026!"),
    [error, setError] = useState(""),
    [showProfile, setShowProfile] = useState(false),
    [showStatistics, setShowStatistics] = useState(false);
  useEffect(() => {
    api<User>("/me")
      .then(setUser)
      .catch(() => {});
  }, []);
  async function login(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      setUser(
        await api<User>("/auth/dev/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        }),
      );
    } catch (value) {
      setError((value as Error).message);
    }
  }
  async function logout() {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
    setShowProfile(false);
    setShowStatistics(false);
  }
  const role = user?.roles[0]?.role.code;
  return (
    <>
      <a className="skip" href="#main">
        Aller au contenu
      </a>
      <header>
        <div className="brand">CIDO</div>
        <span>Centre d’Information de Documentation et d’Orientation</span>
        {user && (
          <div className="header-actions">
            {role !== "STUDENT" && (
              <button
                className="header-button"
                onClick={() => {
                  setShowStatistics(true);
                  setShowProfile(false);
                }}
              >
                Statistiques
              </button>
            )}
            {role !== "ADMIN" && (
              <button
                className="header-button"
                onClick={() => {
                  setShowProfile(true);
                  setShowStatistics(false);
                }}
              >
                Mon profil
              </button>
            )}
            <button className="logout" onClick={logout}>
              Se déconnecter
            </button>
          </div>
        )}
      </header>
      <main id="main">
        {user && showStatistics && role !== "STUDENT" ? (
          <StatisticsDashboard onClose={() => setShowStatistics(false)} />
        ) : user && showProfile && role !== "ADMIN" ? (
          <Profile
            role={role === "STUDENT" ? "student" : "advisor"}
            onClose={() => setShowProfile(false)}
          />
        ) : user ? (
          role === "STUDENT" ? (
            <StudentDashboard />
          ) : role === "ADVISOR" ? (
            <AdvisorDashboard />
          ) : (
            <AdminDashboard />
          )
        ) : (
          <section className="login" aria-labelledby="login-title">
            <div>
              <p className="eyebrow">Bienvenue</p>
              <h1 id="login-title">
                <span>Mobiliser un</span>
                <span>entretien individuel</span>
              </h1>
              <p className="lead">
                Réserver un créneau pour un entretien avec un(e) chargé(e)
                d’orientation et d’insertion professionnelle.
              </p>
            </div>
            <form onSubmit={login}>
              <h2>Connexion de développement</h2>
              <p className="hint">Cette connexion sera remplacée par le CAS.</p>
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              <label>
                Compte
                <select
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                >
                  <option value="etudiant@example.test">Étudiant</option>
                  <option value="conseiller@example.test">Conseiller</option>
                  <option value="admin@example.test">Administrateur</option>
                </select>
              </label>
              <label>
                Mot de passe
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </label>
              <button>Se connecter</button>
            </form>
          </section>
        )}
      </main>
      <footer>Besoin d’aide ? Contactez le service d’orientation.</footer>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
