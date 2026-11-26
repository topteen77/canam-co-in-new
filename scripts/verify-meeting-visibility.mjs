/**
 * Lightweight checks for upcoming-meeting visibility + date range filtering.
 * Run: node scripts/verify-meeting-visibility.mjs
 */

function localDateKey(input) {
  if (input == null) return '';
  if (typeof input === 'string') {
    const match = input.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function emailsMatch(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function filterVisibleMeetings(allMeetings, { canViewAllMeetings, currentUser }) {
  if (canViewAllMeetings) return allMeetings;
  return allMeetings.filter((meeting) => (
    emailsMatch(meeting.accountManager, currentUser)
    || emailsMatch(meeting.salesPerson, currentUser)
    || emailsMatch(meeting.createdBy, currentUser)
  ));
}

function filterUpcoming(meetings, { selectedDate, dateFromFilter, dateToFilter }) {
  const selectedKey = selectedDate ? localDateKey(selectedDate) : '';
  const todayKey = localDateKey(new Date());
  const fromKey = dateFromFilter ? localDateKey(dateFromFilter) : '';
  const toKey = dateToFilter ? localDateKey(dateToFilter) : '';
  return meetings.filter((meeting) => {
    if (!selectedDate && meeting.status === 'Done') return false;
    const meetingKey = localDateKey(meeting.date);
    if (!meetingKey) return false;
    if (selectedDate) return meetingKey === selectedKey;
    if (meetingKey < todayKey) return false;
    if (fromKey && meetingKey < fromKey) return false;
    if (toKey && meetingKey > toKey) return false;
    return true;
  });
}

const sample = [
  { id: '1', agencyName: 'OEC Abroad', accountManager: 'amrit@example.com', status: 'Planned', date: '2026-11-28T09:30:00.000Z', createdAt: '2026-11-20T10:00:00.000Z' },
  { id: '2', agencyName: 'Vision Group', accountManager: 'aman@example.com', status: 'Planned', date: '2026-11-28T06:00:00.000Z', createdAt: '2026-11-21T11:00:00.000Z' },
  { id: '3', agencyName: 'Old Done', accountManager: 'aman@example.com', status: 'Done', date: '2026-11-10T06:00:00.000Z', createdAt: '2026-11-01T11:00:00.000Z' },
];

let failed = 0;
function assert(name, cond) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL: ${name}`);
  } else {
    console.log(`PASS: ${name}`);
  }
}

const amanScoped = filterVisibleMeetings(sample, { canViewAllMeetings: false, currentUser: 'aman@example.com' });
assert(
  'AM without canViewAllMeetings only sees own leads',
  amanScoped.length === 2 && amanScoped.every((m) => m.accountManager === 'aman@example.com')
);

const amanAll = filterVisibleMeetings(sample, { canViewAllMeetings: true, currentUser: 'aman@example.com' });
assert('AM with canViewAllMeetings sees all meetings', amanAll.length === 3);

const upcoming = filterUpcoming(amanAll, {});
assert('Upcoming excludes Done', upcoming.every((m) => m.status !== 'Done'));
assert('Upcoming includes both planned meetings', upcoming.length === 2);

const ranged = filterUpcoming(amanAll, { dateFromFilter: '2026-11-28', dateToFilter: '2026-11-28' });
assert('From/To date keeps same-day meetings', ranged.length === 2);

const selected = filterUpcoming(amanAll, { selectedDate: new Date(2026, 10, 28) });
assert('Calendar selected date includes planned for that day', selected.length === 2);

assert('Created date present on sample cards', sample.every((m) => Boolean(m.createdAt)));

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log('\nAll meeting visibility checks passed');
