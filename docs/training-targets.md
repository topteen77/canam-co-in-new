---
created: 2026-11-13 15:26 +0530
updated: 2026-11-13 15:31 +0530
area: training-targets
status: implemented
---

# Training, Onboarding & Target Setting

Admin manage page under Users in the sidebar. Team members open training docs and tool links; admins upload Word/PDF (max 5MB, up to 10 files) and set team targets.

| id | task | status | created | started | implemented | undone | files |
| --- | --- | --- | --- | --- | --- | --- | --- |
| api | DB tables + API for training docs and team targets | implemented | 2026-11-13 15:26 +0530 | 2026-11-13 15:26 +0530 | 2026-11-13 15:31 +0530 | | server/services/trainingTargetsService.js, server/index.js |
| ui | Admin/team Training & Targets page with upload + tool links + targets | implemented | 2026-11-13 15:26 +0530 | 2026-11-13 15:28 +0530 | 2026-11-13 15:31 +0530 | | components/TrainingTargets.tsx, services/trainingTargetsService.ts |
| nav | Sidebar under Users + App view wiring | implemented | 2026-11-13 15:26 +0530 | 2026-11-13 15:30 +0530 | 2026-11-13 15:31 +0530 | | components/Sidebar.tsx, utils/appView.ts, App.tsx |
