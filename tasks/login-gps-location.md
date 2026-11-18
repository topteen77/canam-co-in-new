---
created: 2026-11-13 16:07 +0530
updated: 2026-11-13 16:15 +0530
area: login-gps
status: implemented
---

# Login GPS location

Sign-in waits on a high-accuracy GPS fix and a reverse-geocode lookup. Capture location after the page loads and store it on the session in the background.

| id | task | status | created | started | implemented | undone | files |
| --- | --- | --- | --- | --- | --- | --- | --- |
| login-gps | Stop blocking login on GPS and save location after page load | implemented | 2026-11-13 16:07 +0530 | 2026-11-13 16:07 +0530 | 2026-11-13 16:15 +0530 | | services/authService.ts, services/loginGps.js, shared/loginLocation.js, server/controllers/authController.js, server/services/sessionService.js, server/index.js, App.tsx, scripts/verify-login-location.mjs |
