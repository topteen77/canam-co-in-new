import React from 'react';
import {
  inactiveUserLabel,
  partitionUsersForSelect,
  type SelectUser,
} from '../utils/userSelect';

type UserFilterOptionsProps<T extends SelectUser> = {
  users: T[];
  /** When false (default), inactive users are omitted. Set true to list them greyed at the end. */
  includeInactive?: boolean;
  getValue?: (user: T) => string;
  getLabel?: (user: T) => string;
};

export function UserFilterOptions<T extends SelectUser>({
  users,
  includeInactive = false,
  getValue,
  getLabel,
}: UserFilterOptionsProps<T>) {
  const { active, inactive } = partitionUsersForSelect(users);
  const valueOf = (user: T) => (getValue ? getValue(user) : String(user.email || user.id || ''));
  const labelOf = (user: T) => (getLabel ? getLabel(user) : String(user.name || user.email || ''));

  return (
    <>
      {active.map((user) => (
        <option key={user.id || user.email} value={valueOf(user)}>
          {labelOf(user)}
        </option>
      ))}
      {includeInactive &&
        inactive.map((user) => (
          <option
            key={user.id || user.email}
            value={valueOf(user)}
            data-inactive="true"
            className="text-slate-400"
            style={{ color: '#94a3b8' }}
          >
            {inactiveUserLabel(labelOf(user))}
          </option>
        ))}
    </>
  );
}
