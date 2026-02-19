import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErrorCodes, NotFoundError } from '../../errors/index.js';
import {
  errorResponse400,
  errorResponse401,
  errorResponse404,
  errorResponse410,
  loanResponseSchema,
  publicLoanInfoSchema,
} from '../../schemas/responses.js';
import { confirmLoan, getPublicLoanInfo } from '../../services/loans/index.js';

const tokenParamSchema = z.object({ token: z.string().min(1) });

export async function linksRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();

  typed.get(
    '/:token',
    {
      schema: {
        tags: ['Links'],
        description: `**Get public loan information via share link token**

Returns basic loan information for display on the confirmation landing page. This endpoint is **public** — no authentication is required, allowing borrowers to preview loan details before signing in.

**Returned information:**
- Item name, description, and images
- Lender's name
- Expected return date and lender notes (if set)

**Token behavior:**
- Tokens are generated when a loan is created via \`POST /api/loans\`
- Tokens expire after 7 days from loan creation
- An expired or invalid token returns \`404\`

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`404\` | \`LINKS_INVALID_TOKEN\` | Token is invalid, expired, or the loan no longer exists |`,
        params: tokenParamSchema,
        response: {
          200: publicLoanInfoSchema,
          404: errorResponse404,
        },
      },
    },
    async (request, reply) => {
      const info = await getPublicLoanInfo(request.params.token);

      if (!info) {
        throw new NotFoundError(ErrorCodes.LINKS_INVALID_TOKEN, 'Invalid or expired link');
      }

      return reply.send(info);
    }
  );

  typed.post(
    '/:token/confirm',
    {
      schema: {
        tags: ['Links'],
        description: `**Confirm a loan via share link token**

Called by the borrower to confirm they have received the item and agree to the loan terms. Requires authentication — unauthenticated users are redirected to log in first.

**Prerequisites:**
- The user must be authenticated (send Bearer token)
- The loan must be in \`pending\` status
- The token must be valid and not expired

**After confirmation:**
- Loan status changes to \`confirmed\`
- Both the lender and borrower receive a confirmation notification
- The item is marked as currently loaned out

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`400\` | \`LOANS_ALREADY_CONFIRMED\` | Loan was already confirmed by someone else |
| \`404\` | \`LINKS_INVALID_TOKEN\` | Token is invalid or the loan no longer exists |
| \`410\` | \`LINKS_TOKEN_EXPIRED\` | Confirmation link has expired (7-day window) |`,
        security: [{ BearerAuth: [] }],
        params: tokenParamSchema,
        response: {
          200: z.object({
            loan: loanResponseSchema,
            message: z.string(),
          }),
          401: errorResponse401,
          404: errorResponse404,
          410: errorResponse410,
          400: errorResponse400,
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const loan = await confirmLoan(request.params.token, request.user.userId);
      return reply.send({ loan, message: 'Loan confirmed successfully!' });
    }
  );
}
