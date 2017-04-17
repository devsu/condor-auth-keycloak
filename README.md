# Condor-Keycloak
An authorization middleware for [Condor GRPC Framework](https://github.com/devsu/condor-framework) using bearer tokens provided by [Keycloak](http://www.keycloak.org/) using OpenID Connect strategy.

## Installation

```bash
npm install --save condor-keycloak
```

## How to use

First, you will need to create a client in keycloak.

The caller must include the `authorization` metadata, containing a valid access token.

Then you just need to add keycloak as a middleware in your condor server.

```
const Condor = require('condor-framework');
const Keycloak = require('condor-keycloak');
const Greeter = require('./greeter');

const keycloak = new Keycloak();

const app = new Condor()
  .addService('./protos/greeter.proto', 'myapp.Greeter', new Greeter())
  .use(keycloak.middleware())
  .start();
```

By default, when no options are passed, it will try to read the configuration from `keycloak.json` and rules from `keycloak-rules.json` files.

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

### Rules file

The `keycloak-rules.js` is where you configure all the access rules for your application.

The rules file should export an object, with the full names of the services as keys, and an optional `default` key which will be used for every method that is not defined in the file.

#### Rules Example

This example will show you the available options:

```
module.exports = {
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

function customValidation (token, context) => {
	if (token.hasRole('myRole') && context.metadata['someKey'] === 'someValue') {
		return true; // allow to continue
	}
	return false; // deny access
}
```

Using these rules, we're telling the application:

- By default, for every method not defined in the file, the user must be authenticated (without taking into account any roles).
- `sayHello` requires the user to have the `special` role in this application.
- `sayHelloOther` requires the user to have the `special` role in the `other-app` application.
- `sayHelloRealm` requires the user to have the `admin` realm.
- `sayHelloCustom` access will be calculated by the `customValidation` method.
- `sayHelloPublic` will be public (`$anonymous`)
- `sayHelloMultiple` shows how you can pass not only one but an array of options to authorize the call. In this example, to authorize the method we are requiring any of these 3 conditions:

  - The user to have the `special` role in this application
  - The user to have the `admin` realm
  - The `customValidation` method to return true


#### Rules Options

##### $anonynous and $authenticated

You can use `$authenticated` to enforce a user to be authenticated before accessing the method (without verifying any roles).

In the same manner, you can use `$anonymous` if you want to make a resource public.

##### Applications Roles and Realms

If it's a role in the current application, you should just use the role name e.g. `special`.

If it's a role of another application, use the application name and the role name. e.g. `another-app:special`.

For realms, just use the prefix `realm`, e.g. `realm:admin`

##### Custom Validation

For custom validation, just pass the function (make sure to pass the actual function, not only the function name).

The validation function will be called with two parameters: 

- `token`: The token that we received from the caller if any, null otherwise.
- `context`: The context being processed.

The validation function must return a truthy value to allow access. Any falsy value will deny access.

##### Multiple options for a method

You can pass not only one option, but an array of options to authorize the call. If any of them pass, the call will be authorized.
