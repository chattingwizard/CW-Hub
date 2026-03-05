// ============================================================
// Chatting Wizard School — Auth & Data Layer (Supabase)
// ============================================================
// SETUP: Replace these with your Supabase project values
// Found at: supabase.com > Your Project > Settings > API
// ============================================================
var SUPABASE_URL = 'https://bnmrdlqqzxenyqjknqhy.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJubXJkbHFxenhlbnlxamtucWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwODIxNzMsImV4cCI6MjA4NjY1ODE3M30.do4TDZdu84GA_Ek37qZi2ZPGqzRKJs9N80opQQP6V90';

var _sb = null;
var _inIframe = false;
try { _inIframe = window.self !== window.top; } catch(e) { _inIframe = true; }

try { localStorage.removeItem('cw-school-auth-token'); } catch(e) {}

function sb() {
  if (_sb) return _sb;
  if (typeof supabase === 'undefined' || typeof supabase.createClient !== 'function') {
    return null;
  }

  var authOpts = {};
  if (_inIframe) {
    authOpts = {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      lock: function(_name, _acquireTimeout, fn) { return fn(); }
    };
  }
  _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: authOpts });
  return _sb;
}

function requireSb() {
  var client = sb();
  if (!client) throw new Error('Could not connect. Please refresh the page and try again.');
  return client;
}

// Receive auth session from CW Hub parent when running inside iframe
function waitForHubSession() {
  if (!_inIframe) return Promise.resolve(null);
  return new Promise(function(resolve) {
    var done = false;
    var timeout = setTimeout(function() { if (!done) { done = true; resolve(null); } }, 4000);
    window.addEventListener('message', function handler(event) {
      if (event.data && event.data.type === 'cw-hub-session' && !done) {
        done = true;
        clearTimeout(timeout);
        window.removeEventListener('message', handler);
        resolve(event.data);
      }
    });
  });
}

// ============================================================
// AUTH
// ============================================================

async function getUser() {
  var client = sb();
  if (!client) return null;
  var res = await client.auth.getUser();
  return res.data && res.data.user ? res.data.user : null;
}

async function getUserProfile(userId) {
  var res = await requireSb().from('profiles').select('*').eq('id', userId).single();
  return res.data;
}

async function cwSignIn(email, password) {
  var res = await requireSb().auth.signInWithPassword({ email: email, password: password });
  if (res.error) throw res.error;
  return res.data;
}

async function cwSignUp(email, password, fullName, inviteCode) {
  var client = requireSb();

  var check = await client.rpc('validate_invite_code', { invite_code: inviteCode });
  if (check.error) throw check.error;
  if (!check.data) throw new Error('Invalid or already used invite code.');

  var siteBase = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
  var res = await client.auth.signUp({
    email: email,
    password: password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: siteBase + '/confirm.html'
    }
  });
  if (res.error) throw res.error;

  if (res.data && res.data.user) {
    var rpcRes = await client.rpc('signup_with_invite', {
      invite_code: inviteCode,
      for_user_id: res.data.user.id
    });
    if (rpcRes.error) {
      console.warn('Invite code marking failed:', rpcRes.error.message);
    }
  }
  return res.data;
}

async function cwSignOut() {
  try { await requireSb().auth.signOut(); } catch(e) {}
  window.location.href = 'login.html';
}

async function cwResetPassword(email) {
  var siteBase = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '');
  var res = await requireSb().auth.resetPasswordForEmail(email, {
    redirectTo: siteBase + '/reset-password.html'
  });
  if (res.error) throw res.error;
}

async function cwUpdatePassword(newPassword) {
  var res = await requireSb().auth.updateUser({ password: newPassword });
  if (res.error) throw res.error;
  return res.data;
}

// ============================================================
// PROGRESS — Read / Write
// ============================================================

async function loadUserProgress(userId) {
  var client = requireSb();
  var results = await Promise.all([
    client.from('progress').select('module_id').eq('user_id', userId),
    client.from('quiz_results').select('*').eq('user_id', userId)
  ]);

  var completed = {};
  (results[0].data || []).forEach(function(r) { completed[r.module_id] = true; });

  var quizzes = {};
  (results[1].data || []).forEach(function(r) {
    quizzes[r.module_id] = {
      score: r.score,
      passed: r.passed,
      pct: r.percentage,
      timestamp: r.submitted_at
    };
  });

  return { completed: completed, quizzes: quizzes };
}

async function saveModuleComplete(userId, moduleId, isCompleted) {
  if (isCompleted) {
    await requireSb().from('progress').upsert({
      user_id: userId,
      module_id: moduleId,
      completed: true,
      updated_at: new Date().toISOString()
    });
  } else {
    await requireSb().from('progress').delete().eq('user_id', userId).eq('module_id', moduleId);
  }
}

async function saveQuizResult(userId, moduleId, score, pct, passed) {
  await requireSb().from('quiz_results').upsert({
    user_id: userId,
    module_id: moduleId,
    score: score,
    percentage: pct,
    passed: passed,
    submitted_at: new Date().toISOString()
  });
}

// ============================================================
// CONTENT GATING
// ============================================================

function getSectionGates() {
  return {
    tools: 't-1',
    journey: 'j-1',
    advanced: 'a-1',
    golive: 'g-1'
  };
}

function getUnlockedSections(quizResults, manualUnlocks) {
  var gates = getSectionGates();
  var unlocked = { foundations: true, ongoing: true };
  var overrides = manualUnlocks || [];
  Object.keys(gates).forEach(function(sectionId) {
    var gateQuiz = gates[sectionId];
    var result = quizResults[gateQuiz];
    var passedQuiz = !!(result && result.passed);
    var manuallyUnlocked = overrides.indexOf(sectionId) >= 0;
    unlocked[sectionId] = passedQuiz || manuallyUnlocked;
  });
  return unlocked;
}

// ============================================================
// MIGRATION — localStorage to Supabase (one-time)
// ============================================================

async function migrateLocalStorage(userId) {
  var STORAGE_KEY = 'cw-school-progress';
  var raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    var client = requireSb();
    var data = JSON.parse(raw);

    if (data.completed) {
      var progressRows = Object.keys(data.completed).map(function(moduleId) {
        return { user_id: userId, module_id: moduleId, completed: true, updated_at: new Date().toISOString() };
      });
      if (progressRows.length > 0) await client.from('progress').upsert(progressRows);
    }

    if (data.quizzes) {
      var quizRows = Object.keys(data.quizzes).map(function(moduleId) {
        var q = data.quizzes[moduleId];
        return { user_id: userId, module_id: moduleId, score: q.score || '0/0', percentage: q.pct || 0, passed: !!q.passed, submitted_at: q.timestamp || new Date().toISOString() };
      });
      if (quizRows.length > 0) await client.from('quiz_results').upsert(quizRows);
    }

    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error('localStorage migration failed:', e);
  }
}

// ============================================================
// ADMIN — Functions for admin panel
// ============================================================

async function adminGetStudents() {
  var client = requireSb();
  var results = await Promise.all([
    client.from('profiles').select('*').not('role', 'in', '("owner")').order('created_at', { ascending: false }),
    client.from('quiz_results').select('*'),
    client.from('progress').select('user_id, module_id'),
    client.from('section_unlocks').select('user_id, section_id')
  ]);

  var profiles = results[0].data || [];
  var quizzes = results[1].data || [];
  var progress = results[2].data || [];
  var unlocks = results[3].data || [];

  if (results[0].error) throw results[0].error;
  if (results[1].error) console.warn('[Admin] quiz_results error:', results[1].error);
  if (results[2].error) console.warn('[Admin] progress error:', results[2].error);
  if (results[3].error) console.warn('[Admin] section_unlocks error:', results[3].error);

  return profiles.map(function(p) {
    var pQuizzes = quizzes.filter(function(q) { return q.user_id === p.id; });
    var pProgress = progress.filter(function(pr) { return pr.user_id === p.id; });
    var pUnlocks = unlocks.filter(function(u) { return u.user_id === p.id; });
    return {
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      role: p.role,
      active: p.active,
      group_name: p.group_name,
      created_at: p.created_at,
      modules_completed: pProgress.length,
      quizzes_passed: pQuizzes.filter(function(q) { return q.passed; }).length,
      quiz_results: pQuizzes.length > 0 ? pQuizzes.map(function(q) {
        return { module_id: q.module_id, score: q.score, percentage: q.percentage, passed: q.passed, submitted_at: q.submitted_at };
      }) : null,
      completed_modules: pProgress.length > 0 ? pProgress.map(function(pr) { return pr.module_id; }) : null,
      unlocked_sections: pUnlocks.length > 0 ? pUnlocks.map(function(u) { return u.section_id; }) : null
    };
  });
}

async function adminGenerateInvite(groupName, maxUses) {
  var res = await requireSb().rpc('generate_invite_code', {
    p_group_name: groupName || null,
    p_max_uses: maxUses || 1
  });
  if (res.error) throw res.error;
  return res.data;
}

async function adminGetInviteCodes() {
  var client = requireSb();
  var res = await client.rpc('admin_get_invite_codes');
  if (res.error) {
    res = await client.from('invite_codes').select('*').order('created_at', { ascending: false });
    if (res.error) throw res.error;
    return res.data || [];
  }
  return res.data || [];
}

async function loadUserUnlocks(userId) {
  var res = await requireSb().from('section_unlocks').select('section_id').eq('user_id', userId);
  return (res.data || []).map(function(r) { return r.section_id; });
}

async function adminGrantSection(targetId, sectionId) {
  var res = await requireSb().rpc('admin_grant_section', { target_id: targetId, sect_id: sectionId });
  if (res.error) throw res.error;
}

async function adminRevokeSection(targetId, sectionId) {
  var res = await requireSb().rpc('admin_revoke_section', { target_id: targetId, sect_id: sectionId });
  if (res.error) throw res.error;
}

async function adminSetActive(targetId, setActive) {
  var res = await requireSb().from('profiles').update({ active: setActive, is_active: setActive }).eq('id', targetId);
  if (res.error) throw res.error;
}

async function adminUpdateStudent(targetId, newName, newRole) {
  var res = await requireSb().rpc('admin_update_student', {
    target_id: targetId,
    new_name: newName || null,
    new_role: newRole || null
  });
  if (res.error) throw res.error;
}

async function adminResetProgress(targetId) {
  var res = await requireSb().rpc('admin_reset_progress', { target_id: targetId });
  if (res.error) throw res.error;
}

async function adminResetQuizzes(targetId) {
  var res = await requireSb().rpc('admin_reset_quizzes', { target_id: targetId });
  if (res.error) throw res.error;
}

async function adminDeleteAccount(targetId) {
  await adminSetActive(targetId, false);
  await adminResetProgress(targetId);
  await adminResetQuizzes(targetId);
  var res = await requireSb().from('section_unlocks').delete().eq('user_id', targetId);
  if (res.error) throw res.error;
}

async function adminDeleteGroup(groupName) {
  var res = await requireSb().from('invite_codes').delete().eq('group_name', groupName);
  if (res.error) throw res.error;
}

async function adminRenameGroup(oldName, newName) {
  var res = await requireSb().from('invite_codes').update({ group_name: newName }).eq('group_name', oldName);
  if (res.error) throw res.error;
}
