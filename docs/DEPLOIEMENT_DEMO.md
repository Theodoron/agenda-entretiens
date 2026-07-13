# Déploiement de démonstration — Supabase, GitHub et Koyeb

Cette configuration publie le frontend React et l'API NestJS dans un seul service web Koyeb. PostgreSQL est hébergé par Supabase. Elle est volontairement adaptée à une démonstration et non à une mise en production avec de vraies données personnelles.

## 1. Préparer Supabase

1. Créer un projet Supabase dans une région européenne et attendre que son état soit **Healthy**.
2. Ouvrir le projet, puis cliquer sur **Connect** en haut du tableau de bord.
3. Dans le panneau de connexion, afficher la section **Connection string** et sélectionner le mode **Session pooler**. Ne pas choisir **Direct connection** ni **Transaction pooler**.
4. Copier l'URI affichée. La bonne chaîne se reconnaît à ces trois éléments :

   - l'utilisateur est `postgres.<PROJECT_REF>` et non simplement `postgres` ;
   - l'hôte se termine par `.pooler.supabase.com` ;
   - le port est `5432` (le Transaction pooler utilise `6543`).

   Le port `5432` ne suffit pas à lui seul pour l'identifier, car la connexion directe utilise aussi ce port. L'URI ressemble à ceci :

   ```text
   postgresql://postgres.PROJECT_REF:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
   ```

5. Remplacer `[YOUR-PASSWORD]` par le mot de passe de base de données défini lors de la création du projet. Ce n'est ni le mot de passe du compte Supabase, ni une clé `anon`, ni la clé `service_role`. En cas d'oubli, le réinitialiser dans **Project Settings > Database**.
6. Si le mot de passe contient notamment `@`, `:`, `/`, `?`, `#`, `&` ou `%`, l'encoder avant de l'insérer dans l'URI. PowerShell peut produire la valeur encodée sans modifier le mot de passe :

   ```powershell
   [Uri]::EscapeDataString('VOTRE_MOT_DE_PASSE')
   ```

7. Ajouter `sslmode=require` et `schema=agenda` à la fin de l'URI. Après `/postgres`, utiliser `?` pour le premier paramètre et `&` pour les suivants :

   ```text
   postgresql://postgres.PROJECT_REF:MOT_DE_PASSE@REGION.pooler.supabase.com:5432/postgres?sslmode=require&schema=agenda
   ```

8. Copier cette URI complète dans la variable Koyeb `DATABASE_URL`, sans guillemets. Ne jamais la placer dans GitHub ou dans un fichier commité : elle contient le mot de passe administrateur de la base.

Le **Session pooler** convient ici parce que l'API NestJS est un processus serveur persistant et que ce point d'accès Supavisor est joignable en IPv4. Le **Transaction pooler** sur le port `6543` cible plutôt les fonctions serverless à connexions brèves et impose des précautions supplémentaires avec les requêtes préparées de Prisma. La connexion **Direct** est préférable quand l'hébergeur dispose bien d'IPv6 ou lorsque l'option IPv4 Supabase est activée ; ce n'est pas nécessaire pour cette démo.

Au premier démarrage, Prisma crée le schéma et charge les trois comptes de démonstration.

### Stockage des documents (optionnel)

Dans **Storage**, créer un bucket privé `agenda-private`, puis activer S3 dans **S3 Configuration** et créer une paire de clés. Conserver l'endpoint, la région, l'Access Key ID et la Secret Access Key pour Koyeb.

## 2. Publier sur GitHub

Créer un dépôt GitHub vide, puis depuis la racine du projet :

```bash
git init
git add .
git commit -m "Prépare la démo Koyeb"
git branch -M main
git remote add origin https://github.com/VOTRE_COMPTE/agenda-entretiens.git
git push -u origin main
```

Le fichier `.env` est ignoré et ne doit jamais être envoyé sur GitHub.

## 3. Créer le service Koyeb

1. Choisir **Create Web Service**, puis **GitHub** et le dépôt.
2. Choisir le builder **Dockerfile** et laisser le répertoire de travail à la racine.
3. Choisir la région **Frankfurt** et, pour la démo, l'instance **Free**.
4. Exposer le port HTTP `8000` avec la route `/`.
5. Ajouter un health check HTTP sur `/api/health`.
6. Ajouter les variables suivantes :

   ```text
   NODE_ENV=production
   ENABLE_DEV_LOGIN=true
   PORT=8000
   WEB_ORIGIN=https://{{ KOYEB_PUBLIC_DOMAIN }}
   DATABASE_URL=<URI Session pooler Supabase>
   SESSION_SECRET=<secret aléatoire d'au moins 32 caractères>
   SMALL_COHORT_THRESHOLD=5
   HOLD_DURATION_MINUTES=5
   STUDENT_CANCELLATION_HOURS=24
   ```

Pour tester réellement l’email envoyé lors d’une annulation par le conseiller, ajouter les variables SMTP fournies par le prestataire de messagerie et une adresse étudiante de réception :

   ```text
   DEMO_STUDENT_EMAIL=<adresse réelle utilisée pour la démonstration>
   SMTP_HOST=<serveur SMTP>
   SMTP_PORT=587
   SMTP_USER=<identifiant SMTP>
   SMTP_PASSWORD=<mot de passe ou clé SMTP>
   MAIL_FROM=Service orientation <adresse-expéditrice-autorisée>
   ```

`SMTP_PASSWORD` doit être enregistré comme secret Koyeb. `DEMO_STUDENT_EMAIL` modifie uniquement l’adresse de notification du compte étudiant ; l’identifiant de connexion reste `etudiant@example.test`.

Pour générer `SESSION_SECRET` dans PowerShell :

```powershell
$bytes = New-Object byte[] 48
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
$rng.Dispose()
```

Si le stockage Supabase a été préparé, ajouter aussi :

```text
S3_ENDPOINT=https://PROJECT_REF.supabase.co/storage/v1/s3
S3_REGION=<région affichée dans la configuration S3>
S3_BUCKET=agenda-private
S3_ACCESS_KEY=<Access Key ID>
S3_SECRET_KEY=<Secret Access Key>
```

Lancer le déploiement. Les mises à jour poussées sur `main` déclencheront ensuite un nouveau déploiement.

## 4. Vérifier la démo

- Application : `https://<domaine-koyeb>/`
- Santé : `https://<domaine-koyeb>/api/health`
- Documentation API : `https://<domaine-koyeb>/api/docs`

Comptes préchargés (mot de passe commun `Demo-Agenda-2026!`) :

- `etudiant@example.test`
- `conseiller@example.test`
- `admin@example.test`

Ne saisir aucune donnée personnelle réelle. La session est conservée en mémoire : une mise en veille ou un redéploiement déconnecte les utilisateurs, ce qui est acceptable pour cette démonstration à une seule instance.

## Limites connues de cette démo

- le worker de notifications et l'envoi SMTP ne sont pas lancés, car ils nécessitent Redis et un second processus ;
- l'instance Koyeb gratuite se met en veille après une période sans trafic, donc le premier affichage peut être plus lent ;
- le schéma est synchronisé avec `prisma db push` au démarrage ; avant une vraie production, il faudra versionner des migrations Prisma ;
- l'authentification de démonstration doit être remplacée par le CAS/SSO de l'établissement avant tout usage réel.
