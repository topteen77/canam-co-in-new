---
created: 2026-11-28 12:30 +0530
updated: 2026-11-28 12:32 +0530
area: meeting-active-leadname
status: implemented
---

# Active meeting lock + always save client name

| id | task | status | created | started | implemented | undone | files |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ui-lock | Disable other Start meeting buttons while user has active meeting | implemented | 2026-11-28 12:30 +0530 | 2026-11-28 12:30 +0530 | 2026-11-28 12:32 +0530 | | components/ItineraryDisplay.tsx |
| leadname | Always resolve/save leadName; pass full lead list to check-in | implemented | 2026-11-28 12:30 +0530 | 2026-11-28 12:30 +0530 | 2026-11-28 12:32 +0530 | | components/SimpleMeetingCheckIn.tsx, App.tsx |
| server-guard | Block second active check-in; fill leadName from lead if missing | implemented | 2026-11-28 12:30 +0530 | 2026-11-28 12:31 +0530 | 2026-11-28 12:32 +0530 | | server/index.js |
