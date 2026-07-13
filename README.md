# Rendez-vous orientation

Application universitaire de réservation et de suivi d'entretiens individuels.

Le dépôt est amorcé par une phase de conception complète dans [`docs/CONCEPTION.md`](docs/CONCEPTION.md). Le développement est découpé en lots afin que chaque incrément reste testable et déployable.

## Architecture retenue

- frontend : React, TypeScript et Vite ;
- API : NestJS, TypeScript et Prisma ;
- données : PostgreSQL ;
- tâches différées : Redis et BullMQ ;
- documents : stockage S3 compatible privé ;
- courriel : SMTP, avec adaptateur remplaçable ;
- déploiement : conteneurs Docker.

## Démarrage du socle

Prérequis : Node 22+, npm 10+ et Docker Compose.

```bash
cp .env.example .env
npm install
docker compose up -d postgres redis minio
npm run db:generate
npm run db:migrate -- --name init
npm run db:seed
npm run dev
```

L'interface sera disponible sur `http://localhost:5173`, l'API sur `http://localhost:3000/api` et la documentation OpenAPI sur `http://localhost:3000/api/docs`.

## État

Le parcours de rendez-vous est implémenté : authentification temporaire, profils, créneaux, réservation transactionnelle, workflow, messagerie, notes internes et synthèses. L'API gère aussi les documents privés S3 mis en quarantaine jusqu'à leur analyse et un worker BullMQ transforme l'outbox en notifications applicatives et courriels idempotents. Le panneau documentaire et l'administration restent à finaliser. Aucun faux parcours fonctionnel n'est présenté comme terminé.

Docker n'est pas requis pour compiler, mais PostgreSQL est nécessaire pour appliquer la migration, charger les données de démonstration et exécuter l'application. Si Docker Desktop n'est pas disponible, renseigner `DATABASE_URL` vers une instance PostgreSQL 16 existante.
