const condorAuthKeycloak = require('./index');
const Strategy = require('./lib/strategy');

describe('condor-auth-keycloak', () => {
  it('should expose Strategy', () => {
    expect(condorAuthKeycloak.Strategy).toEqual(Strategy);
  });
});
