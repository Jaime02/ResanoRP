type TClipboardCell = string | number | null | undefined;

const CELL_STYLE = "border:1px solid #d4d4d4;padding:4px 8px;vertical-align:top";
const HEADER_CELL_STYLE = `${CELL_STYLE};background:#f5f5f5;font-weight:bold;text-align:left`;

function toTsvCell(value: TClipboardCell) {
  return String(value ?? "").replaceAll(/[\t\r\n]+/g, " ");
}

function toHtmlCell(value: TClipboardCell, tag: "td" | "th") {
  const escaped = String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\n", "<br>");
  return `<${tag} style="${tag === "th" ? HEADER_CELL_STYLE : CELL_STYLE}">${escaped}</${tag}>`;
}

export function tableToClipboard(header: Array<string>, rows: Array<Array<TClipboardCell>>) {
  const htmlHeader = header.map((cell) => toHtmlCell(cell, "th")).join("");
  const htmlRows = rows.map((row) => `<tr>${row.map((cell) => toHtmlCell(cell, "td")).join("")}</tr>`).join("");
  return {
    value: [header, ...rows].map((row) => row.map(toTsvCell).join("\t")).join("\n"),
    html: `<table style="border-collapse:collapse;font-family:sans-serif;font-size:13px"><thead><tr>${htmlHeader}</tr></thead><tbody>${htmlRows}</tbody></table>`,
  };
}
