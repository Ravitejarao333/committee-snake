export interface ShareResult {
  via: "share" | "download" | "cancelled";
  w: number;
  h: number;
  bytes: number;
}

export type CopyResult = "ok" | "unsupported" | "failed";

interface ShareFile {
  fileName: string;
  /** The PNG's size, reported back in the result. */
  w: number;
  h: number;
}

/** Native share sheet when it takes files, otherwise a download. */
export async function sharePng(png: Promise<Blob>, f: ShareFile): Promise<ShareResult> {
  const blob = await png;
  const done = (via: ShareResult["via"]): ShareResult => ({
    via,
    w: f.w,
    h: f.h,
    bytes: blob.size,
  });
  const file = new File([blob], f.fileName, { type: "image/png" });
  const data: ShareData = { files: [file], url: location.href };
  if (navigator.canShare?.(data)) {
    try {
      await navigator.share(data);
      return done("share");
    } catch {
      // Dismissed, or the sheet refused the file: nothing more to do.
      return done("cancelled");
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = f.fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return done("download");
}

/** Copy the PNG to the clipboard, where ClipboardItem exists. */
export async function copyPng(png: Promise<Blob>): Promise<CopyResult> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return "unsupported";
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    return "ok";
  } catch {
    return "failed";
  }
}
