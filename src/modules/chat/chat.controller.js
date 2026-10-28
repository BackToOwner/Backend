import { supabase } from '../../config/supabase.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

function check(error, message) {
  if (error) {
    console.error(message, error);
    throw new ApiError(500, message);
  }
}

async function getAuthorizedMatch(matchId, userId) {
  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('id, lost_report_id, found_report_id, status')
    .eq('id', matchId)
    .maybeSingle();

  check(matchError, 'Failed to load match');

  if (!match) {
    throw new ApiError(404, 'Match not found');
  }

  if (match.status !== 'approved') {
    throw new ApiError(403, 'Chat is available only for admin-approved matches');
  }

  const { data: reports, error: reportsError } = await supabase
    .from('reports')
    .select('id, owner_user_id')
    .in('id', [match.lost_report_id, match.found_report_id]);

  check(reportsError, 'Failed to verify match participants');

  const lost = (reports || []).find((r) => r.id === match.lost_report_id);
  const found = (reports || []).find((r) => r.id === match.found_report_id);

  if (!lost || !found) {
    throw new ApiError(404, 'The matched reports could not be found');
  }

  if (
    !userId ||
    (userId !== lost.owner_user_id && userId !== found.owner_user_id)
  ) {
    throw new ApiError(403, 'You are not a participant in this match');
  }

  return match;
}

async function getOrCreateConversation(matchId) {
  const { data, error } = await supabase
    .from('match_conversations')
    .upsert({ match_id: matchId }, { onConflict: 'match_id', ignoreDuplicates: true })
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('Failed to create or load chat conversation:', error);

    // If another request created the row concurrently, load that existing row.
    const { data: existing, error: lookupError } = await supabase
      .from('match_conversations')
      .select('*')
      .eq('match_id', matchId)
      .maybeSingle();

    check(lookupError, 'Failed to load chat conversation');
    if (existing) return existing;

    throw new ApiError(500, 'Failed to open chat conversation');
  }

  if (data) return data;

  const { data: existing, error: lookupError } = await supabase
    .from('match_conversations')
    .select('*')
    .eq('match_id', matchId)
    .single();

  check(lookupError, 'Failed to load chat conversation');
  return existing;
}

export const listMatchMessages = asyncHandler(async (req, res) => {
  const match = await getAuthorizedMatch(req.params.matchId, req.mobileUser.id);
  const conversation = await getOrCreateConversation(match.id);

  const parsedLimit = Number.parseInt(req.query.pageSize, 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 100)
    : 50;

  const { data, error } = await supabase
    .from('match_messages')
    .select('id, conversation_id, sender_id, body, created_at')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  check(error, 'Failed to load chat messages');

  res.json({
    success: true,
    data: {
      matchId: match.id,
      conversationId: conversation.id,
      messages: (data || []).reverse(),
    },
  });
});

export const sendMatchMessage = asyncHandler(async (req, res) => {
  const match = await getAuthorizedMatch(req.params.matchId, req.mobileUser.id);
  const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';

  if (!body) {
    throw new ApiError(400, 'Message cannot be empty');
  }

  if (body.length > 5000) {
  throw new ApiError(400, 'Message cannot exceed 5000 characters');
}

  const conversation = await getOrCreateConversation(match.id);

  const { data: message, error } = await supabase
    .from('match_messages')
    .insert({
      conversation_id: conversation.id,
      sender_id: req.mobileUser.id,
      body,
    })
    .select('id, conversation_id, sender_id, body, created_at')
    .single();

  check(error, 'Failed to send message');

  const { error: updateError } = await supabase
    .from('match_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversation.id);

  // The message is already saved; log this metadata update failure without
  // incorrectly reporting that sending the message failed.
  if (updateError) {
    console.error('Could not update chat conversation timestamp:', updateError);
  }

  // Notify the other participant. Notification failures must not undo a saved message.
  try {
    const { data: reports, error: reportsError } = await supabase
      .from('reports')
      .select('id, title, owner_user_id')
      .in('id', [match.lost_report_id, match.found_report_id]);

    if (reportsError) {
      console.error('Could not load chat notification recipient:', reportsError);
    } else {
      const recipientReport = (reports || []).find(
        (report) =>
          report.owner_user_id &&
          report.owner_user_id !== req.mobileUser.id,
      );

      if (recipientReport) {
        const { error: notificationError } = await supabase
          .from('notifications')
          .insert({
            recipient_id: recipientReport.owner_user_id,
            title: 'New chat message',
            message: `You received a new message about “${recipientReport.title || 'your report'}”.`,
            type: 'comment',
            priority: 'normal',
            read: false,
            meta: {
              event: 'message',
              reportId: recipientReport.id,
              matchId: match.id,
              conversationId: conversation.id,
              messageId: message.id,
            },
          });

        if (notificationError) {
          console.error('Could not create chat notification:', notificationError);
        }
      }
    }
  } catch (notificationError) {
    console.error('Chat notification creation failed:', notificationError);
  }

  res.status(201).json({ success: true, data: message });
});

export const markMatchConversationRead = asyncHandler(async (req, res) => {
  const match = await getAuthorizedMatch(req.params.matchId, req.mobileUser.id);
  const conversation = await getOrCreateConversation(match.id);
  const lastReadAt = new Date().toISOString();

  const { error } = await supabase
    .from('match_conversation_reads')
    .upsert(
      {
        conversation_id: conversation.id,
        user_id: req.mobileUser.id,
        last_read_at: lastReadAt,
      },
      { onConflict: 'conversation_id,user_id' },
    );

  check(error, 'Failed to mark chat messages as read');

  res.json({
    success: true,
    data: { matchId: match.id, lastReadAt },
  });
});

export const getMyChatUnreadSummary = asyncHandler(async (req, res) => {
  const userId = req.mobileUser.id;

  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select('id, lost_report_id, found_report_id')
    .eq('status', 'approved');

  check(matchesError, 'Failed to load approved matches');

  const approvedMatches = matches || [];
  const reportIds = [...new Set(approvedMatches.flatMap((match) => [
    match.lost_report_id,
    match.found_report_id,
  ]))];

  if (!reportIds.length) {
    return res.json({
      success: true,
      data: { byReportId: {}, totalUnreadMessages: 0 },
    });
  }

  const { data: reports, error: reportsError } = await supabase
    .from('reports')
    .select('id, owner_user_id')
    .in('id', reportIds);

  check(reportsError, 'Failed to load report owners');

  const reportById = new Map((reports || []).map((report) => [report.id, report]));
  const participantMatches = approvedMatches.filter((match) => {
    const lost = reportById.get(match.lost_report_id);
    const found = reportById.get(match.found_report_id);
    return lost?.owner_user_id === userId || found?.owner_user_id === userId;
  });

  const matchIds = participantMatches.map((match) => match.id);

  if (!matchIds.length) {
    return res.json({
      success: true,
      data: { byReportId: {}, totalUnreadMessages: 0 },
    });
  }

  const { data: conversations, error: conversationsError } = await supabase
    .from('match_conversations')
    .select('id, match_id')
    .in('match_id', matchIds);

  check(conversationsError, 'Failed to load conversations');

  const conversationRows = conversations || [];
  const conversationIds = conversationRows.map((conversation) => conversation.id);

  if (!conversationIds.length) {
    return res.json({
      success: true,
      data: { byReportId: {}, totalUnreadMessages: 0 },
    });
  }

  const [{ data: readRows, error: readsError }, { data: incomingRows, error: messagesError }] =
    await Promise.all([
      supabase
        .from('match_conversation_reads')
        .select('conversation_id, last_read_at')
        .eq('user_id', userId)
        .in('conversation_id', conversationIds),
      supabase
        .from('match_messages')
        .select('conversation_id, sender_id, created_at')
        .in('conversation_id', conversationIds)
        .neq('sender_id', userId),
    ]);

  check(readsError, 'Failed to load conversation read markers');
  check(messagesError, 'Failed to load unread messages');

  const lastReadByConversation = new Map(
    (readRows || []).map((row) => [
      row.conversation_id,
      new Date(row.last_read_at).getTime(),
    ]),
  );
  const matchById = new Map(participantMatches.map((match) => [match.id, match]));
  const byReportId = {};

  for (const conversation of conversationRows) {
    const match = matchById.get(conversation.match_id);
    if (!match) continue;

    const lost = reportById.get(match.lost_report_id);
    const found = reportById.get(match.found_report_id);
    const ownReport =
      lost?.owner_user_id === userId ? lost :
      found?.owner_user_id === userId ? found : null;

    if (!ownReport) continue;

    const lastRead = lastReadByConversation.get(conversation.id) ?? 0;
    const unreadCount = (incomingRows || []).filter((message) =>
      message.conversation_id === conversation.id &&
      new Date(message.created_at).getTime() > lastRead
    ).length;

    byReportId[ownReport.id] = (byReportId[ownReport.id] || 0) + unreadCount;
  }

  const totalUnreadMessages = Object.values(byReportId)
    .reduce((sum, count) => sum + count, 0);

  res.json({
    success: true,
    data: { byReportId, totalUnreadMessages },
  });
});



async function loadReturnConfirmationState(matchId, userId) {
  const match = await getAuthorizedMatch(matchId, userId);

  const { data: reports, error: reportsError } = await supabase
    .from('reports')
    .select('id, owner_user_id, status')
    .in('id', [match.lost_report_id, match.found_report_id]);

  check(reportsError, 'Failed to verify return confirmation participants');

  const lost = (reports || []).find((r) => r.id === match.lost_report_id);
  const found = (reports || []).find((r) => r.id === match.found_report_id);

  if (!lost || !found) {
    throw new ApiError(404, 'The matched reports could not be found');
  }

  if (!lost.owner_user_id || !found.owner_user_id ||
      lost.owner_user_id === found.owner_user_id) {
    throw new ApiError(409, 'This match does not have two distinct report owners');
  }

  if (lost.status !== 'returned' || found.status !== 'returned') {
    throw new ApiError(409, 'Both reports must be marked returned before confirmation');
  }

  const participantIds = [lost.owner_user_id, found.owner_user_id];

  const { data: confirmations, error: confirmationError } = await supabase
    .from('match_return_confirmations')
    .select('user_id, confirmed_at')
    .eq('match_id', match.id);

  check(confirmationError, 'Failed to load return confirmations');

  const validConfirmations = (confirmations || []).filter(
    (row) => participantIds.includes(row.user_id)
  );

  return {
    match,
    participantIds,
    validConfirmations,
  };
}

export const getReturnConfirmation = asyncHandler(async (req, res) => {
  const { match, participantIds, validConfirmations } =
    await loadReturnConfirmationState(req.params.matchId, req.mobileUser.id);

  res.json({
    success: true,
    data: {
      matchId: match.id,
      confirmedByMe: validConfirmations.some(
        (row) => row.user_id === req.mobileUser.id
      ),
      confirmedCount: new Set(validConfirmations.map((row) => row.user_id)).size,
      totalParticipants: participantIds.length,
      canClose: new Set(validConfirmations.map((row) => row.user_id)).size === 2,
    },
  });
});

export const confirmReturnForMatch = asyncHandler(async (req, res) => {
  const { match } = await loadReturnConfirmationState(
    req.params.matchId,
    req.mobileUser.id
  );

  const { error: upsertError } = await supabase
    .from('match_return_confirmations')
    .upsert(
      {
        match_id: match.id,
        user_id: req.mobileUser.id,
      },
      {
        onConflict: 'match_id,user_id',
        ignoreDuplicates: true,
      }
    );

  check(upsertError, 'Failed to save return confirmation');

  const { data: confirmations, error: confirmationError } = await supabase
    .from('match_return_confirmations')
    .select('user_id')
    .eq('match_id', match.id);

  check(confirmationError, 'Failed to verify saved return confirmations');

  const { data: reports, error: reportsError } = await supabase
    .from('reports')
    .select('owner_user_id')
    .in('id', [match.lost_report_id, match.found_report_id]);

  check(reportsError, 'Failed to verify match participants');

  const participantIds = [...new Set(
    (reports || []).map((report) => report.owner_user_id).filter(Boolean)
  )];

  const confirmedCount = new Set(
    (confirmations || [])
      .map((row) => row.user_id)
      .filter((id) => participantIds.includes(id))
  ).size;

  res.json({
    success: true,
    data: {
      matchId: match.id,
      confirmedByMe: true,
      confirmedCount,
      totalParticipants: participantIds.length,
      canClose: participantIds.length === 2 && confirmedCount === 2,
    },
  });
});

export const resolveApprovedMatchForReport = asyncHandler(async (req, res) => {
  const reportId = String(req.params.reportId || '').trim();

  // UUID validation also keeps the Supabase OR filter from accepting
  // arbitrary filter syntax.
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (!uuidPattern.test(reportId)) {
    throw new ApiError(400, 'Invalid report ID');
  }

  const { data: matches, error: matchError } = await supabase
    .from('matches')
    .select('id, lost_report_id, found_report_id, status')
    .or(`lost_report_id.eq.${reportId},found_report_id.eq.${reportId}`)
    .eq('status', 'approved');

  check(matchError, 'Failed to find approved matches');

  if (!matches || matches.length === 0) {
    throw new ApiError(404, 'No approved match is available for this report');
  }

  const reportIds = [
    ...new Set(
      matches.flatMap((match) => [
        match.lost_report_id,
        match.found_report_id,
      ]),
    ),
  ];

  const { data: reports, error: reportsError } = await supabase
    .from('reports')
    .select('id, owner_user_id')
    .in('id', reportIds);

  check(reportsError, 'Failed to verify match participants');

  const owners = new Map(
    (reports || []).map((report) => [report.id, report.owner_user_id]),
  );

  // Never expose a match ID to a user who does not participate in it.
  const authorizedMatches = matches.filter((match) => {
    const lostOwner = owners.get(match.lost_report_id);
    const foundOwner = owners.get(match.found_report_id);

    return (
      req.mobileUser.id === lostOwner ||
      req.mobileUser.id === foundOwner
    );
  });

  if (authorizedMatches.length === 0) {
    throw new ApiError(403, 'You are not a participant in an approved match for this report');
  }

  if (authorizedMatches.length > 1) {
    throw new ApiError(
      409,
      'Multiple approved matches exist. Please contact support to resolve the ambiguous match.',
    );
  }

  res.json({
    success: true,
    data: { matchId: authorizedMatches[0].id },
  });
});
