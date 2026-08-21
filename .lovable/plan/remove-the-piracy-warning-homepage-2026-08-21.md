# Remove the piracy-warning homepage

## Goal
Replace the current `src/pages/Index.tsx` (the "ESTA EXTENSÃO FOI PIRATEADA" full-screen warning) with the original SteelFlow employee-portal landing page that existed before the warning was introduced.

## Context (verified)
- Current `src/pages/Index.tsx` renders a Portuguese piracy/block warning with a WhatsApp button (`https://wa.me/5591985837992`) and the phone number `(91) 98583-7992`.
- The pre-warning version is recoverable from git (`HEAD~5`) and is a proper landing page: hero image, BFCL logo, "Employee sign in" / "Access portal" buttons routing to `/login`, plus readiness and module cards.
- The hero asset `src/assets/steel-plant-hero.jpg` still exists on disk and is used by the previous version, so the restore is self-contained.

## Change
- Rewrite `src/pages/Index.tsx` with the recovered original landing-page content (no piracy text, no WhatsApp button, no phone number). No other files are touched; no route, asset, or logic changes.

## Verification
- The `/` route shows the SteelFlow employee portal landing page with the hero image and "Access portal" button.
- No trace of the "PIRATEADA" text, WhatsApp link, or `(91) 98583-7992` phone number remains on the homepage.
- Build/typecheck passes.
