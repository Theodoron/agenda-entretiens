import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateInterviewReasons() {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "InterviewReason"
    ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "InterviewRequestReason" (
      "requestId" UUID NOT NULL,
      "reasonId" UUID NOT NULL,
      CONSTRAINT "InterviewRequestReason_pkey" PRIMARY KEY ("requestId", "reasonId")
    )
  `);

  await prisma.$executeRawUnsafe(`
    DO $migration$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'InterviewRequest'
          AND column_name = 'reasonId'
      ) THEN
        EXECUTE '
          INSERT INTO "InterviewRequestReason" ("requestId", "reasonId")
          SELECT "id", "reasonId"
          FROM "InterviewRequest"
          ON CONFLICT ("requestId", "reasonId") DO NOTHING
        ';

        ALTER TABLE "InterviewRequest"
        DROP CONSTRAINT IF EXISTS "InterviewRequest_reasonId_fkey";

        ALTER TABLE "InterviewRequest"
        DROP COLUMN "reasonId";
      END IF;
    END
    $migration$
  `);
}

try {
  await migrateInterviewReasons();
  console.log('Pré-migration des motifs terminée.');
} finally {
  await prisma.$disconnect();
}
