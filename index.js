const path = require('path');

module.exports = class {
  constructor(options) {
    const defaultOptions = {
      'configFile': './keycloak.json',
      'rulesFile': './keycloak-rules.js',
    };

    options = Object.assign(defaultOptions, options);

    this.config = this._loadFile(options.configFile);
    this.rules = this._loadFile(options.rulesFile);
  }

  _loadFile(filePath) {
    return require(path.join(process.cwd(), filePath));
  }
};
