---
created: 2026-11-28 12:50 +0530
updated: 2026-11-28 12:52 +0530
area: meeting-start-owner-only
status: implemented
---

# Show others' meetings but only owner can Start

Keep other users' planned meetings visible. Disable Start unless the signed-in user is the meeting scheduler (`createdBy`). Enforce on API too.

| id | task | status | created | started | implemented | undone | files |
| --- | --- | --- | --- | --- | --- | --- | --- |
| start-owner | Block Start on meetings scheduled by someone else | implemented | 2026-11-28 12:50 +0530 | 2026-11-28 12:50 +0530 | 2026-11-28 12:52 +0530 | | shared/meetingCheckInIdentity.js, components/ItineraryDisplay.tsx, components/SimpleMeetingCheckIn.tsx, components/MeetingCheckInModal.tsx, server/index.js |
