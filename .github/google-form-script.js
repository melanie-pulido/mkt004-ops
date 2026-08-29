/**
 * MKT004-Ops — Google Form → GitHub Issues bridge
 *
 * Paste this entire script into the Google Form's Apps Script editor:
 *   Form → ⋮ → Script editor
 *
 * SETUP:
 *  1. Apps Script → Project Settings → Script Properties → Add property:
 *       Name: GITHUB_TOKEN   Value: <PAT with repo scope for melanie-pulido>
 *  2. Triggers (clock icon) → Add Trigger:
 *       Function: onFormSubmit / Event source: From form / Event type: On form submit
 *  3. Run testConnection() once manually to confirm your token works.
 *  4. Enable "Collect email addresses" in Form Settings for confirmation emails.
 *
 * FORM QUESTIONS (titles must match exactly):
 *  1. "What would you like to do?"  — Dropdown (required)
 *       • Create MKT004 Users
 *       • Deactivate MKT004 Users
 *  2. "Select the org:"  — Dropdown (required)
 *       • Org 1
 *       • Org 2
 *       • Org 3
 *  3. "User IDs"  — Paragraph (required)
 *       Description hint: One ID per line, e.g. 0001
 */

var REPO = 'melanie-pulido/mkt004-ops';

var LABEL_MAP = {
  'Create MKT004 Users':            'create-mkt004-users',
  'Deactivate MKT004 Users':        'deactivate-mkt004-users',
  'Create MKT004 Instructor User':  'create-mkt004-instructor'
};

function onFormSubmit(e) {
  var responses = e.response.getItemResponses();
  var data = {};
  responses.forEach(function(r) {
    data[r.getItem().getTitle().trim()] = r.getResponse();
  });

  var action = data['What would you like to do?'];
  var org    = data['Select the org:'];
  var label  = LABEL_MAP[action];

  if (!label) {
    Logger.log('Unknown action: ' + action);
    return;
  }

  var title, body;

  if (action === 'Create MKT004 Instructor User') {
    var fullName = data['Full Name'];
    var email    = data['Email Address'];
    title = action + ' — ' + org;
    body  = '### Org\n\n' + org + '\n\n### Full Name\n\n' + fullName + '\n\n### Email\n\n' + email;
  } else {
    var userIds = data['User IDs'];
    title = action + ' — ' + org;
    body  = '### Org\n\n' + org + '\n\n### User IDs\n\n' + userIds;
  }

  var submitterEmail = e.response.getRespondentEmail();
  if (submitterEmail) body += '\n\n### Submitted By\n\n' + submitterEmail;

  var issueUrl = createGitHubIssue(title, body, label);

  if (issueUrl && submitterEmail) {
    MailApp.sendEmail({
      to:      submitterEmail,
      subject: '✅ Request received: ' + title,
      body:    'Your request has been received and is being processed.\n\n' +
               'Track the status and see results here:\n' + issueUrl + '\n\n' +
               'Results will appear as a comment within a minute or two.\n\n' +
               '— MKT004 Ops'
    });
  }
}

function createGitHubIssue(title, body, label) {
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) { Logger.log('ERROR: GITHUB_TOKEN not set'); return null; }

  var options = {
    method:      'post',
    contentType: 'application/json',
    headers: {
      'Authorization':        'Bearer ' + token,
      'Accept':               'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    payload:            JSON.stringify({ title: title, body: body, labels: [label] }),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + '/issues', options);
  var code     = response.getResponseCode();
  var result   = JSON.parse(response.getContentText());

  if (code === 201) {
    Logger.log('Issue created: ' + result.html_url);
    return result.html_url;
  } else {
    Logger.log('ERROR ' + code + ': ' + response.getContentText());
    return null;
  }
}

// Run manually once to verify your GitHub token works
function testConnection() {
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  var options = {
    headers: {
      'Authorization':        'Bearer ' + token,
      'Accept':               'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO, options);
  Logger.log('Status: ' + response.getResponseCode());
  Logger.log(response.getContentText().substring(0, 200));
}
