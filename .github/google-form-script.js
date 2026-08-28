// MKT004 Ops — Google Form Apps Script
// Paste the full contents into the Google Form's Apps Script editor:
//   Form → ⋮ → Script editor
//
// Setup:
// 1. Open Script Properties (Project Settings → Script Properties)
// 2. Add property: GITHUB_TOKEN = <GitHub PAT with repo scope for melanie-pulido/mkt004-ops>
// 3. Save and deploy a trigger: onFormSubmit → On form submit
//
// Form fields (in order):
//   1. Operation  [Multiple choice: "Create Users" / "Deactivate Users"]
//   2. Org        [Multiple choice: "Org 1 (mkt004-1)" / "Org 2 (mkt004-2)" / "Org 3 (mkt004-3)"]
//   3. User IDs   [Paragraph text — one ID per line]

var GITHUB_OWNER = 'melanie-pulido';
var GITHUB_REPO  = 'mkt004-ops';

function onFormSubmit(e) {
  var responses = e.response.getItemResponses();
  var fields = {};
  responses.forEach(function(r) {
    fields[r.getItem().getTitle()] = r.getResponse();
  });

  var operation = fields['Operation'] || '';
  var org       = fields['Org'] || '';
  var userIds   = fields['User IDs'] || '';
  var email     = e.response.getRespondentEmail() || 'unknown';

  var label = operation === 'Create Users' ? 'create-users' : 'deactivate-users';

  var issueTitle = operation + ' — ' + org;
  var issueBody  = [
    '### Org',
    org,
    '',
    '### User IDs',
    userIds,
    '',
    '---',
    '_Submitted by: ' + email + '_'
  ].join('\n');

  var token   = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  var payload = JSON.stringify({ title: issueTitle, body: issueBody, labels: [label] });

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'mkt004-ops-form' },
    payload: payload
  };

  var url      = 'https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/issues';
  var response = UrlFetchApp.fetch(url, options);
  var issue    = JSON.parse(response.getContentText());

  // Send confirmation email to respondent
  if (e.response.getRespondentEmail()) {
    GmailApp.sendEmail(
      e.response.getRespondentEmail(),
      '[MKT004 Ops] ' + issueTitle + ' — submitted',
      'Your request has been received and is being processed.\n\nTrack progress: ' + issue.html_url
    );
  }
}
