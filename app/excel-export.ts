export type ExcelSheetDefinition = {
  name: string;
  rows: unknown[][];
  widths: number[];
  freezeRow?: number;
  autoFilterRow?: number;
};

function safeFilename(value: string) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "") || "law18ref-export.xlsx";
}

export async function downloadExcelWorkbook(filename: string, definitions: ExcelSheetDefinition[]) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Law18Referee Management";
  workbook.created = new Date();

  definitions.forEach((definition) => {
    const worksheet = workbook.addWorksheet(definition.name.slice(0, 31));
    worksheet.addRows(definition.rows as (string | number | boolean | Date | null | undefined)[][]);
    worksheet.columns = definition.widths.map((width) => ({ width }));
    if (definition.freezeRow) worksheet.views = [{ state: "frozen", xSplit: 0, ySplit: definition.freezeRow }];
    if (definition.autoFilterRow && definition.rows[definition.autoFilterRow - 1]?.length) {
      worksheet.autoFilter = {
        from: { row: definition.autoFilterRow, column: 1 },
        to: { row: Math.max(definition.autoFilterRow, definition.rows.length), column: definition.rows[definition.autoFilterRow - 1].length },
      };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = safeFilename(filename);
  link.click();
  URL.revokeObjectURL(url);
}
