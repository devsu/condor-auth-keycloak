# condor-auth-keycloak

An authorization strategy for [Condor Auth Middleware](https://github.com/devsu/condor-auth).

**Condor** is a [GRPC Framework for node](https://github.com/devsu/condor-framework).
**Condor Auth** is an [authorization middleware](https://github.com/devsu/condor-auth) for Condor.

This module validates and decodes bearer tokens provided by [Keycloak](http://www.keycloak.org/) (Keycloak uses OpenID Connect), and maps **realm** and **resource** **roles** that come in the JWT created by keycloak.

## Installation

```bash
npm install --save condor-framework 
npm install --save condor-auth
npm install --save condor-auth-keycloak 
```

## How to use

First, you will need to create a client in keycloak. Then you just need to add keycloak as a middleware in your condor server.

For the authorization to work, the caller must include the `authorization` metadata, containing a valid access token (**JWT**), created by keycloak.

```js
const Condor = require('condor-framework');
const Auth = require('condor-auth').Auth;
const KeycloakStrategy = require('condor-auth-keycloak').Strategy;
const Greeter = require('./greeter');

const strategy = new KeycloakStrategy(/* keycloak-options */);
const auth = new Auth(strategy);

const app = new Condor()
  .addService('./protos/greeter.proto', 'myapp.Greeter', new Greeter())
  .use(auth.middleware)
  .start();
```

By default, when no options are passed, it will try to read the configuration from `keycloak.json`.

### Configuration File

The `keycloak.json` can be obtained from keycloack, and should look like this:

```
{
  "realm": "demo",
  "bearer-only": true,
  "auth-server-url": "http://localhost:8180/auth",
  "ssl-required": "none",
  "resource": "node-service"
}
```

### Configure access rules

To configure access rules, see the [condor-auth](https://github.com/devsu/condor-auth#2-configuring-access-rules) documentation.

## Options

All values are optional. Their default values are:

| Option       | Description                        | Default         |
|--------------|------------------------------------|-----------------|
| configFile   | The path to the configuration file | keycloak.json   |
