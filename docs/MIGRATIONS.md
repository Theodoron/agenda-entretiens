# Migrations Prisma

Le dossier `prisma/migrations` contient une migration de référence correspondant au schéma complet actuel.

## Nouvelle base de données

Sur une base vide, appliquer les migrations avant le seed :

```sh
npm run db:migrate:deploy
npm run db:seed
```

## Base existante créée avec `prisma db push`

Ne pas exécuter directement `migrate deploy` : la migration de référence tenterait de recréer les tables existantes.

Pour chaque environnement existant :

1. effectuer et vérifier une sauvegarde de la base ;
2. configurer `DATABASE_URL` pour cet environnement ;
3. vérifier que la base correspond exactement au schéma versionné :

   ```sh
   npm run db:drift
   ```

4. si la commande ne signale aucune différence, enregistrer la migration de référence comme déjà appliquée :

   ```sh
   npx prisma migrate resolve --applied 20260714190000_baseline
   ```

5. contrôler ensuite l’état :

   ```sh
   npm run db:migrate:status
   ```

Si une différence est détectée à l’étape 3, arrêter la procédure et l’analyser avant toute commande d’écriture.

## Déploiement

Le script `start:prod` conserve temporairement `prisma db push`. Il ne devra être remplacé par `prisma migrate deploy` qu’après le baselining vérifié de chaque base existante. Cette séparation évite qu’un simple redéploiement tente d’appliquer la migration initiale sur une base déjà remplie.

Pour les changements futurs, créer une migration dédiée en développement, la relire, la tester sur une copie de la base, puis utiliser `npm run db:migrate:deploy` en déploiement.
