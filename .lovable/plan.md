Assumptions:
- Because the selected elements are all in `src/pages/Login.tsx`, I interpret “remove” as removing the selected marketing/hero copy from the login page.
- This means removing the tagline, headline, description, and the three highlight tiles from the desktop hero panel.
- This does not mean rolling back the inter-profit-center transfer feature or changing backend/database behavior.

Impact report:
- Data Impact: None. No schema, RLS, historical data, roles, or audit logs are affected.
- Workflow Impact: None. Login behavior remains unchanged.
- UI/UX Impact: The left desktop hero panel will keep the background image, logo, and “Employee portal” badge, but the selected marketing text/highlight block will be removed.
- Regression Risk: Low. The main risk is unused code (`highlights`) remaining after removing the block.
- Mitigation Plan: Remove only the selected text block and the now-unused `highlights` constant; avoid touching authentication logic, forms, routing, documentation, policy, or backend files.

Implementation plan:
1. Update `src/pages/Login.tsx`
   - Remove the selected hero marketing content block:
     - “Industrial enterprise access”
     - “Plant intelligence from furnace floor to management report.”
     - the descriptive paragraph
     - the three highlight cards
   - Remove the `highlights` array if it becomes unused.

2. Verify scope
   - Confirm no login form/authentication logic is changed.
   - Confirm no backend/database files are changed.
   - Confirm the file has no unused `highlights` reference.

Documentation/policy note:
- This is a visual content removal only and does not alter technical behavior or business policy. I will not update `DOCUMENTATION.md` or `POLICY.md` unless you want the login-page copy/content documented there.