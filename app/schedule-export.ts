import type { EventRecord } from "./supabase-client";

export type ScheduleExportCrewMember = { position: string; name: string };
export type ScheduleExportRow = {
  id: string;
  date: string;
  time: string;
  field: string;
  site: string;
  homeTeam: string;
  awayTeam: string;
  ageGroup: string;
  gender: string;
  competition: string;
  gameType: string;
  crew: ScheduleExportCrewMember[];
  breakBefore?: boolean;
};

export type SchedulePdfOptions = {
  density: "standard" | "compact" | "ultra";
  paperSize: "letter" | "legal";
  nameFormat: "full" | "abbreviated";
  includeSeparators: boolean;
  includeSite: boolean;
  includeAgeGender: boolean;
  includeCompetition: boolean;
  includeGameType: boolean;
};

function filenamePart(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event";
}

function workbookRows(rows: ScheduleExportRow[]) {
  const maximumCrew = Math.max(0, ...rows.map((row) => row.crew.length));
  const headings = ["Date", "Time", "Site", "Field", "Home Team", "Away Team", "Age Group", "Gender", "Competition", "Game Type"];
  for (let index = 1; index <= maximumCrew; index += 1) headings.push(`Position ${index}`, `Official ${index}`);
  const output: unknown[][] = [headings];
  rows.forEach((row, index) => {
    if (index > 0 && row.breakBefore) output.push([]);
    const cells: unknown[] = [row.date, row.time, row.site, row.field, row.homeTeam, row.awayTeam, row.ageGroup, row.gender, row.competition, row.gameType];
    row.crew.forEach((member) => cells.push(member.position, member.name));
    while (cells.length < headings.length) cells.push("");
    output.push(cells);
  });
  return { headings, output };
}

export async function exportScheduleExcel(event: EventRecord, rows: ScheduleExportRow[]) {
  const XLSX = await import("xlsx");
  const { headings, output } = workbookRows(rows);
  const sheet = XLSX.utils.aoa_to_sheet(output);
  sheet["!cols"] = headings.map((heading) => ({ wch: heading.includes("Team") ? 28 : heading.includes("Official") ? 24 : heading === "Competition" ? 22 : 15 }));
  sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Schedule");
  XLSX.writeFile(workbook, `${filenamePart(event.name)}-schedule.xlsx`, { compression: true });
}

function abbreviatedName(value: string) {
  if (!value || value === "Open") return value;
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : parts[0] || value;
}

function crewSlot(position: string, occurrence: number) {
  const normalized = position.trim().toLowerCase();
  if (/^(center |centre )?referee$|^r$/.test(normalized)) return { key: "referee", label: "R", priority: 0 };
  const assistant = normalized.match(/^(?:ar|assistant referee|asst\.? referee)(?:\s*#?\s*(\d+))?$/);
  if (assistant) {
    const assistantNumber = Number(assistant[1] || occurrence);
    return { key: `assistant-${assistantNumber}`, label: `AR${assistantNumber}`, priority: 10 + assistantNumber };
  }
  if (/^(4th|fourth) official$/.test(normalized)) return { key: "fourth", label: "4th", priority: 30 };
  const base = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "official";
  return { key: `${base}-${occurrence}`, label: occurrence > 1 ? `${position} ${occurrence}` : position, priority: 40 };
}

function crewColumns(rows: ScheduleExportRow[]) {
  const columns = new Map<string, { key: string; label: string; priority: number; firstSeen: number }>();
  let firstSeen = 0;
  rows.forEach((row) => {
    const occurrences = new Map<string, number>();
    row.crew.forEach((member) => {
      const normalized = member.position.trim().toLowerCase();
      const occurrence = (occurrences.get(normalized) || 0) + 1;
      occurrences.set(normalized, occurrence);
      const slot = crewSlot(member.position, occurrence);
      if (!columns.has(slot.key)) columns.set(slot.key, { ...slot, firstSeen: firstSeen++ });
    });
  });
  return [...columns.values()].sort((left, right) => left.priority - right.priority || left.firstSeen - right.firstSeen);
}

export async function exportSchedulePdf(event: EventRecord, rows: ScheduleExportRow[], options: SchedulePdfOptions) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const document = new jsPDF({ orientation: "landscape", unit: "pt", format: options.paperSize });
  const positionColumns = crewColumns(rows);
  const density = {
    standard: { fontSize: 7.2, padding: 3.25, lineWidth: 0.5 },
    compact: { fontSize: 6.3, padding: 2.25, lineWidth: 0.35 },
    ultra: { fontSize: 5.5, padding: 1.5, lineWidth: 0.25 },
  }[options.density];
  const formatName = options.nameFormat === "abbreviated" ? abbreviatedName : (value: string) => value;
  document.setFont("helvetica", "bold");
  document.setFontSize(14);
  document.setTextColor(24, 53, 83);
  document.text(event.name, 20, 24);
  document.setFont("helvetica", "normal");
  document.setFontSize(7.5);
  document.setTextColor(104, 119, 138);
  document.text(`Law18Referee Management schedule - ${rows.length} game${rows.length === 1 ? "" : "s"}`, 20, 36);
  const baseHeadings = ["Date / Time"];
  if (options.includeSite) baseHeadings.push("Site");
  baseHeadings.push("Field", "Match");
  const includeDetails = options.includeAgeGender || options.includeCompetition || options.includeGameType;
  if (includeDetails) baseHeadings.push("Details");
  const headings = [...baseHeadings, ...positionColumns.map((column) => column.label)];
  const body: string[][] = [];
  rows.forEach((row, index) => {
    if (options.includeSeparators && index > 0 && row.breakBefore) body.push(headings.map(() => ""));
    const cells = [`${row.date}\n${row.time}`];
    if (options.includeSite) cells.push(row.site);
    cells.push(row.field, `${row.homeTeam}\nvs. ${row.awayTeam}`);
    if (includeDetails) cells.push([
      options.includeAgeGender ? [row.ageGroup, row.gender].filter(Boolean).join(" ") : "",
      options.includeCompetition ? row.competition : "",
      options.includeGameType ? row.gameType : "",
    ].filter(Boolean).join("\n"));
    const occurrences = new Map<string, number>();
    const crewBySlot = new Map<string, string>();
    row.crew.forEach((member) => {
      const normalized = member.position.trim().toLowerCase();
      const occurrence = (occurrences.get(normalized) || 0) + 1;
      occurrences.set(normalized, occurrence);
      crewBySlot.set(crewSlot(member.position, occurrence).key, formatName(member.name));
    });
    positionColumns.forEach((column) => cells.push(crewBySlot.get(column.key) || ""));
    body.push(cells);
  });
  const pageWidth = document.internal.pageSize.getWidth();
  const availableWidth = pageWidth - 40;
  const fixedWidths: number[] = [options.density === "ultra" ? 52 : 60];
  if (options.includeSite) fixedWidths.push(options.density === "ultra" ? 42 : 52);
  fixedWidths.push(options.density === "ultra" ? 34 : 42, options.density === "ultra" ? 150 : 170);
  if (includeDetails) fixedWidths.push(options.density === "ultra" ? 60 : 76);
  const crewWidth = Math.max(42, (availableWidth - fixedWidths.reduce((sum, width) => sum + width, 0)) / Math.max(1, positionColumns.length));
  const columnStyles = Object.fromEntries([...fixedWidths, ...positionColumns.map(() => crewWidth)].map((cellWidth, index) => [index, { cellWidth }]));
  autoTable(document, {
    startY: 44,
    margin: { top: 20, right: 20, bottom: 22, left: 20 },
    head: [headings],
    body,
    theme: "grid",
    styles: { font: "helvetica", fontSize: density.fontSize, cellPadding: density.padding, lineWidth: density.lineWidth, textColor: [24, 53, 83], valign: "middle", overflow: "linebreak" },
    headStyles: { fillColor: [36, 74, 115], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles,
    rowPageBreak: "avoid",
    didParseCell: (hook) => {
      if (hook.section === "body" && Array.isArray(hook.row.raw) && hook.row.raw.every((value) => value === "")) {
        hook.cell.styles.minCellHeight = options.density === "ultra" ? 4 : 6;
        hook.cell.styles.fillColor = [255, 255, 255];
        hook.cell.styles.lineColor = [255, 255, 255];
      }
    },
    didDrawPage: () => {
      const page = document.getCurrentPageInfo().pageNumber;
      document.setFontSize(7);
      document.setTextColor(104, 119, 138);
      document.text(`Page ${page}`, document.internal.pageSize.getWidth() - 42, document.internal.pageSize.getHeight() - 10);
    },
  });
  document.save(`${filenamePart(event.name)}-schedule.pdf`);
}
