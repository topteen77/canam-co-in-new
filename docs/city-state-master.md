---
created: 2026-11-12 14:05 +0530
updated: 2026-11-12 14:11 +0530
area: city-state-master
status: implemented
---

# City & State Master (admin)

Admin-only sidebar links to fix city↔state mapping used by Partner Leads filters.

| id | task | status | created | started | implemented | undone | files |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api | Add location master DB + API | implemented | 2026-11-12 14:05 +0530 | 2026-11-12 14:06 +0530 | 2026-11-12 14:11 +0530 | | server/services/locationMasterService.js, server/data/locationMasterSeed.js, server/index.js |
| ui | Add City Master and State Master admin pages | implemented | 2026-11-12 14:05 +0530 | 2026-11-12 14:08 +0530 | 2026-11-12 14:11 +0530 | | components/LocationMaster.tsx, services/locationMasterService.ts |
| wire | Wire sidebar + App routes and filter overrides | implemented | 2026-11-12 14:05 +0530 | 2026-11-12 14:09 +0530 | 2026-11-12 14:11 +0530 | | components/Sidebar.tsx, App.tsx, utils/appView.ts, utils/locationSuggest.ts |
| fix | Correct default Chandigarh city mapping | implemented | 2026-11-12 14:05 +0530 | 2026-11-12 14:07 +0530 | 2026-11-12 14:11 +0530 | | utils/locationSuggest.ts, server/data/locationMasterSeed.js, server/services/locationMasterService.js |
