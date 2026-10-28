import { supabase } from '../../config/supabase.js';

export async function notifyMatchOwners(reportIds, event, matchId = null) {
  try {
    const ids = [...new Set((reportIds || []).filter(Boolean))];
    if (ids.length < 2) return;

    const { data: reports, error } = await supabase
      .from('reports')
      .select('id, type, title, owner_user_id')
      .in('id', ids);

    if (error) {
      console.error('Could not load report owners for notifications:', error);
      return;
    }

    const lost = (reports || []).find((r) => r.type === 'lost');
    const found = (reports || []).find((r) => r.type === 'found');
    if (!lost || !found) return;

    const recipients = new Map();

    for (const report of [lost, found]) {
      const recipientId = report.owner_user_id;
      if (!recipientId || recipientId === (report.id === lost.id
        ? found.owner_user_id : lost.owner_user_id)) continue;

      const partner = report.id === lost.id ? found : lost;
      if (!recipients.has(recipientId)) {
        recipients.set(recipientId, { own: report, partner });
      }
    }

    const returned = event === 'returned';
    const closed = event === 'closed';
    const rows = [...recipients.entries()].map(([recipient_id, pair]) => ({
      recipient_id,
      title: closed
        ? 'Your matched case has been closed'
        : returned
          ? 'Matched item marked as returned'
          : 'Your item has a confirmed match',
      message: closed
        ? `The matched case for “${pair.own.title || 'your report'}” has been closed by an admin.`
        : returned
          ? `The matched case for “${pair.own.title || 'your report'}” has been marked as returned.`
          : `An admin confirmed a match for “${pair.own.title || 'your report'}”. Open the matching report to review the item.`,
      type: closed ? 'info' : returned ? 'returned' : 'match',
      priority: 'normal',
      read: false,
      meta: {
        event,
        reportId: pair.partner.id,
        reportType: pair.partner.type,
        partnerReportId: pair.partner.id,
        ownReportId: pair.own.id,
        lostReportId: lost.id,
        foundReportId: found.id,
        matchId,
      },
    }));

    if (!rows.length) return;

    const { error: insertError } = await supabase
      .from('notifications')
      .insert(rows);

    if (insertError) {
      console.error('Could not create mobile match notifications:', insertError);
    }
  } catch (error) {
    // Notifications must not undo an approved match or returned item.
    console.error('Unexpected mobile match notification error:', error);
  }
}
