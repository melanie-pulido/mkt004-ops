'use strict';

// Builds the hardcoded user payload for a given ID and org config.
// All field values follow the MKT004 naming convention.
function buildCrmUser(id, orgConfig) {
  return {
    FirstName: 'NTO_User',
    LastName: id,
    Username: `NTO_User_${id}@${orgConfig.crmDomain}`,
    Email: 'thorgops@salesforce.com',
    Alias: `NTU${id}`.substring(0, 8),
    ProfileId: orgConfig.profileId,
    TimeZoneSidKey: 'America/Chicago',
    LocaleSidKey: 'en_US',
    EmailEncodingKey: 'UTF-8',
    LanguageLocaleKey: 'en_US'
  };
}

module.exports = { buildCrmUser };
