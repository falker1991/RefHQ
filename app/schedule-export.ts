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

export async function exportSchedulePdf(event: EventRecord, rows: ScheduleExportRow[]) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const document = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  document.setFont("helvetica", "bold");
  document.setFontSize(16);
  document.setTextColor(24, 53, 83);
  document.text(event.name, 36, 35);
  document.setFont("helvetica", "normal");
  document.setFontSize(9);
  document.setTextColor(104, 119, 138);
  document.text(`Law18Referee Management schedule · ${rows.length} game${rows.length === 1 ? "" : "s"}`, 36, 50);
  const body: string[][] = [];
  rows.forEach((row, index) => {
    if (index > 0 && row.breakBefore) body.push(["", "", "", "", "", "", "", "", ""]);
    body.push([
      row.date,
      row.time,
      [row.site, row.field].filter(Boolean).join(" · "),
      row.homeTeam,
      row.awayTeam,
      row.ageGroup,
      row.gender,
      row.competition,
      row.crew.map((member) => `${member.position}: ${member.name}`).join("\n"),
    ]);
  });
  autoTable(document, {
    startY: 62,
    head: [["Date", "Time", "Site / Field", "Home Team", "Away Team", "Age", "Gender", "Competition", "Crew"]],
    body,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 6.8, cellPadding: 3.5, textColor: [24, 53, 83], valign: "middle", overflow: "linebreak" },
    headStyles: { fillColor: [36, 74, 115], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: { 0: { cellWidth: 58 }, 1: { cellWidth: 43 }, 2: { cellWidth: 78 }, 5: { cellWidth: 34 }, 6: { cellWidth: 38 }, 7: { cellWidth: 65 }, 8: { cellWidth: 120 } },
    didParseCell: (hook) => {
      if (hook.section === "body" && Array.isArray(hook.row.raw) && hook.row.raw.every((value) => value === "")) {
        hook.cell.styles.minCellHeight = 8;
        hook.cell.styles.fillColor = [255, 255, 255];
        hook.cell.styles.lineColor = [255, 255, 255];
      }
    },
    didDrawPage: () => {
      const page = document.getCurrentPageInfo().pageNumber;
      document.setFontSize(7);
      document.setTextColor(104, 119, 138);
      document.text(`Page ${page}`, document.internal.pageSize.getWidth() - 55, document.internal.pageSize.getHeight() - 16);
    },
  });
  document.save(`${filenamePart(event.name)}-schedule.pdf`);
}
