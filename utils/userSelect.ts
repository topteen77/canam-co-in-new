export type SelectUser = {
  id?: string;
  name?: string;
  email?: string;
  role?: string;
  status?: string;
};

export function isInactiveUser(user: SelectUser | null | undefined): boolean {
  if (!user) return false;
  const status = String(user.status || '').trim().toLowerCase();
  if (!status) return /\binactive\b/i.test(String(user.name || ''));
  if (status === 'active' || status === 'pending' || status === 'approved') return false;
  return status === 'inactive' || status === 'deactivated' || status === 'disabled' || status === 'blocked';
}

function compareUserName(a: SelectUser, b: SelectUser): number {
  const left = (a.name || a.email || '').trim();
  const right = (b.name || b.email || '').trim();
  return left.localeCompare(right, undefined, { sensitivity: 'base' });
}

export function partitionUsersForSelect<T extends SelectUser>(users: T[] = []): { active: T[]; inactive: T[] } {
  const active: T[] = [];
  const inactive: T[] = [];
  users.forEach((user) => {
    if (isInactiveUser(user)) inactive.push(user);
    else active.push(user);
  });
  active.sort(compareUserName);
  inactive.sort(compareUserName);
  return { active, inactive };
}

export function inactiveUserLabel(name: string): string {
  const label = (name || '').trim();
  if (!label) return 'Inactive';
  if (/\binactive\b/i.test(label)) return label;
  return `${label} (Inactive)`;
}
