# Printers

Documents (Albarán, Factura, pending sell orders, sell order file) are rendered to PDF on the server (`renderPdf` in `src/files/index.tsx`). Every print dialog has a **printer combobox** (`src/components/print/print-controls.tsx`):

- **Otra** (id 0) opens the browser print dialog (`printPdfUrl` in `src/lib/print.ts`). Always present, and the only option when no printer is stored.
- **Each server printer** (maintenance > Impresoras) sends the PDF from the server with the `printer.print` tRPC mutation. Any user can print, only admins manage printers.

The selection is kept by printer id and falls back to the first option if that printer is renamed or deleted in another tab.

The selector itself is `usePrintControls` (`src/components/print/use-print-controls.ts`) with `ComboboxPrinter`; `PrintControls` wraps both for the document dialogs.

## Part tags

A printer is either **for tags** (`forTags`, "Para etiquetas de Artículos") or for every other document. The document dialogs only list the second ones, and the tag screens only the first ones, both with **Otra**.

Tags are printed from three places, all with the same selector:

- the tag dialog of a delivery note line or a staged sell order line (`DialogPartTag`), next to its Imprimir button,
- the header of the production history table of a machine, used by the print button of every row,
- the stop production dialog of a machine.

Printing a tag first renders it (`part.printTag` or `productionOrder.printTag`) into `TAGS_ROOT_PATH`, served at `/api/files/part-tag/<name>`, and then prints that file like any document. There is no preview. A tag is deleted when it is served, so it can be served only once; printing a tag again renders it again. A tag that is rendered but never served stays until it is rendered again.

The tag is rendered at the **label size of the selected printer** (`labelSize` in the input, `null` for printers without labels and for Otra, which get the 6 × 4 in tag). The page is landscape, its longer side across, so 100 × 70 mm stays 100 × 70 and 52 × 107 mm becomes 107 × 52 (the Intermec encoder turns it onto the label). The 6 × 4 in layout is scaled to the side that fits and stretches along the other, so it fills the label (`getTagPage` in `src/files/part-tag.tsx`). Names and URLs of the tag files are in `src/lib/part-tag.ts`.

Code: `src/files/printer.ts` (encoders and transports), `src/trpc/printer.ts`, `src/schemas/printer.ts`, `src/types/printer.ts` (`PrinterKind`), `src/messages/printer.ts`.

## Supported printer kinds

| Kind (`PrinterKind`) | Label in the app                 | Transport                                         | Format sent                                                                  | Ghostscript device |
| -------------------- | -------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------ |
| `ipp`                | Red (IPP)                        | IPP `Print-Job` over HTTP, port 631, `/ipp/print` | PWG raster (`image/pwg-raster`, 8-bit gray, 600 dpi)                         | `pwgraster`        |
| `intermecShare`      | Compartida: Intermec (etiquetas) | SMB print share (`smbclient`)                     | Intermec Direct Protocol with the page as an embedded PCX image, 203 dpi     | `pcxmono`          |
| `brotherShare`       | Compartida: Brother láser        | SMB print share (`smbclient`)                     | PJL/PCL of the `brlaser` driver, written by the app, A4, 600 dpi, 1 bit      | `pbmraw`           |
| `tscRaw`             | Red: TSC (etiquetas)             | Raw TCP, port 9100 (`RAW_PRINT_PORT`)             | TSPL: `SIZE`, then per page `CLS`, `BITMAP` (1 bit, 203 dpi) and `PRINT 1,1` | `pbmraw`           |

Why rasters and not PDF: the printers in use accept no PDF (see below), and a Windows share set to the RAW datatype bypasses the Windows driver, so the job must already be in the printer's own language. Ghostscript (installed in the Docker image together with `smbclient`) converts the PDF.

On the native Windows server there is no `smbclient`: a share is connected with `net use` (the password goes in its arguments: with `*` it reads it from the console, never from a piped input, and fails with error 86) and the job is copied to it with `copy /b`, so the server needs no printer driver. Windows allows one user per server name in a logon session and the service's jobs all share one, so the jobs of a server run one at a time, and a connection refused because the server already has one (another user, or left by an earlier run) is dropped and made again once. Checked on a Windows dev machine against `\\127.0.0.1\IPC$` (reconnect, error 1219, queued jobs), not yet against the printers.

### Fields per printer

| Field                                                                     | IPP     | Shared (both) | Intermec | TSC      |
| ------------------------------------------------------------------------- | ------- | ------------- | -------- | -------- |
| `name`, `kind`, `address` (bare IP or host name, no scheme, port or path) | yes     | yes           | yes      | yes      |
| `shareName` (name only, no `\\host\`)                                     | cleared | required      | required | cleared  |
| `username`, `password`                                                    | cleared | optional      | optional | cleared  |
| `labelWidthMm`, `labelLengthMm` (positive integers)                       | cleared | cleared       | required | required |
| `forTags` (boolean, default false)                                        | yes     | yes           | yes      | yes      |

Changing a printer to another kind clears the fields that kind does not use. The label size is stored per printer; both label encoders fit each page onto it and rotate it when needed (`pdfToLabelImages`). The head resolution (203 dpi) is still a constant (`LABEL_DPI`).

### Password handling

The password is stored in plain text in the `printer` table and is **server-only**:

- The PowerSync stream `printer` in `docker/powersync/sync-config.yaml` lists the columns one by one and leaves it out. Never use `SELECT *` there.
- tRPC returns `PUBLIC_PRINTER_COLUMNS`, the client schema has no `password`, and the edit form always starts with it empty.
- Saving with an empty password keeps the stored one.

Credentials for seeded printers live only in the git-ignored `src/db/migration_scripts/secrets.py`.

### Ping

The ping button of the maintenance table (admin) checks reachability with a 10 s timeout:

- IPP: `Get-Printer-Attributes`.
- Shares: `smbclient -c queue`, so it also verifies the share name, user and password.

A failure is logged (`printerPingFailed`) and shows "X no responde". A failed print logs `printerPrintFailed`, or `printerFileReadFailed` when the PDF cannot be read, and shows "No se pudo enviar el archivo a X". Printing has a 60 s timeout.

### Safety

`printer.print` only accepts `filePath` values under `/api/files/` without `..` or its encoded form `%2e`, and fetches them from the app itself (`http://localhost:$PORT`), sending the caller's cookies so the files that need the admin session (invoices) can be read.

## The shop's printers

| Name in the app    | Device                        | Address                                    | Kind            | Notes                                                                                                                                                                                                                                                                                  |
| ------------------ | ----------------------------- | ------------------------------------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MESA VALENTIN      | Brother MFC-L2710DW (network) | `192.168.1.150`                            | `ipp`           | IPP on 631. Accepts only `image/pwg-raster` (sgray_8, 600 dpi), `image/urf` and `application/octet-stream`, no PDF. A test label printed correctly through `tscRaw` (size, orientation, bit polarity), with the whole print shifted slightly towards the top-left corner of the label. |
| ETIQUETAS Intermec | Intermec PC43d (USB)          | `192.168.1.128`, share `EtiquetasIntermec` | `intermecShare` | Labels 52 × 107 mm, 203 dpi, 416 × 855 dots. Printed and verified with test labels.                                                                                                                                                                                                    |
| ALBARANES Brother  | Brother HL-L2310D (USB)       | `192.168.1.128`, share `Albaranes`         | `brotherShare`  | Output checked offline (A4, portrait), never printed on paper.                                                                                                                                                                                                                         |
| TARJETAS TSC       | TSC TE210 (network)           | `192.168.1.200`                            | `tscRaw`        | Labels 100 × 70 mm, 203 dpi. A test label printed correctly, see its section.                                                                                                                                                                                                          |

`192.168.1.128` is a Windows PC that shares the two USB printers, both with the RAW datatype. The Windows user is `DESKTOP-JFGQ3QH\impresoras`; its password is in `secrets.py`. Equivalent manual check: `net use \\192.168.1.128\EtiquetasIntermec /user:DESKTOP-JFGQ3QH\impresoras <password>`.

Seeding: `seed_printers` in `src/db/migration_scripts/seed.py`, data in `secrets.py`, dataclass `Printer` in `models.py`. An existing database needs the new `printer` columns (schema change in `src/db/schema.ts`).

### Intermec PC43d (Direct Protocol)

Learned from test labels:

- It speaks Direct Protocol (DP), not ZPL or IPL.
- A label is sent as: `CLL`, `IMAGE LOAD "RESANORP.1",<size>,""` followed by **CR only**, the PCX bytes, then `PP 0,0`, `PM "RESANORP.1"`, `PF`, `REMOVE IMAGE "RESANORP.1"` and `CLL` (see `intermecDirectProtocolLabel`).
- A CRLF after `IMAGE LOAD` corrupts the image and nothing prints.
- DP keeps the previous layout between jobs, so a failed image reprints the old label. Every label must start with `CLL`.
- The origin is the label corner. The page must be rasterized at the label size (`-dFIXEDMEDIA -dPDFFitPage`), otherwise it is cropped: the 6 × 4 in tag template is larger than the label.
- One PDF page is one label.

### TSC TE210 (TSPL)

A desktop thermal-transfer label printer, 203 dpi, 108 mm maximum print width, with USB, serial and Ethernet. It speaks TSPL (TSC's own language, plain text commands with a binary bitmap), not Direct Protocol or ZPL. The legacy RAIO application prints its 100 × 70 mm tag on it through the Windows driver "TSC TE210"; the app sends TSPL itself, so no driver is involved. A test label printed correctly through `tscRaw` (size, orientation, bit polarity), with the whole print shifted slightly towards the top-left corner of the label.

- The network card listens on the raw port 9100 (`RAW_PRINT_PORT`), serves a "TE210 Print Server" web page on 80, and answers the model query `~!T` with `TE210` without printing anything.
- A job is `SIZE <w> mm,<l> mm`, then per page `CLS`, `BITMAP 0,0,<bytes per row>,<rows>,0,<data>` and `PRINT 1,1`. The page is rasterized by Ghostscript (`pbmraw`) at the label size, like the Intermec.
- The BITMAP marks a dot to print with a 0 bit, so the PBM bits are inverted.
- `GAP` is not sent: the printer keeps the gap it was calibrated with.
- The raw port answers nothing, so a job is sent when the data has been handed to the network, and a ping only opens a connection.
- Give it a fixed IP (or a router reservation): a printer on DHCP can change address and the stored one stops working.

### Brother HL-L2310D

The app sends it the PCL dialect of the open-source `brlaser` driver, which lists this model. `brlaser` is a CUPS filter and the Windows server has no CUPS, so `pbmPagesToBrotherLaser` in `src/files/printer.ts` writes the same job from each page rasterized by Ghostscript (`pbmraw`, 1 bit, 600 dpi): 128 NUL bytes, a PJL header (`@PJL SET PAPER = A4`, portrait), then per page every line as the edits from the line above it, in blocks, starting again from a whole line every 64 lines.

It is a port of `job.cc`, `line.cc` and `block.h` of Owl-Maintain/brlaser 6.2.7 (GPL), checked byte for byte against its `rastertobrlaser` on every PDF of `src/tests/mock-data` fed the same bitmap. `printer-lib.test.ts` keeps that check with the hash of the job `rastertobrlaser` wrote for `createBrotherTestPbm`. The paper size is always A4, as `brlaser` did for the raster Ghostscript gave it.

The printer starts every line about 5 mm in from the left edge of the paper, and `brlaser` leaves that to the application: an albarán with 1 cm margins printed with 16 mm on the left and 6 mm on the right. So 5 mm of dots (`BROTHER_LEFT_OFFSET_MM`, cut in whole bytes) are cut from the left of every line. The top printed at about 15 mm, which may be the same offset downwards; it is not corrected.

### Not covered yet

- No real document has been printed through the whole app path on either real printer.
- Adding a printer or language means a new `PrinterKind`, an encoder in `src/files/printer.ts`, the form fields, and the label in `src/messages/printer.ts`.

## Tests

The printer tests pass against the final code (they need `bun run test:restart`, which rebuilds the image). The first run after a rebuild can fail on a click that waits for a dialog that is still re-rendering: rerun it with the stack warm.

- `src/tests/e2e/printer-lib.test.ts`: schemas, per-kind rules, the sync stream containing no password, the `filePath` guard.
- `src/tests/e2e/maintenance/printer.test.ts`: maintenance CRUD, ping, password hiding and keeping, kind switching.
- `src/tests/e2e/printing.test.ts`: the combobox and every document, on every kind, and a tag on a printer for tags.
- Mocks (`docker/docker-compose.test.yml`):
  - `mock-printer` (`src/tests/mock-printer.ts`): IPP server with the hosts `mock-printer` and `mock-printer-rejecting`, and a raw port 9100 that saves each job as `.raw`. An offline printer uses a `.invalid` host.
  - `mock-printer-share` (`src/tests/mock-printer-share/`): Samba with the print shares `labels` and `laser`.
  - Jobs are saved in `PRINTER_JOBS_PATH` (`envs/test/PRINTER_JOBS`) and parsed by `src/tests/utils/mock-printer.ts`.
