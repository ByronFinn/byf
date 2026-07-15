/**
 * image-format-policy — gate which image MIME types reach the model.
 *
 * The model only reliably accepts a closed set of image MIME types as
 * multimodal input. Anything outside that set (HEIC/AVIF/BMP/TIFF/ICO/…)
 * is rejected at the ReadMediaFile gate with a conversion hint, so an
 * unsupported format never silently poisons the prompt as an unusable
 * data URL. MIME detection itself is delegated to `file-type.ts`
 * (magic-byte + extension sniffing) — this module only enforces policy.
 */

/**
 * Image MIME types models reliably accept as multimodal input.
 * Everything outside this set is rejected at the ReadMediaFile gate with a
 * conversion hint, so unsupported formats never silently poison the prompt.
 */
export const MODEL_ACCEPTED_IMAGE_MIMES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export type ImageFormatGateResult =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly notice: string };

const ACCEPTED_FORMATS_LABEL = 'png, jpeg, gif, webp';

/**
 * Build a short, platform-aware conversion hint. One example command per
 * platform, using a generic `input.<ext>` → `output.jpg` pattern.
 */
function conversionHint(): string {
  if (process.platform === 'darwin') {
    return 'Convert first, e.g. on macOS: `sips -s format jpeg input.heic --out output.jpg`';
  }
  return 'Convert first, e.g. on Linux/Windows: `heif-convert input.heic output.jpg` (or ImageMagick `magick input.heic output.jpg`)';
}

/**
 * Decide whether an image (already sniffed to a MIME by `detectFileType`)
 * is accepted by the model, producing a human-readable rejection notice
 * when it is not.
 *
 * Accepted → `{ accepted: true }`.
 * Rejected → `{ accepted: false, notice }` naming the MIME, listing the
 * accepted formats, and including a platform-aware conversion command.
 */
export function gateImageFormat(mimeType: string): ImageFormatGateResult {
  if (MODEL_ACCEPTED_IMAGE_MIMES.has(mimeType)) {
    return { accepted: true };
  }
  const notice =
    `Image format ${mimeType} is not supported as model input. ` +
    `Accepted formats: ${ACCEPTED_FORMATS_LABEL}. ` +
    conversionHint();
  return { accepted: false, notice };
}
