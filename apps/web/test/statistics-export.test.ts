import assert from "node:assert/strict";
import test from "node:test";
import writeExcelFile from "write-excel-file/node";
import {
  buildStatisticsExportSheets,
  type StatisticsExportData,
} from "../src/statisticsExport";

const statistics: StatisticsExportData = {
  totals: {
    appointments: 12,
    students: 8,
    repeatStudents: 3,
    averagePerStudent: 1.5,
  },
  monthly: [{ label: "2026-09", count: 7 }],
  statuses: [{ label: "BOOKED", count: 7 }],
  reasons: [{ label: "Orientation", count: 6 }],
  reasonByMonth: [{ month: "2026-09", reasons: { Orientation: 6 } }],
  origins: {
    components: [{ label: "Faculté de Droit", count: 6 }],
    degrees: [{ label: "Licence — Droit", count: 6 }],
    academicYears: [{ label: "L1", count: 6 }],
    academicYearsByComponent: [
      {
        component: "Faculté de Droit",
        years: [{ label: "L1", count: 6 }],
      },
    ],
  },
  repeatByComponent: [
    {
      label: "Faculté de Droit",
      students: 6,
      appointments: 9,
      repeated: 3,
      average: 1.5,
    },
  ],
  occupancy: {
    totalSlots: 10,
    bookedSlots: 7,
    rate: 0.7,
    monthly: [{ label: "2026-09", total: 10, booked: 7, rate: 0.7 }],
  },
  accessDelay: { averageDays: 4, medianDays: 3 },
  cancellations: { cancelled: 1, noShows: 0, rate: 1 / 12 },
  demand: {
    weekdays: [{ label: "Lundi", count: 6 }],
    hours: [{ label: "09 h", count: 6 }],
  },
  repeatReasons: [{ label: "Orientation", count: 5 }],
  privacy: {
    smallCohortThreshold: 5,
    aggregatedOnly: true,
    scope: "ADVISOR",
  },
};

const cellText = (cell: unknown) => {
  if (cell && typeof cell === "object" && "value" in cell) {
    return String((cell as { value?: unknown }).value ?? "");
  }
  return String(cell ?? "");
};

test("prépare les six rubriques dans le classeur global", () => {
  const sheets = buildStatisticsExportSheets(
    statistics,
    {
      month: (value) => `Mois ${value}`,
      status: (value) => (value === "BOOKED" ? "Réservé" : value),
    },
    new Date("2026-09-20T12:00:00"),
  );

  assert.deepEqual(
    sheets.map((sheet) => sheet.sheet),
    ["Origine", "Motifs", "Fréquence", "Occupation", "Demande", "Statuts"],
  );
  assert.equal(sheets.length, 6);
});

test("exporte uniquement les ventilations déjà protégées par l’API", () => {
  const sheets = buildStatisticsExportSheets(
    statistics,
    { month: (value) => value, status: (value) => value },
    new Date("2026-09-20T12:00:00"),
  );
  const workbookText = sheets
    .flatMap((sheet) => sheet.data)
    .flat()
    .map(cellText)
    .join(" ");

  assert.match(workbookText, /Orientation/);
  assert.match(workbookText, /inférieures à 5 personnes masquées/);
  assert.doesNotMatch(workbookText, /Santé/);
});

test("génère un classeur XLSX valide à partir des feuilles préparées", async () => {
  const sheets = buildStatisticsExportSheets(
    statistics,
    { month: (value) => value, status: (value) => value },
    new Date("2026-09-20T12:00:00"),
  );
  const file = await writeExcelFile(sheets).toBuffer();

  assert.equal(file.subarray(0, 2).toString("ascii"), "PK");
  assert.ok(file.length > 1_000);
});
