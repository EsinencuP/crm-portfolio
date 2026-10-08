export type PdfEmailAttachment = { filename: string; contentType: "application/pdf"; content: Uint8Array };
const encode = (data: Uint8Array | string) =>
  Buffer.from(data)
    .toString("base64")
    .match(/.{1,76}/g)
    ?.join("\r\n") ?? "";
export function emailMimeContent(html: string, attachments: PdfEmailAttachment[], boundary: string) {
  if (!attachments.length)
    return ["Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", encode(html), ""];
  return [
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    encode(html),
    ...attachments.flatMap((file) => [
      `--${boundary}`,
      `Content-Type: ${file.contentType}`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${file.filename}"`,
      "",
      encode(file.content),
    ]),
    `--${boundary}--`,
    "",
  ];
}
export const graphPdfAttachments = (attachments: PdfEmailAttachment[]) =>
  attachments.map((file) => ({
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: file.filename,
    contentType: file.contentType,
    contentBytes: Buffer.from(file.content).toString("base64"),
  }));
