// Appointment request backend for the hair portfolio website.
// Runs as a Google Apps Script web app under the owner's Google account. The website posts the form here
// as JSON (photos as base64) and this script emails it to the owner with the photos attached.

const TO = 'mattheworoupeng@gmail.com';
const SECRET = '4cgC1yxaESuFSrsadQgqTZLp';   // must match the token in the website's script.js
const MAX_PHOTOS = 3;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;     // stay under Gmail's 25 MB attachment limit

// Limits that stop a spammer from using up the Gmail sending quota (about 100 emails a day).
const HOURLY_LIMIT = 30;          // requests from everyone together, per hour
const DAILY_LIMIT = 70;           // requests per day, kept under Gmail's limit
const PER_EMAIL_HOURLY = 8;       // requests that use the same email address, per hour
const DUPLICATE_WINDOW_MS = 60 * 1000;   // an identical request within a minute is treated as a double click
const BUSY_MESSAGE = 'Too many requests right now. Please try again later, or email me directly.';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.website) return reply({ success: true });                      // spam trap filled in: pretend it worked, send nothing
    if (data.token !== SECRET) return reply({ success: false, error: 'forbidden' });

    const first = clean(data.firstName), last = clean(data.lastName), email = clean(data.email);
    if (!first || !last) return reply({ success: false, error: 'Please enter your first and last name.' });
    if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) return reply({ success: false, error: 'Please enter a valid email address.' });

    const phone = clean(data.phone);
    const services = clean(data.services);
    const info = String(data.info || '').slice(0, 5000);

    const attachments = [];
    let total = 0;
    (data.photos || []).slice(0, MAX_PHOTOS).forEach((p, i) => {
      const bytes = Utilities.base64Decode(String(p.data || ''));
      total += bytes.length;
      const type = /^image\//.test(p.type) ? p.type : 'application/octet-stream';
      attachments.push(Utilities.newBlob(bytes, type, safeName(p.name, i)));
    });
    if (total > MAX_TOTAL_BYTES) return reply({ success: false, error: 'The photos are too large.' });

    const gate = checkLimits(email, fingerprint([first, last, email, services, info, attachments.length, total].join('|')));
    if (gate.duplicate) return reply({ success: true });                    // double click: already sent, so don't send again
    if (!gate.ok) {
      if (gate.alert) alertOwner();                                         // one heads-up email per day
      return reply({ success: false, error: BUSY_MESSAGE });
    }
    const rows = [
      ['First Name', first], ['Last Name', last], ['Email', email], ['Phone', phone || '(not given)'],
      ['Service', services || '(none chosen)'], ['Additional Information', info || '(none)'],
      ['Photos attached', String(attachments.length)],
    ];
    const text = rows.map((r) => r[0] + ': ' + r[1]).join('\n');
    const html = '<table cellpadding="8" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px">' +
      rows.map((r) => '<tr><td style="border:1px solid #ddd;background:#f5f2ef"><b>' + esc(r[0]) + '</b></td>' +
        '<td style="border:1px solid #ddd;white-space:pre-wrap">' + esc(r[1]) + '</td></tr>').join('') + '</table>';

    MailApp.sendEmail({
      to: TO,
      replyTo: email,
      subject: 'New appointment request: ' + first + ' ' + last,
      body: text,
      htmlBody: html,
      attachments: attachments,
      name: 'Hair Portfolio Website',
    });
    return reply({ success: true });
  } catch (err) {
    return reply({ success: false, error: 'Could not send the request.' });
  }
}

function doGet() { return reply({ success: true, message: 'Appointment form endpoint is running.' }); }

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function clean(v) { return String(v || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function safeName(name, i) { return String(name || ('photo-' + (i + 1) + '.jpg')).replace(/[^\w.\- ]+/g, '_').slice(0, 80); }

function fingerprint(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return String(h);
}

// Counts requests (stored in the script's own properties) and says whether this one may go through.
function checkLimits(email, fp) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    const now = new Date();
    const tz = Session.getScriptTimeZone();
    const day = Utilities.formatDate(now, tz, 'yyyyMMdd');
    const hour = Utilities.formatDate(now, tz, 'yyyyMMddHH');
    let s = {};
    try { s = JSON.parse(props.getProperty('limits') || '{}'); } catch (e) { s = {}; }
    if (s.day !== day) s = { day: day, dayCount: 0, alerted: false };
    if (s.hour !== hour) { s.hour = hour; s.hourCount = 0; s.emails = {}; }
    s.emails = s.emails || {};
    const key = email.toLowerCase();

    if (s.lastFp === fp && now.getTime() - (s.lastAt || 0) < DUPLICATE_WINDOW_MS) return { ok: true, duplicate: true };
    if (s.dayCount >= DAILY_LIMIT || s.hourCount >= HOURLY_LIMIT || (s.emails[key] || 0) >= PER_EMAIL_HOURLY) {
      const alertNow = !s.alerted;
      s.alerted = true;
      props.setProperty('limits', JSON.stringify(s));
      return { ok: false, alert: alertNow };
    }
    s.dayCount += 1;
    s.hourCount += 1;
    s.emails[key] = (s.emails[key] || 0) + 1;
    s.lastFp = fp;
    s.lastAt = now.getTime();
    if (Object.keys(s.emails).length > 200) s.emails = {};
    props.setProperty('limits', JSON.stringify(s));
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function alertOwner() {
  try {
    MailApp.sendEmail(TO, 'Appointment form limit reached',
      'The appointment form on your website has hit its sending limit (' + HOURLY_LIMIT + ' per hour, ' + DAILY_LIMIT + ' per day, or ' + PER_EMAIL_HOURLY + ' from one email address).\n' +
      'This usually means someone is sending junk requests. Real clients see a polite "try again later" message.\n' +
      'This is the only alert you will get today.');
  } catch (e) { /* the daily email quota may already be used up */ }
}