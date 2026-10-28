
import { supabase } from '../../config/supabase.js';
import { supabaseAuth } from '../../config/supabase-auth.js';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

function publicUser(user, profile = {}) {
  const firstName = profile.first_name || '';
  const lastName = profile.last_name || '';

  const name =
    profile.display_name ||
    [firstName, lastName].filter(Boolean).join(' ') ||
    user.email ||
    '';

  return {
    id: user.id,
    name,
    firstName,
    lastName,
    email: user.email || null,
    phone: profile.phone || user.phone || null,
    avatar: profile.avatar_url || null,
    role: profile.role || 'user',
    itemsReported: 0,
    itemsFound: 0,
    itemsReturned: 0,
    trustScore: 95,
    emailVerified: Boolean(user.email_confirmed_at || user.confirmed_at),
    joinedAt: user.created_at || null,
  };
}

async function saveProfile(user, values = {}) {
  const firstName = String(values.firstName || '').trim();
  const lastName = String(values.lastName || '').trim();

  const profile = {
    id: user.id,
    first_name: firstName,
    last_name: lastName,
    display_name: [firstName, lastName].filter(Boolean).join(' '),
    phone: String(values.phone || '').trim() || null,
    role: 'user',
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('profiles')
    .upsert(profile, { onConflict: 'id' })
    .select('*')
    .single();

  if (error) {
    console.error('Mobile profile save failed:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    throw new ApiError(
      500,
      'Account was created but the profile could not be saved',
      { code: error.code },
    );
  }

  return data;
}

export const mobileRegister = asyncHandler(async (req, res) => {
  const {
    email,
    password,
    firstName,
    lastName,
    phone,
    idVerificationNo,
  } = req.body || {};

  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) {
    throw new ApiError(400, 'A valid email address is required');
  }

  if (typeof password !== 'string' || password.length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters');
  }

  if (!String(firstName || '').trim() || !String(lastName || '').trim()) {
    throw new ApiError(400, 'First name and last name are required');
  }

  if (!String(phone || '').trim()) {
    throw new ApiError(400, 'Phone number is required');
  }

  // The current profiles schema has no NIC column.
  // Require the form field, but do not persist sensitive ID data.
  if (!String(idVerificationNo || '').trim()) {
    throw new ApiError(400, 'ID verification number is required');
  }

  const { data, error } = await supabaseAuth.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      emailRedirectTo:
        process.env.SUPABASE_EMAIL_REDIRECT_TO ||
        'backtoowner://login-callback',
      data: {
        first_name: String(firstName).trim(),
        last_name: String(lastName).trim(),
        phone: String(phone).trim(),
      },
    },
  });

  if (error) {
    if (/already registered|already exists/i.test(error.message)) {
      throw new ApiError(409, 'An account with this email may already exist');
    }

    console.error('Mobile registration failed:', error.message);
    throw new ApiError(400, 'Could not register. Check your details and try again.');
  }

  if (!data.user) {
    throw new ApiError(400, 'Could not create the account');
  }

  // Email confirmation may be required before a session is issued.
  if (!data.session) {
    res.status(202).json({
      success: true,
      data: {
        requiresEmailConfirmation: true,
        message: 'Check your email to confirm your account before signing in.',
      },
    });
    return;
  }

  const profile = await saveProfile(data.user, {
    firstName,
    lastName,
    phone,
  });

  res.status(201).json({
    success: true,
    data: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: publicUser(data.user, profile),
    },
  });
});

export const mobileLogin = asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password;

  if (!email || typeof password !== 'string' || !password) {
    throw new ApiError(400, 'email and password are required');
  }

  const { data, error } = await supabaseAuth.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user || !data.session) {
    throw new ApiError(
      401,
      'Invalid email or password, or email confirmation is required',
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileError) {
    console.error('Mobile profile lookup failed:', {
      code: profileError.code,
      message: profileError.message,
    });
    throw new ApiError(500, 'Could not load your profile');
  }

  const savedProfile = profile || await saveProfile(data.user, {
    firstName: data.user.user_metadata?.first_name,
    lastName: data.user.user_metadata?.last_name,
    phone: data.user.user_metadata?.phone,
  });

  res.json({
    success: true,
    data: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: publicUser(data.user, savedProfile),
    },
  });
});

export const mobileMe = asyncHandler(async (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token) {
    throw new ApiError(401, 'Mobile access token is required');
  }

  const { data: authData, error: authError } =
    await supabaseAuth.auth.getUser(token);

  if (authError || !authData.user) {
    throw new ApiError(401, 'Invalid or expired mobile access token');
  }

  const user = authData.user;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('Mobile profile lookup failed:', {
      code: profileError.code,
      message: profileError.message,
    });
    throw new ApiError(500, 'Could not load your profile');
  }

  res.json({
    success: true,
    data: {
      user: publicUser(user, profile || {}),
    },
  });
});

export const mobileRefresh = asyncHandler(async (req, res) => {
  const refreshToken = String(req.body?.refreshToken || '');

  if (!refreshToken) {
    throw new ApiError(400, 'refreshToken is required');
  }

  const { data, error } = await supabaseAuth.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.session || !data.user) {
    throw new ApiError(
      401,
      'Refresh token is invalid or expired. Please sign in again.',
    );
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profileError) {
    console.error('Mobile profile lookup failed:', {
      code: profileError.code,
      message: profileError.message,
    });
    throw new ApiError(500, 'Could not load your profile');
  }

  res.json({
    success: true,
    data: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: publicUser(data.user, profile || {}),
    },
  });
});

export const mobileLogout = asyncHandler(async (req, res) => {
  const header = req.headers.authorization || '';
  const accessToken = header.startsWith('Bearer ')
    ? header.slice(7)
    : '';

  if (!accessToken) {
    throw new ApiError(401, 'Mobile access token is required');
  }

  const { data: authData, error: authError } =
    await supabaseAuth.auth.getUser(accessToken);

  if (authError || !authData.user) {
    throw new ApiError(401, 'Invalid or expired mobile access token');
  }

  const { error } = await supabaseAuth.auth.admin.signOut(
    accessToken,
    'global',
  );

  if (error) {
    console.error('Mobile sign-out failed:', error.message);
    throw new ApiError(500, 'Could not end the mobile session');
  }

  res.json({
    success: true,
    data: { message: 'Signed out' },
  });
});

export const mobileForgotPassword = asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ApiError(400, 'A valid email address is required');
  }

  const { error } = await supabaseAuth.auth.resetPasswordForEmail(email);

  if (error) {
    console.error('Mobile password reset request failed:', error.message);
    throw new ApiError(
      400,
      'Could not request a password reset. Please try again.',
    );
  }

  res.json({
    success: true,
    data: {
      message: 'If an account exists for this email, password reset instructions will be sent.',
    },
  });
});

export const mobileResetPassword = asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const code = String(req.body?.code || '').trim();
  const newPassword = req.body?.newPassword;

  if (!email || !code || typeof newPassword !== 'string') {
    throw new ApiError(400, 'email, code, and newPassword are required');
  }

  if (newPassword.length < 8) {
    throw new ApiError(400, 'Password must be at least 8 characters');
  }

  const { data, error } = await supabaseAuth.auth.verifyOtp({
    email,
    token: code,
    type: 'recovery',
  });

  if (error || !data.user || !data.session) {
    throw new ApiError(400, 'Invalid or expired reset code');
  }

  const { error: passwordError } = await supabaseAuth.auth.updateUser({
    password: newPassword,
  });

  if (passwordError) {
    console.error('Mobile password update failed:', passwordError.message);
    throw new ApiError(400, 'Could not update the password. Please try again.');
  }

  await supabaseAuth.auth.signOut({ scope: 'global' });

  res.json({
    success: true,
    data: {
      message: 'Password updated successfully. Please sign in again.',
    },
  });
});

// Completes mobile email confirmation using the Supabase session
// returned by the confirmation redirect. Never log session tokens.
export const mobileConfirmEmail = asyncHandler(async (req, res) => {
  const accessToken = String(req.body?.accessToken || '').trim();
  const refreshToken = String(req.body?.refreshToken || '').trim();

  if (!accessToken || !refreshToken) {
    throw new ApiError(
      400,
      'Email confirmation session is incomplete. Please open the confirmation email again.',
    );
  }

  const { data, error } = await supabaseAuth.auth.getUser(accessToken);

  if (error || !data.user) {
    throw new ApiError(
      401,
      'Email confirmation session is invalid or expired. Please sign in or request a new confirmation email.',
    );
  }

  const user = data.user;

  if (!user.email_confirmed_at && !user.confirmed_at) {
    throw new ApiError(403, 'Your email address has not been confirmed yet.');
  }

  const { data: existingProfile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('Mobile confirmation profile lookup failed:', {
      code: profileError.code,
      message: profileError.message,
    });
    throw new ApiError(500, 'Could not load your profile');
  }

  const profile = existingProfile || await saveProfile(user, {
    firstName: user.user_metadata?.first_name,
    lastName: user.user_metadata?.last_name,
    phone: user.user_metadata?.phone,
  });

  res.json({
    success: true,
    data: {
      accessToken,
      refreshToken,
      user: publicUser(user, profile),
    },
  });
});
