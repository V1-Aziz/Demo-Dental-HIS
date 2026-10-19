// /notifications — mirrors notification.routes.ts and notification.repository.ts.
import { DemoRouter, ok, notFound } from '../router';
import { ALL_ROLES, byDesc } from '../helpers';
import { now } from '../data/time';

export function registerNotifications(r: DemoRouter): void {
  r.get('/notifications', ALL_ROLES, ({ user, query, db }) => {
    const limit = Math.min(parseInt(query['limit'] ?? '20', 10), 100);
    const offset = parseInt(query['offset'] ?? '0', 10);
    const unreadOnly = query['unread'] === 'true';
    const mine = db.tables.Notifications
      .filter(n => n.user_id === user.userId && (!unreadOnly || !n.read_at))
      .sort(byDesc('created_at'));
    const rows = mine.slice(offset, offset + limit).map(n => ({
      notification_id: n.notification_id,
      user_id: n.user_id,
      type: n.type,
      title: n.title,
      message: n.message,
      link_to: n.link_to,
      related_entity_type: n.related_entity_type,
      related_entity_id: n.related_entity_id,
      is_read: !!n.read_at,
      read_at: n.read_at,
      created_at: n.created_at,
    }));
    return ok({ rows, total: mine.length });
  });

  r.get('/notifications/unread-count', ALL_ROLES, ({ user, db }) =>
    ok({ count: db.tables.Notifications.filter(n => n.user_id === user.userId && !n.read_at).length }));

  r.patch('/notifications/mark-all-read', ALL_ROLES, ({ user, db }) => {
    for (const n of db.tables.Notifications) {
      if (n.user_id === user.userId && !n.read_at) {
        n['read_at'] = now();
        n['is_read'] = true;
      }
    }
    db.save();
    return ok(null);
  });

  r.patch('/notifications/:id/read', ALL_ROLES, ({ user, params, db }) => {
    const id = parseInt(params['id'], 10);
    if (isNaN(id)) return notFound();
    const n = db.tables.Notifications.find(x => x.notification_id === id && x.user_id === user.userId && !x.read_at);
    if (n) {
      n['read_at'] = now();
      n['is_read'] = true;
      db.save();
    }
    return ok(null);
  });
}
