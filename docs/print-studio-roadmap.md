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
- Admin design assets, real paper caliper presets, safe defaults and access control.
## Stage 4
- Order attachment handoff and final PDF export/verification, desktop/mobile tests, publication.
