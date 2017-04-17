const Keycloak = require('./index');
const Promise = require('bluebird');
const path = require('path');
const fs = Promise.promisifyAll(require('fs'));

const KEYCLOAK_CONFIG_FILE_PATH = path.join(process.cwd(), 'keycloak.json');
const KEYCLOAK_RULES_FILE_PATH = path.join(process.cwd(), 'keycloak-rules.js');

describe ('condor-keycloak', () => {
  let keycloak, keycloakConfig, rules, customValidation, options;

  beforeEach((done) => {
    keycloakConfig = getSampleConfig();
    rules = getSampleRules();
    Promise.all([
      createConfigFile(keycloakConfig),
      createRulesFile(rules)
    ]).then(done).catch(done.fail);
  });

  afterEach((done) => {
    Promise.all([
      removeConfigFile(),
      removeRulesFile(),
    ]).then(done).catch(done); // do not fail if files could not be removed
  });

  describe('constructor()', () => {
    describe('no options', () => {
      describe('keycloak.json is not present', () => {
        beforeEach((done) => {
          removeConfigFile().then(done).catch(done.fail);
        });

        it('should throw an error', () => {
          const filePath = path.join(process.cwd(), 'keycloak.json');
          expect(() => {
            keycloak = new Keycloak();
          }).toThrowError(`Cannot find module '${filePath}'`);
        });
      });

      describe('keycloak-rules.js is not present', () => {
        beforeEach((done) => {
          removeRulesFile().then(done).catch(done.fail);
        });

        it('should throw an error', () => {
          const filePath = path.join(process.cwd(), 'keycloak-rules.js');
          expect(() => {
            keycloak = new Keycloak();
          }).toThrowError(`Cannot find module '${filePath}'`);
        });
      });

      it('should read config from keycloak.json', () => {
        keycloak = new Keycloak();
        expect(keycloak.config).toEqual(getSampleConfig());
      });

      it('should read rules from keycloak-rules.js', () => {
        keycloak = new Keycloak();
        expect(JSON.stringify(keycloak.rules)).toEqual(JSON.stringify(getSampleRules()));
      });
    });

    describe('options: "configFile"', () => {
      beforeEach(() => {
        options = { 'configFile': 'whatever.json' };
      });

      it('should try to read the configuration from such file', () => {
        const filePath = path.join(process.cwd(), 'whatever.json');
        expect(() => {
          keycloak = new Keycloak(options);
        }).toThrowError(`Cannot find module '${filePath}'`);
      });
    });

    describe('options: "rulesFile"', () => {
      beforeEach(() => {
        options = { 'rulesFile': 'whatever.js' };
      });

      it('should try to read the configuration from such file', () => {
        const filePath = path.join(process.cwd(), 'whatever.js');
        expect(() => {
          keycloak = new Keycloak(options);
        }).toThrowError(`Cannot find module '${filePath}'`);
      });
    });
  });

  function createConfigFile(config) {
    return fs.writeFileAsync(KEYCLOAK_CONFIG_FILE_PATH, JSON.stringify(config));
  }

  function removeConfigFile() {
    return fs.unlinkAsync(KEYCLOAK_CONFIG_FILE_PATH);
  }

  function createRulesFile(rules) {
    rules = 'module.exports = ' + JSON.stringify(rules) + ';';
    return fs.writeFileAsync(KEYCLOAK_RULES_FILE_PATH, rules);
  }

  function removeRulesFile() {
    return fs.unlinkAsync(KEYCLOAK_RULES_FILE_PATH);
  }

  function getSampleRules() {
    customValidation = jasmine.createSpy('customValidation');
    return {
      'default': '$authenticated',
      'myapp.Greeter': {
        'sayHello': 'special',
        'sayHelloOther': 'other-app:special',
        'sayHelloRealm': 'realm:admin',
        'sayHelloCustom': customValidation,
        'sayHelloPublic': '$anonymous',
        'sayHelloMultiple': ['special', 'realm:admin', customValidation],
      },
    };
  }

  function getSampleConfig() {
    return {
      'realm': 'demo',
      'bearer-only': true,
      'auth-server-url': 'http://localhost:8180/auth',
      'ssl-required': 'none',
      'resource': 'node-service'
    };
  }
});
