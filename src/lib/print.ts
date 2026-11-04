// A PDF served into a hidden iframe is printed by the browser itself, so the number of copies has to
// come baked into the document: the print dialog is the user's, not ours to configure.
export function printPdfUrl(url: string) {
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = url;
  iframe.onload = () => {
    const iframeWindow = iframe.contentWindow;
    if (iframeWindow === null) {
      iframe.remove();
      return;
    }
    iframeWindow.addEventListener("afterprint", () => {
      iframe.remove();
    });
    iframeWindow.focus();
    iframeWindow.print();
  };
  document.body.append(iframe);
}

// An empty download attribute makes the browser use the file name sent by the server
export function downloadUrl(url: string, fileName = "") {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
}
