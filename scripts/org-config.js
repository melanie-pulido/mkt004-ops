'use strict';

// Org-specific config for CRM user creation.
// profileId and permissionSetIds are queried once per org and hardcoded here.
// To update for a new org: sf data query --target-org <alias>
//   --query "SELECT Id, Name FROM Profile WHERE Name = 'MKT004 Student'"
//   --query "SELECT Id, Name FROM PermissionSet WHERE Label IN ('...')"

const ORG_CONFIG = {
  'Org 1': {
    label: 'Org 1 (mkt004-1)',
    crmDomain: 'mkt004-1.com',
    authUrlEnvVar: 'SF_AUTH_URL_ORG1',
    profileId: '00efn000004ZJyPAAW',
    permissionSetIds: [
      '0PSfn0000055u3JGAQ', // MarketingCloudManager
      '0PSfn0000055pQnGAI', // DataCloudActManager
      '0PSfn0000055u3KGAQ'  // TableauEinsteinIncludedAppBusinessUser
    ],
    mc: {
      label: 'Org 1 MC (mkt004-mc-1)',
      parentMid: 517036101,
      childMid: 517036813,
      loginDomain: 'mkt004-1.com',
      roleName: 'Marketing_Cloud_Student',
      clientIdEnvVar: 'MC_CLIENT_ID_ORG1',
      clientSecretEnvVar: 'MC_CLIENT_SECRET_ORG1',
      subdomainEnvVar: 'MC_SUBDOMAIN_ORG1'
    }
  },
  'Org 2': {
    label: 'Org 2 (mkt004-2)',
    crmDomain: 'mkt004-2.com',
    authUrlEnvVar: 'SF_AUTH_URL_ORG2',
    profileId: '00ehm000000w1tNAAQ',
    permissionSetIds: [
      '0PShm000001AxvhGAC', // MarketingCloudManager
      '0PShm000001AkkAGAS', // DataCloudActManager
      '0PShm000001AxviGAC'  // TableauEinsteinIncludedAppBusinessUser
    ],
    mc: {
      label: 'Org 2 MC (mkt004-mc-2)',
      parentMid: 517036102,
      childMid: 517036973,
      loginDomain: 'mkt004-2.com',
      roleName: 'Marketing_Cloud_Student',
      clientIdEnvVar: 'MC_CLIENT_ID_ORG2',
      clientSecretEnvVar: 'MC_CLIENT_SECRET_ORG2',
      subdomainEnvVar: 'MC_SUBDOMAIN_ORG2'
    }
  },
  'Org 3': {
    label: 'Org 3 (mkt004-3)',
    crmDomain: 'mkt004-3.com',
    authUrlEnvVar: 'SF_AUTH_URL_ORG3',
    profileId: '00ehm000000w1yDAAQ',
    permissionSetIds: [
      '0PShm000001Ay0XGAS', // MarketingCloudManager
      '0PShm000001AyjtGAC', // DataCloudActManager
      '0PShm000001Ay0YGAS'  // TableauEinsteinIncludedAppBusinessUser
    ],
    mc: {
      label: 'Org 3 MC (mkt004-mc-3)',
      parentMid: 517036103,
      childMid: 517036978,
      loginDomain: 'mkt004-3.com',
      roleName: 'Marketing_Cloud_Student',
      clientIdEnvVar: 'MC_CLIENT_ID_ORG3',
      clientSecretEnvVar: 'MC_CLIENT_SECRET_ORG3',
      subdomainEnvVar: 'MC_SUBDOMAIN_ORG3'
    }
  }
};

module.exports = { ORG_CONFIG };
