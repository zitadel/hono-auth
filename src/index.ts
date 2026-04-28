import type { AuthConfig as AuthConfigCore } from '@auth/core';
import { Auth, setEnvDefaults as coreSetEnvDefaults } from '@auth/core';
import type { AdapterUser } from '@auth/core/adapters';
import type { JWT } from '@auth/core/jwt';
import type { Session } from '@auth/core/types';
import type { Context, MiddlewareHandler } from 'hono';
import { env } from 'hono/adapter';
import { HTTPException } from 'hono/http-exception';
import { reqWithEnvUrl } from './lib/index.js';

export { reqWithEnvUrl } from './lib/index.js';

export { AuthError, CredentialsSignin } from '@auth/core/errors';
export type {
  Account,
  DefaultSession,
  Profile,
  Session,
  User,
} from '@auth/core/types';

declare module 'hono' {
  interface ContextVariableMap {
    authUser: AuthUser;
    authConfig: AuthConfig;
  }
}

/**
 * Environment variables used by Auth.js in Hono applications.
 */
export type AuthEnv = {
  AUTH_URL?: string;
  AUTH_SECRET: string;
  AUTH_REDIRECT_PROXY_URL?: string;
  [key: string]: string | undefined;
};

/**
 * Represents an authenticated user with session, token, and user data.
 */
export type AuthUser = {
  session: Session;
  token?: JWT;
  user?: AdapterUser;
};

/**
 * Auth.js configuration for Hono applications.
 */
export type AuthConfig = Omit<AuthConfigCore, 'raw'>;

/**
 * Function that returns Auth.js configuration from a Hono context.
 */
export type ConfigHandler = (c: Context) => AuthConfig | Promise<AuthConfig>;

/**
 * Sets environment defaults on the Auth.js config from Hono environment.
 *
 * @param envVars - The environment variables
 * @param config - The Auth.js configuration to update
 */
export function setEnvDefaults(envVars: AuthEnv, config: AuthConfig): void {
  config.secret ??= envVars.AUTH_SECRET;
  coreSetEnvDefaults(envVars, config);
}

/**
 * Retrieves the authenticated user from the current context.
 *
 * This function checks the session and returns the authenticated user
 * information including session data, JWT token, and adapter user.
 *
 * @param c - The Hono context
 * @returns The authenticated user, or null if not authenticated
 *
 * @example
 * ```ts
 * app.get('/profile', async (c) => {
 *   const authUser = await getAuthUser(c);
 *   if (!authUser) return c.text('Not authenticated', 401);
 *   return c.json(authUser.session);
 * });
 * ```
 */
export async function getAuthUser(c: Context): Promise<AuthUser | null> {
  const config = c.get('authConfig');
  const ctxEnv = env(c) as AuthEnv;
  setEnvDefaults(ctxEnv, config);
  const authReq = reqWithEnvUrl(c.req.raw, ctxEnv.AUTH_URL);
  const origin = new URL(authReq.url).origin;
  const request = new Request(`${origin}${config.basePath}/session`, {
    headers: { cookie: c.req.header('cookie') ?? '' },
  });

  let authUser: AuthUser = {} as AuthUser;

  const response = (await Auth(request, {
    ...config,
    callbacks: {
      ...config.callbacks,
      async session(...args) {
        authUser = args[0];
        const session =
          (await config.callbacks?.session?.(...args)) ?? args[0].session;
        const user = args[0].user ?? args[0].token;
        return { user, ...session } satisfies Session;
      },
    },
  })) as Response;

  const session = (await response.json()) as Session | null;

  return session?.user ? authUser : null;
}

/**
 * Middleware that requires authentication for protected routes.
 *
 * Throws a 401 HTTPException if the user is not authenticated.
 * Sets the `authUser` context variable when authenticated.
 *
 * @returns A Hono middleware handler
 *
 * @example
 * ```ts
 * app.use('/api/*', verifyAuth());
 * app.get('/api/protected', (c) => {
 *   const auth = c.get('authUser');
 *   return c.json(auth);
 * });
 * ```
 */
export function verifyAuth(): MiddlewareHandler {
  return async (c, next) => {
    const authUser = await getAuthUser(c);
    const isAuth = !!authUser?.token || !!authUser?.user;
    if (!isAuth) {
      const res = new Response('Unauthorized', {
        status: 401,
      });
      throw new HTTPException(401, { res });
    }
    c.set('authUser', authUser);

    await next();
  };
}

/**
 * Middleware that initializes Auth.js configuration in the Hono context.
 *
 * Must be applied before `authHandler()` and `verifyAuth()`.
 *
 * @param cb - A function that returns the Auth.js configuration
 * @returns A Hono middleware handler
 *
 * @example
 * ```ts
 * app.use('*', initAuthConfig((c) => ({
 *   providers: [Zitadel({
 *     clientId: c.env.ZITADEL_CLIENT_ID,
 *     issuer: c.env.ZITADEL_ISSUER,
 *   })],
 *   secret: c.env.AUTH_SECRET,
 * })));
 * ```
 */
export function initAuthConfig(cb: ConfigHandler): MiddlewareHandler {
  return async (c, next) => {
    const config = await cb(c);
    c.set('authConfig', config);
    await next();
  };
}

/**
 * Middleware that handles all Auth.js authentication routes.
 *
 * This should be mounted on the Auth.js base path (e.g. `/api/auth/*`).
 * It handles sign-in, sign-out, callbacks, and session endpoints.
 *
 * @returns A Hono middleware handler
 *
 * @example
 * ```ts
 * import { Hono } from 'hono';
 * import { authHandler, initAuthConfig } from '@zitadel/hono-auth';
 * import Zitadel from '@auth/core/providers/zitadel';
 *
 * const app = new Hono();
 *
 * app.use('*', initAuthConfig((c) => ({
 *   providers: [Zitadel],
 *   secret: c.env.AUTH_SECRET,
 * })));
 *
 * app.use('/api/auth/*', authHandler());
 * ```
 */
export function authHandler(): MiddlewareHandler {
  return async (c) => {
    const config = c.get('authConfig');
    const ctxEnv = env(c) as AuthEnv;

    setEnvDefaults(ctxEnv, config);

    if (!config.secret || config.secret.length === 0) {
      throw new HTTPException(500, { message: 'Missing AUTH_SECRET' });
    }

    const body = c.req.raw.body ? await c.req.blob() : undefined;
    const res = await Auth(
      reqWithEnvUrl(
        new Request(c.req.raw.url, {
          body,
          cache: c.req.raw.cache,
          credentials: c.req.raw.credentials,
          headers: c.req.raw.headers,
          integrity: c.req.raw.integrity,
          keepalive: c.req.raw.keepalive,
          method: c.req.raw.method,
          mode: c.req.raw.mode,
          redirect: c.req.raw.redirect,
          referrer: c.req.raw.referrer,
          referrerPolicy: c.req.raw.referrerPolicy,
          signal: c.req.raw.signal,
        }),
        ctxEnv.AUTH_URL,
      ),
      config,
    );
    return new Response(res.body, res);
  };
}
