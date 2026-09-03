"""
Shared image handling for the scrapers.

The scrapers used to write whatever bytes a source served, and most billboard
sources serve PNG. PNG is lossless and meant for graphics; for a photograph it
costs ~7x the bytes of a visually identical JPEG, and that weight is paid on
every page view (once on the wire, once in the browser's decoder).

`save_optimized()` re-encodes fully-opaque PNGs as progressive JPEG at write
time, so new scrapes never reintroduce the heavy files. Rules, matching the
one-off `scripts/optimize-images.py` migration:

  - Only fully-opaque PNGs are converted. Dimensions never change.
  - PNGs with real transparency keep their format (JPEG has no alpha channel).
  - JPEG / WebP / anything Pillow can't parse is written through unchanged.

Everything is offline (Pillow only) - no network, no external service.
"""
from __future__ import annotations

import io
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - Pillow is a scraper dependency
    Image = None  # type: ignore[assignment]

JPEG_QUALITY = 85
_VARIANT_EXTS = (".jpg", ".jpeg", ".png", ".webp")


def existing_variant(existing_files: set[str], stem: str) -> str | None:
    """
    Return the filename of an already-downloaded image for `stem`
    (e.g. "bih-1234_0"), regardless of which extension a previous run saved it
    under, or None. Lets a re-run skip a file it already has instead of
    re-fetching and re-encoding it.
    """
    for ext in _VARIANT_EXTS:
        name = f"{stem}{ext}"
        if name in existing_files:
            return name
    return None


def _is_fully_opaque(img: "Image.Image") -> bool:
    if img.mode not in ("RGBA", "LA", "PA"):
        return True
    alpha = img.convert("RGBA").getchannel("A")
    return alpha.getextrema()[0] == 255


def save_optimized(data: bytes, fpath: Path) -> str:
    """
    Write `data` to `fpath`, converting an opaque PNG to a progressive JPEG
    beside it (same basename, `.jpg`). Returns the name of the file actually
    written - which may differ from `fpath.name` when the extension changed.
    """
    if Image is not None:
        try:
            with Image.open(io.BytesIO(data)) as img:
                img.load()
                fmt = (img.format or "").upper()
                if fmt == "PNG" and _is_fully_opaque(img):
                    target = fpath.with_suffix(".jpg")
                    img.convert("RGB").save(
                        target, "JPEG", quality=JPEG_QUALITY,
                        optimize=True, progressive=True,
                    )
                    return target.name
        except Exception:
            pass  # unparseable or odd image - fall through to a raw write

    with open(fpath, "wb") as f:
        f.write(data)
    return fpath.name
