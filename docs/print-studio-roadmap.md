# Print Studio — staged delivery
## Stage 1: cover editor
- Separate development preview (no public navigation until integrated).
- Local vector background assets, basic Korean system fonts, front/back/spine text layers, drag and numeric positions, undo/redo, JSON project files.
- Millimeter geometry with bleed and safe area, estimated spine using sheet thickness and duplex rounding.
- Browser print-to-PDF with exact CSS page size, no raster screenshot. Font embedding and print driver/output dimensions depend on browser; verify generated PDF before production. No claim of PDF/X or CMYK. Browser-native output only for this stage.
- No Firebase upload or real order submission yet.
## Stage 2
- Implemented: PDF/image local inspection, independent sides/pages, actual/fit scale, rotation, centered repeated grid, bleed/safe/trim guides, half/Z/roll folds with mirrored panel widths, warnings. PDF.js 4.10.38 loaded from pinned CDN only for PDF. Image DPI is user-set assumption; PDF page view is not automatic TrimBox/BleedBox analysis. Preview is not a printable imposed export. Original files stay in browser; PDF engine real-file validation and PC/mobile checks pending.
## Stage 3
- Implemented administrator-only configuration, private drafts and public projection, custom JPG/PNG designs (original bytes), visibility controls and deletion retry, real measured paper caliper presets, additional output sheet presets, default bleed/safe margins/fold compensation, editor consumption. Hidden assets are unlisted rather than access-revoked until deleted. Production rules and real uploads remain unverified.
## Stage 4
- Order attachment handoff and final PDF export/verification, desktop/mobile tests, publication.

### Stage 4a: layout PDF export (development)
- Added direct PDF download using pinned PDF-lib: original PDF pages embedded as vector forms (not preview bitmaps), original PNG pixels and full-resolution JPEG/WebP decode, front/back output sheets, crop clipping, no preview guides. Unsupported encrypted/special-unit PDFs and out-of-sheet layouts fail explicitly. Not PDF/X or CMYK certified; preflight/physical duplex checks remain required.
- Added real PDF output dimension and extractable text regression tests. Order attachment handoff and public navigation remain deferred until output and security checks pass.
