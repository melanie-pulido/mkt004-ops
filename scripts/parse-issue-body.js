'use strict';

// Parses the GitHub issue body produced by the form templates.
// Expects markdown sections like:
//   ### Org
//   Org 1 (mkt004-1)
//
//   ### User IDs
//   0001
//   0002
function parseIssueBody(body) {
  const orgMatch = body.match(/###\s*Org\s*\n+([^\n]+)/);
  const idsMatch = body.match(/###\s*User IDs\s*\n+([\s\S]+?)(?:\n###|$)/);

  if (!orgMatch) throw new Error('Could not parse Org from issue body');
  if (!idsMatch) throw new Error('Could not parse User IDs from issue body');

  const orgLine = orgMatch[1].trim();
  const orgKey = orgLine.match(/Org \d/)?.[0];
  if (!orgKey) throw new Error(`Unrecognized org value: "${orgLine}"`);

  const ids = idsMatch[1].trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (ids.length === 0) throw new Error('No user IDs found in issue body');

  return { orgKey, ids };
}

module.exports = { parseIssueBody };
