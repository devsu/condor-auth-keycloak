const path = require('path');
const keycloakUtils = require('keycloak-auth-utils');

module.exports = class {
  constructor(customOptions) {
    const defaultOptions = {
      'configFile': './keycloak.json',
      'rulesFile': './keycloak-rules.js',
    };

    const options = Object.assign({}, defaultOptions, customOptions);

    this.rules = this._loadFile(options.rulesFile);
    this.config = new keycloakUtils.Config(options.configFile);
    this.grantManager = new keycloakUtils.GrantManager(this.config);
  }

  middleware(context, next) {
    let token = context.call.metadata.get('authorization')[0];
    if (!token) {
      return next();
    }
    if (token.indexOf('Bearer ') === 0) {
      token = token.substring(7);
    }
    return this.grantManager.createGrant({'access_token': token}).then((grant) => {
      if (!grant.access_token.isExpired()) {
        context.grant = grant;
      }
      next();
    });
  }

  _loadFile(filePath) {
    return require(path.join(process.cwd(), filePath));
  }
};
