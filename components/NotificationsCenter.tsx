import React, { useMemo, useState } from 'react';
import type {
  CRMNotification,
  NotificationCategory,
  NotificationPreferences
} from '../utils/notifications';

interface NotificationsCenterProps {
  notifications: CRMNotification[];
  readNotificationIds: Set<string>;
  onMarkRead: (notificationId: string) => void;
  onMarkUnread: (notificationId: string) => void;
  onMarkAllRead: () => void;
  onDismissNotification?: (notificationId: string) => void;
  onNavigateToLead?: (leadId: string, followUpId?: string) => void;
  preferences: NotificationPreferences;
  onMuteCategory: (category: NotificationCategory) => void;
  onUnmuteCategory: (category: NotificationCategory) => void;
  onMuteNotification: (notificationId: string) => void;
  onUnmuteNotification: (notificationId: string) => void;
  onSnoozeNotification: (notificationId: string, minutes: number) => void;
  onClearSnooze: (notificationId: string) => void;
  onBack?: () => void;
  onOpenSettings?: () => void;
}

type StatusFilter = 'all' | 'overdue' | 'today' | 'upcoming' | 'active' | 'muted' | 'snoozed';
type CategoryFilter = 'all' | NotificationCategory;

const categoryDefinitions: Array<{ id: CategoryFilter; label: string; icon: string }> = [
  { id: 'all', label: 'All', icon: '📋' },
  { id: 'call', label: 'Calls', icon: '📞' },
  { id: 'email', label: 'Emails', icon: '📧' },
  { id: 'meeting', label: 'Meetings', icon: '📅' },
  { id: 'assessment', label: 'Assessments', icon: '📝' },
  { id: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { id: 'overdue', label: 'Overdue', icon: '⏰' },
  { id: 'other', label: 'Other', icon: '🔔' }
];

const statusDefinitions: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'All statuses' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Due today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'active', label: 'Active meetings' },
  { id: 'muted', label: 'Muted' },
  { id: 'snoozed', label: 'Snoozed' }
];

const formatRelativeTime = (iso: string) => {
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    const diffMs = Date.now() - date.getTime();
    const mins = Math.round(Math.abs(diffMs) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 14) return `${days}d ago`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
};

const getStatusChip = (status?: string) => {
  switch (status) {
    case 'overdue':
      return { label: 'Overdue', className: 'bg-rose-50 text-rose-700 border-rose-200' };
    case 'upcoming':
      return { label: 'Upcoming', className: 'bg-amber-50 text-amber-800 border-amber-200' };
    case 'active':
      return { label: 'In progress', className: 'bg-sky-50 text-sky-800 border-sky-200' };
    default:
      return null;
  }
};

export const NotificationsCenter: React.FC<NotificationsCenterProps> = ({
  notifications,
  readNotificationIds,
  onMarkRead,
  onMarkUnread,
  onMarkAllRead,
  onDismissNotification,
  onNavigateToLead,
  preferences,
  onMuteCategory,
  onUnmuteCategory,
  onMuteNotification,
  onUnmuteNotification,
  onSnoozeNotification,
  onClearSnooze,
  onBack,
  onOpenSettings
}) => {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // 🟢 SAFE FIX: Robust preference handling
  const safePreferences = preferences || {};
  
  const mutedCategoriesSet = useMemo(
    () => new Set(safePreferences.mutedCategories || []),
    [safePreferences.mutedCategories]
  );

  const mutedNotificationSet = useMemo(
    () => new Set(safePreferences.mutedNotificationIds || []),
    [safePreferences.mutedNotificationIds]
  );

  const snoozedMap = safePreferences.snoozedNotifications || {};

  const now = Date.now();

  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryFilter, number> = {
      all: notifications.length,
      call: 0,
      email: 0,
      meeting: 0,
      assessment: 0,
      whatsapp: 0,
      overdue: 0,
      other: 0
    };

    notifications.forEach((notification) => {
      const category = notification.category;
      if (counts[category] !== undefined) {
        counts[category] += 1;
      } else {
        counts.other += 1;
      }

      if (notification.status === 'overdue') {
        counts.overdue += 1;
      }
    });

    return counts;
  }, [notifications]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !readNotificationIds.has(n.id)).length,
    [notifications, readNotificationIds]
  );

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      // 🟢 SAFE FIX: Null check
      if (!notification) return false;

      const isMuted =
        mutedCategoriesSet.has(notification.category) || mutedNotificationSet.has(notification.id);
      
      let isSnoozed = false;
      if (snoozedMap[notification.id]) {
          try {
              isSnoozed = new Date(snoozedMap[notification.id]).getTime() > now;
          } catch (e) {
              isSnoozed = false;
          }
      }

      if (categoryFilter !== 'all' && notification.category !== categoryFilter) {
        if (!(categoryFilter === 'overdue' && notification.status === 'overdue')) {
          return false;
        }
      }

      switch (statusFilter) {
        case 'overdue':
          if (notification.status !== 'overdue') return false;
          break;
        case 'today':
          if (notification.status !== 'today') return false;
          break;
        case 'upcoming':
          if (notification.status !== 'upcoming') return false;
          break;
        case 'active':
          if (notification.status !== 'active') return false;
          break;
        case 'muted':
          if (!isMuted) return false;
          break;
        case 'snoozed':
          if (!isSnoozed) return false;
          break;
        default:
          break;
      }

      if (searchTerm.trim()) {
        const query = searchTerm.trim().toLowerCase();
        // 🟢 SAFE FIX: Null-safe haystack construction
        const haystack = [
          notification.title || '',
          notification.description || '',
          notification.leadName || '',
          notification.followUpType || ''
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }, [
    notifications,
    categoryFilter,
    statusFilter,
    mutedCategoriesSet,
    mutedNotificationSet,
    snoozedMap,
    now,
    searchTerm
  ]);

  const sortedNotifications = useMemo(
    () =>
      [...filteredNotifications].sort((a, b) => {
          // 🟢 SAFE FIX: Robust date sorting
          const timeA = new Date(a.timestamp).getTime();
          const timeB = new Date(b.timestamp).getTime();
          const validA = isNaN(timeA) ? 0 : timeA;
          const validB = isNaN(timeB) ? 0 : timeB;
          return validB - validA;
      }),
    [filteredNotifications]
  );

  const handleToggleCategoryMute = (category: NotificationCategory) => {
    if (mutedCategoriesSet.has(category)) {
      onUnmuteCategory(category);
    } else {
      onMuteCategory(category);
    }
  };

  return (
    <div className="page-shell px-0 space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Notifications Center</h1>
          <p className="text-sm text-slate-600 mt-1">
            Stay on top of calls, emails, meetings, and assessments. Manage reminders and mute what
            you don’t need.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onMarkAllRead}
            className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-indigo-300"
            disabled={unreadCount === 0}
          >
            Mark all read
          </button>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              title="Notification Settings"
              className="app-icon-btn flex items-center justify-center p-2 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <div className="p-3 sm:p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="text-xs sm:text-sm text-slate-500">Total notifications</div>
          <div className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900">{notifications.length}</div>
        </div>
        <div className="p-3 sm:p-4 rounded-xl border border-blue-200 bg-blue-50 shadow-sm">
          <div className="text-xs sm:text-sm text-blue-800">Unread</div>
          <div className="mt-1 text-2xl sm:text-3xl font-bold text-blue-900">{unreadCount}</div>
        </div>
        <div className="p-3 sm:p-4 rounded-xl border border-red-200 bg-red-50 shadow-sm">
          <div className="text-xs sm:text-sm text-red-800">Overdue follow-ups</div>
          <div className="mt-1 text-2xl sm:text-3xl font-bold text-red-900">{categoryCounts.overdue ?? 0}</div>
        </div>
        <div className="p-3 sm:p-4 rounded-xl border border-purple-200 bg-purple-50 shadow-sm">
          <div className="text-xs sm:text-sm text-purple-800">Muted items</div>
          <div className="mt-1 text-2xl sm:text-3xl font-bold text-purple-900">
            {mutedNotificationSet.size + mutedCategoriesSet.size}
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {categoryDefinitions.map((category) => (
            <button
              key={category.id}
              onClick={() => setCategoryFilter(category.id)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors flex items-center gap-1 ${
                categoryFilter === category.id
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400 hover:text-indigo-600'
              }`}
            >
              <span>{category.icon}</span>
              <span>{category.label}</span>
              <span className="font-semibold">{categoryCounts[category.id] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {statusDefinitions.map((status) => (
              <option key={status.id} value={status.id}>
                {status.label}
              </option>
            ))}
          </select>
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search notifications..."
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 w-full sm:w-56"
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700 mb-2">Muted categories</h2>
        <div className="flex flex-wrap gap-2">
          {(['call', 'email', 'meeting', 'assessment', 'whatsapp', 'other'] as NotificationCategory[]).map(
            (category) => (
              <button
                key={category}
                onClick={() => handleToggleCategoryMute(category)}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  mutedCategoriesSet.has(category)
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-rose-400 hover:text-rose-600'
                }`}
              >
                {mutedCategoriesSet.has(category) ? 'Unmute' : 'Mute'} {category}
              </button>
            )
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        {sortedNotifications.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-slate-300 rounded-xl bg-slate-50">
            <p className="text-sm font-medium text-slate-700">No alerts match your filters</p>
            <p className="text-xs text-slate-500 mt-1">Try another category or clear search.</p>
          </div>
        ) : (
          sortedNotifications.map((notification) => {
            const isRead = readNotificationIds.has(notification.id);
            const isMuted =
              mutedCategoriesSet.has(notification.category) || mutedNotificationSet.has(notification.id);

            let isSnoozed = false;
            try {
              const snoozedUntil = snoozedMap[notification.id];
              isSnoozed = snoozedUntil ? new Date(snoozedUntil).getTime() > now : false;
            } catch (e) {
              // Ignore invalid date
            }

            const statusChip = getStatusChip(notification.status);
            const headline = notification.leadName || notification.title;
            const detail = notification.description;
            const showTitleExtra =
              notification.leadName &&
              notification.title &&
              !notification.title.toLowerCase().includes(String(notification.leadName).toLowerCase());
            const menuOpen = openMenuId === notification.id;

            return (
              <article
                key={notification.id}
                className={`alert-card ${!isRead ? 'alert-card--unread' : ''} ${
                  notification.status === 'overdue' ? 'alert-card--overdue' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`lead-chip ${
                        notification.category === 'call' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                        notification.category === 'email' ? 'bg-sky-50 text-sky-800 border-sky-200' :
                        notification.category === 'meeting' ? 'bg-violet-50 text-violet-800 border-violet-200' :
                        notification.category === 'assessment' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                        notification.category === 'whatsapp' ? 'bg-lime-50 text-lime-800 border-lime-200' :
                        'bg-slate-100 text-slate-700 border-slate-200'
                      }`}>
                        {notification.category}
                      </span>
                      {statusChip && (
                        <span className={`lead-chip ${statusChip.className}`}>{statusChip.label}</span>
                      )}
                      {isMuted && (
                        <span className="lead-chip bg-rose-50 text-rose-700 border-rose-200">Muted</span>
                      )}
                      {isSnoozed && snoozedMap[notification.id] && (
                        <span className="lead-chip bg-violet-50 text-violet-800 border-violet-200">
                          Snoozed {new Date(snoozedMap[notification.id]).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                      {!isRead && (
                        <span className="lead-chip bg-indigo-50 text-indigo-700 border-indigo-200">New</span>
                      )}
                    </div>

                    <h3 className="mt-2 text-[15px] font-semibold text-slate-900 leading-snug break-words">
                      {headline}
                    </h3>
                    {showTitleExtra && (
                      <p className="mt-0.5 text-xs font-medium text-slate-500">{notification.title}</p>
                    )}
                    {detail && (
                      <p className="mt-1 text-[13px] text-slate-600 leading-snug break-words">{detail}</p>
                    )}
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      {formatRelativeTime(notification.timestamp)}
                      <span className="mx-1">·</span>
                      {new Date(notification.timestamp).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>

                <div className="alert-card-actions">
                  {notification.leadId && onNavigateToLead && (
                    <button
                      type="button"
                      onClick={() => onNavigateToLead(notification.leadId!, notification.followUpId)}
                      className="alert-action-btn alert-action-btn--primary"
                    >
                      Open lead
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (isRead) onMarkUnread(notification.id);
                      else onMarkRead(notification.id);
                    }}
                    className="alert-action-btn"
                  >
                    {isRead ? 'Unread' : 'Read'}
                  </button>

                  {isSnoozed ? (
                    <button
                      type="button"
                      onClick={() => onClearSnooze(notification.id)}
                      className="alert-action-btn alert-action-btn--violet"
                    >
                      Resume
                    </button>
                  ) : (
                    <select
                      aria-label="Snooze alert"
                      defaultValue=""
                      onChange={(e) => {
                        const mins = Number(e.target.value);
                        if (mins) onSnoozeNotification(notification.id, mins);
                        e.target.value = '';
                      }}
                      className="alert-action-btn alert-action-btn--select"
                    >
                      <option value="" disabled>
                        Snooze
                      </option>
                      <option value="10">10 min</option>
                      <option value="30">30 min</option>
                      <option value="60">60 min</option>
                    </select>
                  )}

                  <div className="relative ml-auto">
                    <button
                      type="button"
                      onClick={() => setOpenMenuId(menuOpen ? null : notification.id)}
                      className="alert-action-btn"
                      aria-label="More actions"
                      aria-expanded={menuOpen}
                    >
                      More
                    </button>
                    {menuOpen && (
                      <div className="absolute right-0 bottom-full mb-1 z-20 min-w-[9rem] rounded-lg border border-slate-200 bg-white shadow-lg py-1">
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                          onClick={() => {
                            if (isMuted) onUnmuteNotification(notification.id);
                            else onMuteNotification(notification.id);
                            setOpenMenuId(null);
                          }}
                        >
                          {isMuted ? 'Unmute' : 'Mute'}
                        </button>
                        {onDismissNotification && (
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                            onClick={() => {
                              onDismissNotification(notification.id);
                              setOpenMenuId(null);
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );

};

export default NotificationsCenter;