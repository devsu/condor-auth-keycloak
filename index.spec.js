const Promise = require('bluebird');
const path = require('path');
const grpc = require('grpc');
const keycloakUtils = require('keycloak-auth-utils');
const nock = require('nock');
const jwt = require('jsonwebtoken');
const ursa = require('ursa');
const pem2jwk = require('pem-jwk').pem2jwk;
const fse = Promise.promisifyAll(require('fs-extra'));
const Spy = require('jasmine-spy');
const Keycloak = require('./index');

const KEYCLOAK_CONFIG_FILE_PATH = path.join(process.cwd(), 'keycloak.json');
const KEYCLOAK_RULES_FILE_PATH = path.join(process.cwd(), 'keycloak-rules.js');

describe('condor-keycloak', () => {
  let keycloak, config, rules, customValidation, options, context, call, metadata,
    next, payload, token, bearerToken, jwk, nockScope, kid;

  beforeEach((done) => {
    config = getSampleConfig();
    rules = getSampleRules();
    next = Spy.resolve();
    Promise.all([
      createConfigFile(config),
      createRulesFile(rules),
    ]).then(done).catch(done.fail);
  });

  afterEach((done) => {
    Promise.all([
      removeConfigFile(),
      removeRulesFile(),
    ]).then(done).catch(done); // do not fail if files could not be removed
  });

  describe('constructor()', () => {
    let alternativeConfigFile, alternativeRulesFile;

    beforeEach(() => {
      alternativeConfigFile = path.join(process.cwd(), 'whatever.json');
      alternativeRulesFile = path.join(process.cwd(), 'whatever.js');
      delete require.cache[KEYCLOAK_CONFIG_FILE_PATH];
      delete require.cache[KEYCLOAK_RULES_FILE_PATH];
      delete require.cache[alternativeConfigFile];
      delete require.cache[alternativeRulesFile];
    });

    describe('no options', () => {
      it('should read config from keycloak.json', () => {
        keycloak = new Keycloak();
        const expectedConfig = new keycloakUtils.Config(KEYCLOAK_CONFIG_FILE_PATH);
        const expectedGrantManager = new keycloakUtils.GrantManager(expectedConfig);
        expect(keycloak.config).toEqual(expectedConfig);
        expect(keycloak.grantManager).toEqual(expectedGrantManager);
      });

      it('should read rules from keycloak-rules.js', () => {
        keycloak = new Keycloak();
        expect(JSON.stringify(keycloak.rules)).toEqual(JSON.stringify(getSampleRules()));
      });

      describe('when keycloak.json is not present', () => {
        beforeEach((done) => {
          removeConfigFile().then(done).catch(done.fail);
        });

        it('should throw an error', () => {
          expect(() => {
            keycloak = new Keycloak();
          }).toThrowError(/keycloak\.json/g);
        });
      });

      describe('when keycloak-rules.js is not present', () => {
        beforeEach((done) => {
          removeRulesFile().then(done).catch(done.fail);
        });

        it('should throw an error', () => {
          expect(() => {
            keycloak = new Keycloak();
          }).toThrowError(/keycloak-rules\.js/g);
        });
      });
    });

    describe('options: "configFile"', () => {
      beforeEach(() => {
        options = {'configFile': 'whatever.json'};
      });

      it('should read the configuration from such file', (done) => {
        fse.moveAsync(KEYCLOAK_CONFIG_FILE_PATH, alternativeConfigFile).then(() => {
          keycloak = new Keycloak(options);
          const expectedConfig = new keycloakUtils.Config(alternativeConfigFile);
          const expectedGrantManager = new keycloakUtils.GrantManager(expectedConfig);
          expect(keycloak.config).toEqual(expectedConfig);
          expect(keycloak.grantManager).toEqual(expectedGrantManager);
          return fse.unlinkAsync(alternativeConfigFile);
        }).then(done);
      });
    });

    describe('options: "rulesFile"', () => {
      beforeEach(() => {
        options = {'rulesFile': 'whatever.js'};
      });

      it('should try to read the configuration from such file', (done) => {
        fse.moveAsync(KEYCLOAK_RULES_FILE_PATH, alternativeRulesFile).then(() => {
          keycloak = new Keycloak(options);
          const expectedRules = require(alternativeRulesFile);
          expect(keycloak.rules).toEqual(expectedRules);
          return fse.unlinkAsync(alternativeRulesFile);
        }).then(done);
      });
    });
  });

  describe('middleware()', () => {
    beforeEach(() => {
      keycloak = new Keycloak();
    });

    afterEach(() => {
      // should always call next
      expect(next).toHaveBeenCalledTimes(1);
    });

    describe('without authorization metadata', () => {
      beforeEach(() => {
        setupEmptyContext();
      });

      it('should NOT attach any grant to the context', (done) => {
        keycloak.middleware(context, next).then(() => {
          expect(context.grant).toBeUndefined();
          done();
        });
      });
    });

    describe('with valid authorization metadata', () => {
      describe('with Bearer prefix', () => {
        beforeEach(() => {
          setupValidToken();
          setupValidContext(bearerToken);
          nockPublicKey(jwk);
        });

        afterEach(() => {
          nockScope.done(); // verify that calls were done
        });

        it('should attach the grant to the context', (done) => {
          keycloak.middleware(context, next).then(() => {
            verifyGrant();
            done();
          });
        });
      });

      describe('without Bearer prefix', () => {
        beforeEach(() => {
          setupValidToken();
          setupValidContext(token);
          nockPublicKey(jwk);
        });

        afterEach(() => {
          nockScope.done(); // verify that calls were done
        });

        it('should attach the grant to the context', (done) => {
          keycloak.middleware(context, next).then(() => {
            verifyGrant();
            done();
          });
        });

        it('should call next', (done) => {
          keycloak.middleware(context, next).then(() => {
            expect(next).toHaveBeenCalledTimes(1);
            done();
          });
        });
      });
    });

    describe('with invalid authorization metadata', () => {
      beforeEach(() => {
        setupValidContext('invalid token');
      });

      it('should NOT attach any grant to the context', (done) => {
        keycloak.middleware(context, next).then(() => {
          expect(context.grant).toBeUndefined();
          done();
        });
      });
    });

    describe('with expired token', () => {
      beforeEach(() => {
        setupExpiredToken();
        setupValidContext(bearerToken);
      });

      it('should NOT attach any grant to the context', (done) => {
        keycloak.middleware(context, next).then(() => {
          expect(context.grant).toBeUndefined();
          done();
        });
      });
    });
  });

  function createConfigFile(config) {
    return fse.writeFileAsync(KEYCLOAK_CONFIG_FILE_PATH, JSON.stringify(config));
  }

  function removeConfigFile() {
    return fse.unlinkAsync(KEYCLOAK_CONFIG_FILE_PATH);
  }

  function createRulesFile(rules) {
    const content = `module.exports = ${JSON.stringify(rules)};`;
    return fse.writeFileAsync(KEYCLOAK_RULES_FILE_PATH, content);
  }

  function removeRulesFile() {
    return fse.unlinkAsync(KEYCLOAK_RULES_FILE_PATH);
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
      'resource': 'node-service',
    };
  }

  function setupToken(expiration) {
    const keys = getSampleKeys();
    kid = '1234567';
    payload = getSamplePayload();
    payload.exp = expiration;
    token = getSampleToken(payload, kid, keys.toPrivatePem('utf8'));
    bearerToken = `Bearer ${token}`;
    jwk = getSampleJWK(keys.toPublicPem('utf8'), kid);
  }

  function setupExpiredToken() {
    const expiration = Math.floor(Date.now() / 1000) - (60 * 60);
    return setupToken(expiration);
  }

  function setupValidToken() {
    const expiration = Math.floor(Date.now() / 1000) + (60 * 60);
    return setupToken(expiration);
  }

  function setupEmptyContext() {
    metadata = new grpc.Metadata();
    call = {metadata};
    context = {call};
  }

  function setupValidContext(token) {
    setupEmptyContext();
    metadata.add('authorization', token);
  }

  function getSampleKeys() {
    return ursa.generatePrivateKey();
  }

  function getSampleJWK(publicPem, kid) {
    const jwk = pem2jwk(publicPem);
    jwk.kid = kid;
    jwk.alg = 'RS256';
    jwk.use = 'sig';
    return jwk;
  }

  function nockPublicKey(jwk) {
    nockScope = nock('http://localhost:8180')
      .get('/auth/realms/demo/protocol/openid-connect/certs')
      .reply(200, {'keys': [jwk]});
  }

  function getSampleToken(payload, kid, privatePem) {
    const options = {
      'header': {
        'kid': kid,
      },
      'algorithm': 'RS256',
    };
    return jwt.sign(payload, privatePem, options);
  }

  function getSamplePayload() {
    return {
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
      'name': 'Juan Perez',
      'preferred_username': 'juanperez@example.com',
      'given_name': 'Juan',
      'family_name': 'Perez',
      'email': 'juanperez@example.com',
      'typ': 'Bearer',
    };
  }

  function verifyGrant() {
    expect(context.grant).toEqual(jasmine.objectContaining({
      'access_token': jasmine.objectContaining({
        'token': bearerToken.substring(7),
        'clientId': config.resource,
        'header': {
          'alg': 'RS256',
          'typ': 'JWT',
          'kid': kid,
        },
        'content': jasmine.objectContaining(payload),
        'signature': jasmine.any(Object),
      }),
    }));
  }
});
