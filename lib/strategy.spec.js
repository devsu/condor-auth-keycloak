const Promise = require('bluebird');
const keycloakUtils = require('keycloak-auth-utils');
const path = require('path');
const grpc = require('grpc');
const Spy = require('jasmine-spy');
const fse = Promise.promisifyAll(require('fs-extra'));
const Strategy = require('./strategy');

const KEYCLOAK_CONFIG_FILE_PATH = path.join(process.cwd(), 'keycloak.json');
const ALTERNATIVE_KEYCLOAK_CONFIG_FILE_PATH = path.join(process.cwd(), 'spec', 'whatever.json');

describe('strategy', () => {
  let strategy, config, options, context, token, tokenString, grantManager, grant,
    originalGrantManager;

  beforeEach((done) => {
    config = getSampleConfig();
    createFile(KEYCLOAK_CONFIG_FILE_PATH, config).then(done).catch(done.fail);
  });

  afterEach((done) => {
    removeFile(KEYCLOAK_CONFIG_FILE_PATH).then(done).catch(done);
  });

  describe('constructor()', () => {
    describe('no options', () => {
      it('should read config from keycloak.json', () => {
        strategy = new Strategy();
        const expectedConfig = new keycloakUtils.Config(KEYCLOAK_CONFIG_FILE_PATH);
        expect(strategy.config).toEqual(expectedConfig);
      });

      describe('when keycloak.json is not present', () => {
        beforeEach((done) => {
          removeFile(KEYCLOAK_CONFIG_FILE_PATH).then(done).catch(done.fail);
        });

        it('should throw an error', () => {
          expect(() => {
            strategy = new Strategy();
          }).toThrowError(/keycloak\.json/g);
        });
      });
    });

    describe('options: "configFile"', () => {
      beforeEach(() => {
        options = {'configFile': 'spec/whatever.json'};
      });

      it('should read the configuration from such file', (done) => {
        Promise.all([
          removeFile(KEYCLOAK_CONFIG_FILE_PATH),
          createFile(ALTERNATIVE_KEYCLOAK_CONFIG_FILE_PATH, config),
        ]).then(() => {
          strategy = new Strategy(options);
          const expectedConfig = new keycloakUtils.Config(ALTERNATIVE_KEYCLOAK_CONFIG_FILE_PATH);
          expect(strategy.config).toEqual(expectedConfig);
          return removeFile(ALTERNATIVE_KEYCLOAK_CONFIG_FILE_PATH);
        }).then(done);
      });
    });

    it('should create a GrantManager', () => {
      const expectedConfig = new keycloakUtils.Config(KEYCLOAK_CONFIG_FILE_PATH);
      const expectedGrantManager = new keycloakUtils.GrantManager(expectedConfig);
      strategy = new Strategy();
      expect(strategy.grantManager).toEqual(expectedGrantManager);
    });
  });

  describe('mapRoles()', () => {
    beforeEach(() => {
      token = {
        'content': {
          'realm_access': {
            'roles': ['admin', 'uma_authorization', 'user'],
          },
          'resource_access': {
            'node-service': {
              'roles': ['view-everything'],
            },
            'account': {
              'roles': ['manage-account', 'manage-account-links', 'view-profile'],
            },
          },
        },
      };
      context = {token};
    });

    it('should map all roles', () => {
      const expected = {
        'realm': ['admin', 'uma_authorization', 'user'],
        'node-service': ['view-everything'],
        'account': ['manage-account', 'manage-account-links', 'view-profile'],
      };
      const actual = strategy.mapRoles(context, token);
      expect(actual).toEqual(expected);
    });

    describe('when no token passed', () => {
      it('should return an empty object', () => {
        const actual = strategy.mapRoles({});
        expect(actual).toEqual({});
      });
    });

    describe('when no content', () => {
      beforeEach(() => {
        token = {};
      });
      it('should return an empty object', () => {
        const actual = strategy.mapRoles(context, token);
        expect(actual).toEqual({});
      });
    });

    describe('when no content.realm_access', () => {
      beforeEach(() => {
        delete token.content.realm_access;
      });
      it('should return only the resources roles', () => {
        const expected = {
          'node-service': ['view-everything'],
          'account': ['manage-account', 'manage-account-links', 'view-profile'],
        };
        const actual = strategy.mapRoles(context, token);
        expect(actual).toEqual(expected);
      });
    });

    describe('when no content.resource_access', () => {
      beforeEach(() => {
        delete token.content.resource_access;
      });
      it('should return only the realm roles', () => {
        const expected = {
          'realm': ['admin', 'uma_authorization', 'user'],
        };
        const actual = strategy.mapRoles(context, token);
        expect(actual).toEqual(expected);
      });
    });
  });

  describe('decodeAndVerifyToken()', () => {
    beforeEach(() => {
      tokenString = 'mytoken';
      context = {'metadata': new grpc.Metadata()};
      context.metadata.add('authorization', tokenString);
      token = {};
      grant = {'access_token': token};
      grantManager = {'createGrant': Spy.returnValue(grant)};
      originalGrantManager = keycloakUtils.GrantManager;
      keycloakUtils.GrantManager = Spy.returnValue(grantManager);
      strategy = new Strategy();
    });

    afterEach(() => {
      keycloakUtils.GrantManager = originalGrantManager;
    });

    it('should decodeAndVerify using keycloakUtils.GrantManager', () => {
      const actual = strategy.decodeAndVerifyToken(context, options);
      expect(strategy.grantManager.createGrant).toHaveBeenCalledTimes(1);
      expect(strategy.grantManager.createGrant).toHaveBeenCalledWith({'access_token': tokenString});
      expect(actual).toEqual(token);
    });
    it('should attach the grantManager to the context', () => {
      strategy.decodeAndVerifyToken(context, options);
      expect(context.grantManager).toEqual(strategy.grantManager);
    });
    it('should attach the grant to the context', () => {
      strategy.decodeAndVerifyToken(context, options);
      expect(context.grant).toEqual(grant);
    });
  });

  function getSampleConfig() {
    return {
      'realm': 'demo',
      'bearer-only': true,
      'auth-server-url': 'http://localhost:8180/auth',
      'ssl-required': 'none',
      'resource': 'node-service',
    };
  }

  function createFile(filePath, content) {
    return fse.writeFileAsync(filePath, JSON.stringify(content));
  }

  function removeFile(filePath) {
    return fse.unlinkAsync(filePath);
  }
});
