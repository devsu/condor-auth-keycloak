const keycloakUtils = require('keycloak-auth-utils');

module.exports = class {
  constructor(customOptions) {
    const defaultOptions = {
      'configFile': './keycloak.json',
    };
    const options = Object.assign({}, defaultOptions, customOptions);
    this.config = new keycloakUtils.Config(options.configFile);
    this.grantManager = new keycloakUtils.GrantManager(this.config);
  }

  mapRoles(context, token) {
    if (!token || !token.content) {
      return {};
    }
    const roles = {};
    if (token.content.realm_access) {
      roles.realm = token.content.realm_access.roles;
    }
    if (token.content.resource_access) {
      Object.keys(token.content.resource_access).forEach((resourceName) => {
        roles[resourceName] = token.content.resource_access[resourceName].roles;
      });
    }
    return roles;
  }

  decodeAndVerifyToken(context) {
    const tokenString = context.metadata.get('authorization')[0];
    const grant = this.grantManager.createGrant({'access_token': tokenString});
    context.grantManager = this.grantManager;
    context.grant = grant;
    return grant.access_token;
  }
};
