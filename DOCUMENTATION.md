# DOCUMENTATION

## Overview
This application provides an employee portal entry flow for BFCL SteelFlow ERP. The public login page supports employee sign-in and password reset for existing accounts.

## Authentication Behavior
- The `/login` page is sign-in only.
- Employees cannot self-register from the public interface.
- Password reset remains available from the login screen for existing accounts.
- User accounts are provisioned separately by administrators.

## Technical Notes
- Public sign-in uses the existing client authentication flow.
- The public login page does not create or modify user accounts.
- Profile and role records remain managed by the existing backend/auth flows.

## Version History
- 2026-04-23: Removed self-service signup from the public login page and retained sign-in plus password reset only.
