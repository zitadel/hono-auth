# Hono Auth.js

A [Hono](https://hono.dev/) integration for [Auth.js](https://authjs.dev/)
that provides seamless authentication with multiple providers, session
management, and route protection using Hono middleware patterns.

This integration brings the power and flexibility of Auth.js to Hono
applications with full TypeScript support and Web API-native handling.

### Why?

Modern web applications require robust, secure, and flexible authentication
systems. While Auth.js provides excellent authentication capabilities,
integrating it with Hono applications requires proper middleware composition
and environment-aware configuration.

However, a direct integration isn't always straightforward. Different types
of applications or deployment scenarios might warrant different approaches:

- **Multi-Runtime Support:** Hono runs on Node.js, Deno, Bun, Cloudflare
  Workers, and more. A proper integration should handle environment
  differences transparently while maintaining consistent Auth.js behavior.
- **Middleware Composition:** Hono's middleware pattern requires proper
  context variable management and error handling. This integration provides
  middleware for configuration, authentication handling, and route protection
  that compose naturally with Hono's middleware pipeline.
- **Proxy-Aware URL Handling:** When deployed behind reverse proxies or
  edge networks, proper URL resolution from X-Forwarded headers is critical
  for Auth.js callback URLs and redirect handling.

This integration, `@zitadel/hono-auth`, aims to provide the flexibility to
handle such scenarios. It allows you to leverage the full Auth.js ecosystem
while maintaining Hono best practices, ultimately leading to a more
effective and less burdensome authentication implementation.

## Installation

Install using NPM by using the following command:

```sh
npm install @zitadel/hono-auth @auth/core
```

## Usage

To use this integration, configure Auth.js using `initAuthConfig()` and
mount the `authHandler()` on the Auth.js base path.

```typescript
import { Hono } from 'hono';
import { authHandler, initAuthConfig, verifyAuth } from '@zitadel/hono-auth';
import Zitadel from '@auth/core/providers/zitadel';

const app = new Hono();

app.use(
  '*',
  initAuthConfig((c) => ({
    secret: c.env.AUTH_SECRET,
    providers: [
      Zitadel({
        clientId: c.env.ZITADEL_CLIENT_ID,
        issuer: c.env.ZITADEL_ISSUER,
      }),
    ],
  })),
);

app.use('/api/auth/*', authHandler());

app.use('/api/*', verifyAuth());

app.get('/api/protected', (c) => {
  const auth = c.get('authUser');
  return c.json(auth);
});

export default app;
```

#### Using the Authentication System

The integration provides several middleware functions:

**Middleware:**

- `initAuthConfig()`: Initializes Auth.js configuration in the context
- `authHandler()`: Handles all Auth.js routes (sign-in, sign-out, callbacks)
- `verifyAuth()`: Requires authentication, returns 401 if not authenticated

**Utility Functions:**

- `getAuthUser()`: Retrieves the authenticated user from context
- `setEnvDefaults()`: Sets environment defaults on Auth.js config

**Basic Usage:**

```typescript
import { getAuthUser } from '@zitadel/hono-auth';

// Public route
app.get('/api/public', (c) => {
  return c.json({ message: 'Public endpoint' });
});

// Protected route - manual check
app.get('/api/profile', async (c) => {
  const authUser = await getAuthUser(c);
  if (!authUser) return c.text('Not authenticated', 401);
  return c.json(authUser.session);
});

// Protected route - using middleware
app.use('/api/*', verifyAuth());
app.get('/api/admin', (c) => {
  const auth = c.get('authUser');
  return c.json({ user: auth.session.user });
});
```

## Known Issues

- **Configuration Order:** `initAuthConfig()` must be applied before
  `authHandler()` and `verifyAuth()` in the middleware chain.
- **Environment Variables:** `AUTH_SECRET` must be set either via
  environment variables or in the config handler. The middleware throws
  a 500 error if it's missing.

## Useful links

- **[Auth.js](https://authjs.dev/):** The authentication library that this
  integration is built upon.
- **[Hono](https://hono.dev/):** The lightweight web framework this
  integration is designed for.
- **[Auth.js Providers](https://authjs.dev/getting-started/providers):**
  Complete list of supported authentication providers.

## Contributing

If you have suggestions for how this integration could be improved, or
want to report a bug, open an issue - we'd love all and any
contributions.

## License

Apache-2.0
