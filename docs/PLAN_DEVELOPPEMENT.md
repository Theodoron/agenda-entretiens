# Plan de développement

Chaque lot se termine par lint, typage, tests unitaires/intégration, migration vérifiée et démonstration sans interaction factice.

## Critères du MVP

- Parcours étudiant, conseiller et administrateur utilisables avec des comptes de démonstration.
- Réservation concurrente prouvée par un test d'intégration PostgreSQL.
- Autorisations négatives testées (un étudiant ne lit jamais les notes internes ; un conseiller ne lit que son périmètre).
- Courriels capturables en développement et tâches idempotentes.
- Fichiers privés et analysés avant partage.
- Audit, conservation, restauration et documentation d'exploitation testés.
- Audit automatisé WCAG complété par une recette clavier/lecteur d'écran.

## Avancement

- Terminé : conception, socle, schéma, authentification temporaire, RBAC initial, API profils, référentiels de démonstration, créneau unique, liste des disponibilités, réservation sérialisable, historique/outbox, tableaux de bord étudiant et conseiller initiaux.
- Terminé : séries hebdomadaires, verrou temporaire explicite, transitions de statut contrôlées par rôle et branchement des profils et du workflow dans l'interface.
- Terminé : messagerie partagée, notes internes conseiller/admin et synthèses partagées, avec séparation stricte des visibilités et panneau d'interface dédié.
- Terminé côté API : documents S3 privés mis en quarantaine avant partage, formats et taille limités, worker BullMQ idempotent et notifications applicatives/courriel.
- En cours : finalisation du panneau documentaire dans l'interface et administration.
- À suivre : messagerie, notes/synthèses, fichiers, worker de notifications, administration, statistiques et conservation.

## Arborescence cible

```text
apps/web/              React/Vite
apps/api/              NestJS API et worker
packages/contracts/    schémas et types partagés
packages/ui/           composants accessibles
prisma/                schéma, migrations, seed
docs/                  conception, RGPD, exploitation
tests/e2e/              parcours Playwright
infra/                  configuration de déploiement
```

## Qualité

Unitaires : politiques de statut, récurrence, droits, calcul des indicateurs. Intégration : transactions, contraintes, outbox, stockage. API : validation, idempotence et matrice RBAC. Concurrence : deux transactions réservent le même créneau, une seule réussit. E2E : les douze parcours prioritaires du cahier des charges. Sécurité : dépendances, SAST, secrets, limites d'upload et tests d'accès horizontal. Accessibilité : axe, clavier, focus, zoom 200 %, contrastes et alternatives au calendrier.
