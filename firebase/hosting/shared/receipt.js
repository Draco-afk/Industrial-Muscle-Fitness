// Opens a receipt in its own window and fires the print dialog.
//
// The Apps Script original built a PDF blob server-side with
// Utilities.newBlob(...).getAs('application/pdf'). Cloud Functions has no
// equivalent, so the server returns receipt HTML instead and the browser's
// own print-to-PDF does the rest — same end result for the user, one less
// moving part.
export function openReceiptWindow(html) {
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) {
    alert('เบราว์เซอร์บล็อกหน้าต่างใหม่ กรุณาอนุญาต pop-up ของเว็บนี้แล้วลองใหม่');
    return;
  }
  w.document.write(html);
  w.document.close();
  // Let the receipt's own styles/fonts settle before the print dialog steals focus.
  w.onload = () => setTimeout(() => w.print(), 300);
}

// Offer to print straight after taking payment, matching the original's
// "ต้องการพิมพ์ใบเสร็จ (RC...) เลยหรือไม่?" confirm.
export async function offerReceiptPrint(callServer, fnName, receiptNo) {
  if (!receiptNo) return;
  if (!confirm(`ต้องการพิมพ์ใบเสร็จ (${receiptNo}) เลยหรือไม่?`)) return;
  const res = await callServer(fnName, { receiptNo });
  if (!res.success) { alert(res.message); return; }
  openReceiptWindow(res.html);
}
