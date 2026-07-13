# Conception fonctionnelle et technique

## 1. Reformulation

Le produit centralise la publication de disponibilités, la réservation sans conflit, le suivi confidentiel des entretiens, les échanges étudiant-professionnel, les notifications et le pilotage agrégé d'un service universitaire. Il doit être accessible, auditable, conforme au RGPD, exploitable sur une infrastructure européenne ou universitaire, et accueillir ultérieurement CAS et Microsoft 365 sans réécriture du métier.

## 2. Hypothèses et décisions

- Une université et un fuseau de référence (`Europe/Paris`) au MVP ; les dates sont stockées en UTC.
- Un utilisateur possède un ou plusieurs rôles. Le rôle actif est contrôlé côté serveur.
- L'adresse universitaire et l'identifiant universitaire sont uniques.
- L'annuaire étudiant reste éditable au MVP ; chaque champ indique sa source (`LOCAL`, puis `CAS` ou `SIS`) afin d'empêcher l'écrasement futur des données de référence.
- L'étudiant choisit un créneau ; le mode d'affectation est un paramètre. Le choix direct du conseiller est activé au MVP.
- Une réservation est immédiate puis peut être confirmée par le conseiller selon le paramétrage.
- Un verrou de cinq minutes protège le tunnel, mais seule une transaction PostgreSQL et une contrainte d'unicité garantissent l'absence de double réservation.
- Annulation étudiante autorisée jusqu'à 24 h avant par défaut. Les règles sont administrables.
- SMTP, S3 et CAS sont derrière des interfaces ; Mailpit et MinIO servent en développement.
- Les documents acceptés au MVP sont PDF, PNG, JPEG et DOCX, au plus 10 Mio, avec contrôle extension, signature MIME et antivirus à brancher avant production.
- Les durées exactes de conservation et le seuil de petits effectifs (5 par défaut) sont à valider par le DPO.

## 3. Points de vigilance

La réservation concurrente, les changements de séries déjà réservées, les transferts de conseiller, les liens de visioconférence contenus dans les courriels, la séparation notes internes/contenus partagés, les exports, la purge des sauvegardes et la réidentification par croisements statistiques demandent des tests et revues spécifiques. Le calendrier visuel dispose toujours d'une alternative en liste accessible.

## 4. Rôles et droits

| Capacité | Étudiant | Conseiller | Coordinateur/admin |
|---|---:|---:|---:|
| Lire/modifier son profil autorisé | oui | oui | oui |
| Créer/réserver/déplacer/annuler sa demande | oui | non | pour assistance auditée |
| Lire ses contenus partagés/messages | oui | rendez-vous affectés | selon périmètre |
| Lire/écrire des notes internes | non | rendez-vous affectés | permission explicite |
| Créer disponibilités et séries | non | les siennes | toutes |
| Changer le statut métier | limité | rendez-vous affectés | tous |
| Transférer un rendez-vous | non | si autorisé | oui |
| Administrer référentiels/règles/comptes | non | non | oui |
| Statistiques personnelles/globales | non | personnelles | globales agrégées |
| Audit/export/purge | non | non | permissions séparées |

Permissions atomiques : `profile:self:write`, `appointment:self:create`, `appointment:self:cancel`, `availability:self:write`, `appointment:assigned:read`, `appointment:assigned:manage`, `internal-note:assigned:write`, `shared-content:assigned:write`, `message:participant:write`, `file:participant:read`, `reference:manage`, `user:manage`, `stats:self:read`, `stats:global:read`, `export:run`, `audit:read`, `retention:manage`. Les contrôles d'appartenance complètent le RBAC (ABAC).

## 5. Parcours principaux

1. L'étudiant se connecte avec un compte de développement, complète son profil et décrit sa demande.
2. Il filtre les disponibilités, pose un verrou temporaire puis réserve ; la transaction crée rendez-vous, historique et notification/outbox.
3. Le conseiller publie un créneau unique ou génère une série avec exceptions, consulte ses rendez-vous et confirme.
4. Les participants échangent dans le fil. Le conseiller saisit séparément note interne et synthèse partagée.
5. Un document privé est téléversé, analysé puis partagé explicitement ; le téléchargement passe par une autorisation et une URL courte.
6. Le conseiller clôt l'entretien, renseigne les suites et propose un suivi. Le système qualifie premier entretien/suivi/autre conseiller.
7. L'administrateur maintient les référentiels et consulte uniquement des agrégats respectant le seuil de confidentialité.

## 6. Architecture fonctionnelle

Modules : identité et accès ; profils ; référentiels ; disponibilités/récurrence ; demandes et rendez-vous ; workflow/statuts ; messagerie ; documents ; notifications ; statistiques ; audit et conservation. Chaque module expose des cas d'usage, pas directement son stockage. Les événements métier alimentent une outbox transactionnelle, ensuite consommée par les tâches de courriel, rappel, audit secondaire et statistiques.

## 7. Architecture technique et comparaison

NestJS est retenu : architecture modulaire, injection de dépendances, validation et guards adaptés au RBAC, Swagger, BullMQ et écosystème TypeScript partagé avec React. FastAPI offre une excellente validation et simplicité Python mais ajoute un second outillage et moins de partage de types. Supabase accélère CRUD/auth/stockage, mais les règles métier transactionnelles, CAS et la portabilité d'hébergement nécessiteraient de nombreuses fonctions serveur et politiques RLS difficiles à auditer. Un backend Spring serait robuste mais plus lourd pour l'équipe supposée TypeScript.

Le frontend ne détient aucun secret ni donnée sensible persistante. L'API REST `/api/v1` utilise des DTO stricts. PostgreSQL porte les invariants. Redis porte verrous éphémères, limitation et file de tâches, jamais la vérité métier. Les fichiers restent dans un bucket privé. Un worker séparé exécute rappels et courriels. OpenTelemetry et logs JSON corrélés sont prévus ; les champs sensibles sont expurgés.

## 8. Modèle de données

Entités principales :

- `User`, `Role`, `Permission`, tables de jointure et `AuthIdentity(provider, subject)` pour `DEV` puis `CAS` ;
- `StudentProfile`, `AdvisorProfile`, `Component`, `Degree`, `AcademicYear`, `AdvisorDomain` ;
- `InterviewReason`, `Location`, `AvailabilitySeries`, `Availability`, `AvailabilityException` ;
- `InterviewRequest`, `Appointment`, `AppointmentStatusHistory`, `AppointmentRelation` ;
- `InternalNote` et `SharedContent`, volontairement séparés ;
- `Conversation`, `Message`, `MessageRead`, `Attachment`, `AttachmentGrant` ;
- `Notification`, `NotificationTemplate`, `OutboxEvent`, `AuditLog`, `Setting`.

Relations et contraintes : profils 0..1 par utilisateur ; disponibilités N..1 conseiller et série ; rendez-vous 1..1 disponibilité et demande ; conversation 1..1 rendez-vous ; pièces jointes rattachées à un message, une note ou un contenu. `Availability(id, startsAt, endsAt)` est indexée, les intervalles invalides sont rejetés. Une exclusion PostgreSQL empêche le chevauchement des disponibilités actives d'un conseiller ; un index unique partiel empêche plus d'un rendez-vous actif par disponibilité. L'opération de réservation verrouille la ligne `FOR UPDATE`, vérifie expiration et règles, puis écrit rendez-vous, historique et outbox dans une transaction.

`Appointment.kind` vaut `FIRST_WITH_SERVICE`, `FOLLOW_UP_SAME_ADVISOR` ou `SEEN_OTHER_ADVISOR`, calculé à la réservation puis conservé pour audit, sur la base des rendez-vous `COMPLETED` antérieurs.

## 9. Machine d'états

Disponibilité : `AVAILABLE -> HELD -> BOOKED`, avec retour `HELD -> AVAILABLE` à expiration. Rendez-vous : `BOOKED -> CONFIRMED -> COMPLETED`; `BOOKED|CONFIRMED -> CANCELLED_BY_STUDENT|CANCELLED_BY_ADVISOR|RESCHEDULED`; `CONFIRMED -> STUDENT_NO_SHOW|ADVISOR_NO_SHOW`. Un report crée un nouveau rendez-vous lié et rend l'ancien immuable. Chaque transition passe par un service de politique, exige acteur/motif, et crée un historique horodaté.

## 10. Pages et composants

Pages publiques : connexion de développement, accessibilité, confidentialité. Étudiant : tableau de bord, profil, nouvelle demande, disponibilités (liste/agenda), réservation, détail/fil/documents, historique. Conseiller : tableau de bord, agenda, éditeur créneau/série, détail rendez-vous, dossiers autorisés. Admin : utilisateurs, référentiels, règles, modèles, statistiques, exports, conservation, audit.

Composants : `AppShell`, `RoleGate`, `SkipLink`, `PageHeader`, `Field`, `ErrorSummary`, `StatusBadge` (texte + couleur), `AppointmentCard`, `AccessibleCalendar`, `SlotList`, `BookingStepper`, `RecurrenceEditor`, `ConversationThread`, `SecureFileUploader`, `InternalNoteEditor`, `SharedSummaryEditor`, `DataTable`, `FilterBar`, `ConfirmDialog`, `ToastRegion`, `EmptyState`, `StatCard`. Les composants interactifs sont testés au clavier et avec lecteur d'écran.

## 11. API nécessaire

- `POST /auth/dev/login`, `POST /auth/logout`, `GET /me`, puis `/auth/cas/login|callback` ;
- `GET/PATCH /students/me`, `GET/PATCH /advisors/me` ;
- CRUD admin `/users`, `/components`, `/degrees`, `/academic-years`, `/reasons`, `/locations`, `/domains`, `/settings` ;
- `POST/GET/PATCH/DELETE /availabilities`, `/availability-series`, actions `hold`, `release` ;
- `POST/GET /requests`, `POST /appointments`, `GET /appointments/:id`, actions `confirm`, `cancel`, `reschedule`, `complete`, `no-show`, `transfer` ;
- `/appointments/:id/messages`, `/internal-notes`, `/shared-content`, `/attachments` avec téléchargement autorisé ;
- `/notifications`, action `read`, `/calendar/:id.ics` ;
- `/stats` et `/exports` ; `/audit-logs` réservé.

Toutes les listes sont paginées, filtrées et bornées. Les commandes mutantes acceptent une clé d'idempotence et la concurrence optimiste utilise `version`/`ETag`.

## 12. Notifications

L'écriture métier ajoute un événement à l'outbox. Un dispatcher crée une notification in-app et un job par canal. Les modèles versionnés contiennent sujet, texte et HTML minimal. Les e-mails restent génériques et renvoient vers l'application authentifiée ; aucun motif, note ou besoin d'aménagement n'y figure. Le rappel est planifié à H-24, dédupliqué, annulé si le statut change et retenté avec backoff. Les adaptateurs préparent SMS ou push futurs.

## 13. Sécurité, RGPD et exploitation

- Session serveur en cookie `HttpOnly`, `Secure`, `SameSite=Lax`, rotation après connexion ; protection CSRF par token lié à la session ; mots de passe de développement Argon2id uniquement hors production.
- Validation serveur en liste blanche, requêtes paramétrées Prisma, CSP stricte, encodage React, CORS explicite, rate limiting par compte/IP, en-têtes Helmet.
- Autorisation sur chaque ressource, journalisation des lectures sensibles et mutations, sans contenu confidentiel dans les logs.
- TLS, chiffrement volumes/sauvegardes et KMS pour objets ; secrets hors dépôt ; restauration testée.
- Upload en quarantaine, taille/MIME/signature, nom UUID, antivirus, bucket privé, URL signée courte et contrôle d'accès préalable.
- Registre : identité/contact et scolarité pour prise en charge ; demandes/entretiens pour accompagnement ; messages/documents selon nécessité ; audit pour sécurité ; agrégats pour pilotage. Bases légales, information, droits, destinataires, conservation exacte, sous-traitants, AIPD, seuil statistique et purge des sauvegardes doivent être validés par le DPO.
- Tâches de conservation dry-run puis validation, suppression ou anonymisation irréversible, preuve d'exécution. Aucun contenu sensible dans `localStorage`.

## 14. MVP et évolutions

MVP : auth temporaire et RBAC, profils, référentiels essentiels, créneaux uniques/séries simples avec exceptions, verrou et réservation transactionnelle, tableaux de bord, workflow complet, notes/contenus séparés, fil, fichiers privés, courriel + in-app + rappel, ICS, statistiques principales avec seuil, audit essentiel et purge paramétrable.

Après MVP : CAS/SIS, affectation automatique avancée, Microsoft 365 bidirectionnel, séries complexes RFC 5545, liste d'attente, SMS/push, Excel, tableaux analytiques avancés, multi-établissement et délégation fine.

## 15. Lots

1. Socle, qualité, Docker, modèle Prisma et observabilité.
2. Identité temporaire, RBAC et profils.
3. Référentiels, disponibilités uniques/récurrentes et agenda accessible.
4. Demande, verrou, réservation concurrente et workflow.
5. tableaux de bord, notes, synthèses et messagerie.
6. Documents sécurisés, notifications, rappels et ICS.
7. Administration, statistiques, exports, audit et conservation.
8. E2E, accessibilité, sécurité, charge, exploitation et recette DPO.

