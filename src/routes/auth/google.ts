import type { FastifyInstance } from 'fastify';
import { env } from '../../config/env.js';
import { findOrCreateGoogleUser } from '../../services/auth.js';

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
        description: 'Initiate Google OAuth flow',
        tags: ['Authentication', 'OAuth'],
        response: {
          302: {
            description: 'Redirect to Google OAuth page',
          },
        },
      },
    },
    async (request, reply) => {
      const params = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'consent',
      });

      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
      return reply.redirect(authUrl);
    }
  );

  app.get<{
    Querystring: { code?: string; error?: string };
  }>(
    '/google/callback',
    {
      schema: {
        description: 'Google OAuth callback endpoint',
        tags: ['Authentication', 'OAuth'],
        querystring: {
          type: 'object',
          properties: {
            code: { type: 'string', description: 'OAuth authorization code' },
            error: { type: 'string', description: 'OAuth error' },
          },
        },
        response: {
          302: {
            description: 'Redirect to frontend with tokens',
          },
        },
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
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
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

        const tokens: GoogleTokenResponse = await tokenResponse.json();

        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });

        if (!userResponse.ok) {
          throw new Error('Failed to get user info');
        }

        const googleUser: GoogleUserInfo = await userResponse.json();

        const user = await findOrCreateGoogleUser(
          googleUser.id,
          googleUser.email,
          googleUser.name,
          googleUser.picture
        );

        const accessToken = app.jwt.sign(
          { userId: user.id },
          { expiresIn: env.JWT_EXPIRES_IN }
        );

        const refreshToken = app.jwt.sign(
          { userId: user.id },
          { expiresIn: env.JWT_REFRESH_EXPIRES_IN }
        );

        const params = new URLSearchParams({
          accessToken,
          refreshToken,
        });

        return reply.redirect(`${env.FRONTEND_URL}/auth/callback?${params}`);
      } catch (error) {
        console.error('Google OAuth error:', error);
        return reply.redirect(`${env.FRONTEND_URL}/login?error=oauth_failed`);
      }
    }
  );
}

export default googleAuthRoutes;
