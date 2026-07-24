import type { Cell, Row, SheetData } from "write-excel-file/browser";

export type StatisticsExportData = {
  totals: {
    appointments: number;
    students: number;
    repeatStudents: number;
    averagePerStudent: number;
  };
  monthly: { label: string; count: number }[];
  statuses: { label: string; count: number }[];
  reasons: { label: string; count: number }[];
  reasonByMonth: { month: string; reasons: Record<string, number> }[];
  origins: {
    components: { label: string; count: number }[];
    degrees: { label: string; count: number }[];
    academicYears: { label: string; count: number }[];
    academicYearsByComponent: {
      component: string;
      years: { label: string; count: number }[];
    }[];
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
    monthly: {
      label: string;
      total: number;
      booked: number;
      rate: number;
    }[];
  };
  accessDelay: { averageDays: number; medianDays: number };
  cancellations: { cancelled: number; noShows: number; rate: number };
  demand: {
    weekdays: { label: string; count: number }[];
    hours: { label: string; count: number }[];
  };
  repeatReasons: { label: string; count: number }[];
  privacy: {
    smallCohortThreshold: number;
    aggregatedOnly: boolean;
    scope: "GLOBAL" | "ADVISOR";
  };
};

export type StatisticsExportSection =
  "origins" | "reasons" | "frequency" | "occupancy" | "demand" | "statuses";

type ExportFormatters = {
  month: (value: string) => string;
  status: (value: string) => string;
};

export type StatisticsExportSheet = {
  key: StatisticsExportSection;
  sheet: string;
  fileSlug: string;
  data: SheetData;
  columns: { width: number }[];
  showGridLines: false;
};

const palette = {
  purple: "#4E2A84",
  palePurple: "#EDE7F3",
  ink: "#32185B",
  white: "#FFFFFF",
};

const titleCell = (value: string, columnSpan: number): Cell => ({
  value,
  columnSpan,
  fontSize: 16,
  fontWeight: "bold",
  textColor: palette.ink,
  height: 28,
});

const sectionCell = (value: string, columnSpan: number): Cell => ({
  value,
  columnSpan,
  fontWeight: "bold",
  textColor: palette.ink,
  backgroundColor: palette.palePurple,
});

const headerCell = (value: string): Cell => ({
  value,
  fontWeight: "bold",
  textColor: palette.white,
  backgroundColor: palette.purple,
  alignVertical: "center",
});

const numberCell = (value: number, format = "#,##0"): Cell => ({
  value,
  type: Number,
  format,
});

const spanRow = (cell: Cell, columnCount: number): Row => [
  cell,
  ...Array.from({ length: Math.max(0, columnCount - 1) }, () => null),
];

const metadataRows = (
  title: string,
  statistics: StatisticsExportData,
  columnCount: number,
  exportedAt: Date,
): SheetData => [
  spanRow(titleCell(title, columnCount), columnCount),
  spanRow(`Exporté le ${exportedAt.toLocaleString("fr-FR")}`, columnCount),
  spanRow(
    `Périmètre : ${
      statistics.privacy.scope === "ADVISOR"
        ? "vos entretiens"
        : "ensemble du service"
    }`,
    columnCount,
  ),
  spanRow(
    `Confidentialité : données agrégées ; ventilations inférieures à ${statistics.privacy.smallCohortThreshold} personnes masquées`,
    columnCount,
  ),
  Array.from({ length: columnCount }, () => null),
];

const tableRows = (
  title: string,
  headers: string[],
  rows: Row[],
  columnCount: number,
): SheetData => [
  spanRow(sectionCell(title, columnCount), columnCount),
  headers.map(headerCell),
  ...(rows.length
    ? rows
    : [
        spanRow(
          {
            value: "Aucune donnée disponible",
            fontStyle: "italic",
            textColor: "#675D70",
          },
          columnCount,
        ),
      ]),
  Array.from({ length: columnCount }, () => null),
];

const simpleCountRows = (
  items: { label: string; count: number }[],
  label: (value: string) => string = (value) => value,
): Row[] => items.map((item) => [label(item.label), numberCell(item.count)]);

const academicYearMonths = (
  items: { label: string; count: number }[],
  today: Date,
) => {
  const counts = new Map(items.map((item) => [item.label, item.count]));
  const startYear =
    today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
  return Array.from({ length: 13 }, (_, index) => {
    const date = new Date(startYear, 8 + index, 1, 12);
    const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return { label, count: counts.get(label) ?? 0 };
  });
};

const weekdayOrder = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];

export function buildStatisticsExportSheets(
  statistics: StatisticsExportData,
  formatters: ExportFormatters,
  exportedAt = new Date(),
): StatisticsExportSheet[] {
  const originColumns = 5;
  const originRows: SheetData = [
    ...metadataRows("Origine", statistics, originColumns, exportedAt),
    ...tableRows(
      "Composantes",
      ["Composante", "Étudiants"],
      simpleCountRows(statistics.origins.components),
      originColumns,
    ),
    ...tableRows(
      "Étudiants par année et composante",
      ["Composante", "Année d’études", "Étudiants"],
      statistics.origins.academicYearsByComponent.flatMap((item) =>
        item.years.map((year): Row => [
          item.component,
          year.label,
          numberCell(year.count),
        ]),
      ),
      originColumns,
    ),
    ...tableRows(
      "Entretiens multiples par composante",
      [
        "Composante",
        "Étudiants",
        "Entretiens",
        "Étudiants avec plusieurs entretiens",
        "Moyenne",
      ],
      statistics.repeatByComponent.map((item): Row => [
        item.label,
        numberCell(item.students),
        numberCell(item.appointments),
        numberCell(item.repeated),
        numberCell(item.average, "0.00"),
      ]),
      originColumns,
    ),
    ...tableRows(
      "Année d’études",
      ["Année d’études", "Étudiants"],
      simpleCountRows(statistics.origins.academicYears),
      originColumns,
    ),
    ...tableRows(
      "Diplômes",
      ["Diplôme", "Étudiants"],
      simpleCountRows(statistics.origins.degrees),
      originColumns,
    ),
  ];

  const allReasons = Array.from(
    new Set(
      statistics.reasonByMonth.flatMap((item) => Object.keys(item.reasons)),
    ),
  );
  const reasonColumns = Math.max(2, allReasons.length + 1);
  const reasonRows: SheetData = [
    ...metadataRows("Motifs", statistics, reasonColumns, exportedAt),
    ...tableRows(
      "Motifs des entretiens",
      ["Motif", "Sélections"],
      simpleCountRows(statistics.reasons),
      reasonColumns,
    ),
    ...tableRows(
      "Motifs par période",
      ["Mois", ...allReasons],
      statistics.reasonByMonth.map((item): Row => [
        formatters.month(item.month),
        ...allReasons.map((reason) => numberCell(item.reasons[reason] ?? 0)),
      ]),
      reasonColumns,
    ),
    ...tableRows(
      "Motifs associés à plusieurs entretiens",
      ["Motif", "Sélections"],
      simpleCountRows(statistics.repeatReasons),
      reasonColumns,
    ),
  ];

  const frequencyRows: SheetData = [
    ...metadataRows(
      "Fréquence des entretiens — septembre à septembre",
      statistics,
      2,
      exportedAt,
    ),
    ...tableRows(
      "Nombre d’entretiens par mois",
      ["Mois", "Entretiens"],
      simpleCountRows(
        academicYearMonths(statistics.monthly, exportedAt),
        formatters.month,
      ),
      2,
    ),
  ];

  const occupancyRows: SheetData = [
    ...metadataRows(
      "Occupation des créneaux par mois",
      statistics,
      4,
      exportedAt,
    ),
    ...tableRows(
      "Occupation mensuelle",
      ["Mois", "Créneaux proposés", "Créneaux réservés", "Taux d’occupation"],
      statistics.occupancy.monthly.map((item): Row => [
        formatters.month(item.label),
        numberCell(item.total),
        numberCell(item.booked),
        numberCell(item.rate, "0.0%"),
      ]),
      4,
    ),
  ];

  const orderedWeekdays = [...statistics.demand.weekdays].sort(
    (a, b) => weekdayOrder.indexOf(a.label) - weekdayOrder.indexOf(b.label),
  );
  const orderedHours = [...statistics.demand.hours].sort((a, b) =>
    a.label.localeCompare(b.label, "fr"),
  );
  const demandRows: SheetData = [
    ...metadataRows("Demande", statistics, 2, exportedAt),
    ...tableRows(
      "Demande par jour de la semaine",
      ["Jour", "Demandes"],
      simpleCountRows(orderedWeekdays),
      2,
    ),
    ...tableRows(
      "Demande par heure",
      ["Heure", "Demandes"],
      simpleCountRows(orderedHours),
      2,
    ),
  ];

  const statusRows: SheetData = [
    ...metadataRows("Statuts des entretiens", statistics, 2, exportedAt),
    ...tableRows(
      "Répartition par statut",
      ["Statut", "Entretiens"],
      simpleCountRows(statistics.statuses, formatters.status),
      2,
    ),
  ];

  return [
    {
      key: "origins",
      sheet: "Origine",
      fileSlug: "origine",
      data: originRows,
      columns: [
        { width: 42 },
        { width: 22 },
        { width: 18 },
        { width: 34 },
        { width: 16 },
      ],
      showGridLines: false,
    },
    {
      key: "reasons",
      sheet: "Motifs",
      fileSlug: "motifs",
      data: reasonRows,
      columns: Array.from({ length: reasonColumns }, (_, index) => ({
        width: index === 0 ? 24 : 22,
      })),
      showGridLines: false,
    },
    {
      key: "frequency",
      sheet: "Fréquence",
      fileSlug: "frequence",
      data: frequencyRows,
      columns: [{ width: 24 }, { width: 18 }],
      showGridLines: false,
    },
    {
      key: "occupancy",
      sheet: "Occupation",
      fileSlug: "occupation",
      data: occupancyRows,
      columns: [{ width: 24 }, { width: 22 }, { width: 22 }, { width: 22 }],
      showGridLines: false,
    },
    {
      key: "demand",
      sheet: "Demande",
      fileSlug: "demande",
      data: demandRows,
      columns: [{ width: 28 }, { width: 18 }],
      showGridLines: false,
    },
    {
      key: "statuses",
      sheet: "Statuts",
      fileSlug: "statuts",
      data: statusRows,
      columns: [{ width: 34 }, { width: 18 }],
      showGridLines: false,
    },
  ];
}

const localDateSlug = (date: Date) =>
  [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

export async function exportStatisticsWorkbook(
  statistics: StatisticsExportData,
  section: StatisticsExportSection | "all",
  formatters: ExportFormatters,
) {
  const exportedAt = new Date();
  const sheets = buildStatisticsExportSheets(
    statistics,
    formatters,
    exportedAt,
  );
  const selectedSheets =
    section === "all"
      ? sheets
      : sheets.filter((candidate) => candidate.key === section);
  const fileSlug =
    section === "all" ? "toutes-les-statistiques" : selectedSheets[0]?.fileSlug;
  if (!fileSlug || selectedSheets.length === 0) {
    throw new Error("Rubrique statistique inconnue.");
  }

  const { default: writeExcelFile } = await import("write-excel-file/browser");
  await writeExcelFile(selectedSheets).toFile(
    `statistiques-${fileSlug}-${localDateSlug(exportedAt)}.xlsx`,
  );
}
