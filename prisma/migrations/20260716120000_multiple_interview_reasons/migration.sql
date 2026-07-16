ALTER TABLE "InterviewReason"
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "InterviewRequestReason" (
    "requestId" UUID NOT NULL,
    "reasonId" UUID NOT NULL,

    CONSTRAINT "InterviewRequestReason_pkey" PRIMARY KEY ("requestId", "reasonId")
);

INSERT INTO "InterviewRequestReason" ("requestId", "reasonId")
SELECT "id", "reasonId"
FROM "InterviewRequest";

CREATE INDEX "InterviewRequestReason_reasonId_idx"
ON "InterviewRequestReason"("reasonId");

ALTER TABLE "InterviewRequestReason"
ADD CONSTRAINT "InterviewRequestReason_requestId_fkey"
FOREIGN KEY ("requestId") REFERENCES "InterviewRequest"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InterviewRequestReason"
ADD CONSTRAINT "InterviewRequestReason_reasonId_fkey"
FOREIGN KEY ("reasonId") REFERENCES "InterviewReason"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InterviewRequest"
DROP CONSTRAINT "InterviewRequest_reasonId_fkey";

ALTER TABLE "InterviewRequest"
DROP COLUMN "reasonId";
