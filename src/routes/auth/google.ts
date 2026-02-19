import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { findOrCreateGoogleUser } from '../../services/auth/index.js';

interface GoogleTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  picture?: string;
}

async function googleAuthRoutes(app: FastifyInstance) {
  app.get(
    '/google',
    {
      schema: {
        description: `Initiate Google OAuth 2.0 Authorization Code Flow.

**Important for Frontend Developers:**

1. This endpoint redirects the user to Google's OAuth consent page
2. After user authorization, Google redirects back to the callback endpoint
3. The callback endpoint will redirect to your frontend with JWT tokens

**Frontend Implementation:**
\`\`\`javascript
// Redirect user to Google OAuth
window.location.href = '/api/auth/google';
\`\`\`

**Flow:**
1. User clicks "Login with Google" button
2. Frontend redirects to this endpoint
3. User is redirected to Google to authorize
4. Google redirects back to \`/api/auth/google/callback\`
5. Backend processes the callback and redirects to \`FRONTEND_URL/auth/callback\` with tokens

**Environment Variables Required:**
- \`GOOGLE_CLIENT_ID\`: Google OAuth client ID
- \`GOOGLE_REDIRECT_URI\`: Callback URL registered with Google
- \`FRONTEND_URL\`: Your frontend URL for final redirect`,
        tags: ['Authentication', 'OAuth'],
        summary: 'Initiate Google OAuth login',
        externalDocs: {
          description: 'View Google OAuth 2.0 Documentation',
          url: 'https://developers.google.com/identity/protocols/oauth2',
        },
      },
    },
    async (_request, reply) => {
      const params = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'consent',
      });

      const authUrl = `${env.GOOGLE_AUTH_URL}?${params}`;
      return reply.redirect(authUrl);
    }
  );

  app.get<{
    Querystring: { code?: string; error?: string };
  }>(
    '/google/callback',
    {
      schema: {
        description: `**Google OAuth Callback Endpoint (Internal)**

This endpoint receives the callback from Google OAuth after user authorization.
The backend exchanges the authorization code for tokens, fetches user info,
creates/updates the user, and redirects to the frontend with JWT tokens.

**Important:** This endpoint is called by Google, not directly by the frontend.

**Query Parameters:**
- \`code\`: Authorization code from Google (on success)
- \`error\`: Error code from Google (on user denial or error)

**Frontend Redirect Behavior:**

On success, redirects to: \`FRONTEND_URL/auth/callback?accessToken=xxx&refreshToken=xxx\`
On error, redirects to: \`FRONTEND_URL/login?error=ERROR_CODE\`

**Error Codes:**
| Code | Description |
|------|-------------|
| \`oauth_denied\` | User denied authorization |
| \`no_code\` | No authorization code received |
| \`oauth_failed\` | Generic OAuth failure |
| \`beta_not_available\` | Beta mode enabled, user not in beta program |

**Frontend Implementation:**
Your frontend should handle the callback at \`/auth/callback\`:

\`\`\`javascript
// pages/AuthCallback.tsx
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const accessToken = params.get('accessToken');
  const refreshToken = params.get('refreshToken');

  if (accessToken && refreshToken) {
    // Save tokens to localStorage
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);

    // Fetch user data and redirect to dashboard
    fetchUserData().then(() => navigate('/dashboard'));
  } else {
    // Handle error redirect
    navigate('/login?error=missing_tokens');
  }
}, []);
\`\`\``,
        tags: ['Authentication', 'OAuth'],
        summary: 'Google OAuth callback (internal)',
        externalDocs: {
          description: 'View Google OAuth 2.0 Documentation',
          url: 'https://developers.google.com/identity/protocols/oauth2',
        },
        querystring: z.object({
          code: z.string().optional().describe('OAuth authorization code from Google'),
          error: z
            .enum(['access_denied', 'temporarily_unavailable', 'invalid_request'])
            .optional()
            .describe('Error code if user denied or error occurred'),
        }),
      },
    },
    async (request, reply) => {
      const { code, error } = request.query;

      if (error) {
        return reply.redirect(`${env.FRONTEND_URL}/login?error=oauth_denied`);
      }

      if (!code) {
        return reply.redirect(`${env.FRONTEND_URL}/login?error=no_code`);
      }

      try {
        const tokenResponse = await fetch(env.GOOGLE_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            redirect_uri: env.GOOGLE_REDIRECT_URI,
            grant_type: 'authorization_code',
          }),
        });

        if (!tokenResponse.ok) {
          throw new Error('Failed to exchange code for tokens');
        }

        const tokens = (await tokenResponse.json()) as GoogleTokenResponse;

        const userResponse = await fetch(env.GOOGLE_USERINFO_URL, {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });

        if (!userResponse.ok) {
          throw new Error('Failed to get user info');
        }

        const googleUser = (await userResponse.json()) as GoogleUserInfo;

        const user = await findOrCreateGoogleUser(
          googleUser.id,
          googleUser.email,
          googleUser.name,
          googleUser.picture
        );

        const accessToken = app.signAccessToken(user.id, user.role);

        const refreshToken = app.signRefreshToken(user.id, user.role);

        const params = new URLSearchParams({
          accessToken,
          refreshToken,
        });

        return reply.redirect(`${env.FRONTEND_URL}/auth/callback?${params}`);
      } catch (error) {
        console.error('Google OAuth error:', error);

        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 'AUTH_FORBIDDEN'
        ) {
          return reply.redirect(`${env.FRONTEND_URL}/login?error=beta_not_available`);
        }

        return reply.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
      }
    }
  );
}

export default googleAuthRoutes;
