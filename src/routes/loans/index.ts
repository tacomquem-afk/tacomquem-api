import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ErrorCodes, NotFoundError } from '../../errors/index.js';
import { createLoanSchema } from '../../schemas/loans.js';
import {
  errorResponse400,
  errorResponse401,
  errorResponse404,
  errorResponse422,
  historyResponseSchema,
  loanResponseSchema,
  messageResponseSchema,
} from '../../schemas/responses.js';
import {
  cancelLoan,
  createLoan,
  getLoanById,
  getLoansByUser,
  getLoansHistory,
  type HistoryDirection,
  markLoanAsReturned,
  sendReminder,
} from '../../services/loans/index.js';

const idParamSchema = z.object({ id: z.string().uuid() });

const loanFilterSchema = z.object({
  filter: z.enum(['lent', 'borrowed', 'pending', 'confirmed', 'returned']).optional(),
});

const historyFilterSchema = z.object({
  direction: z.enum(['all', 'lent', 'borrowed']).optional().default('all'),
});

export async function loansRoutes(app: FastifyInstance) {
  const typed = app.withTypeProvider<ZodTypeProvider>();
  app.addHook('preHandler', app.authenticate);

  typed.post(
    '/',
    {
      schema: {
        tags: ['Loans'],
        description: `**Create a new loan and generate a confirmation link**

Records a new loan and generates a shareable confirmation link for the borrower. The loan starts in \`pending\` status and only transitions to \`confirmed\` after the borrower confirms via \`POST /api/links/:token/confirm\`.

**Flow:**
1. Lender calls this endpoint with the item ID and borrower's email
2. API returns the loan object and a \`confirmUrl\` (share it with the borrower)
3. Borrower opens the link, sees item details (no auth required), then logs in to confirm
4. Loan status changes to \`confirmed\`

**Loan statuses:**
| Status | Description |
|--------|-------------|
| \`pending\` | Loan created, waiting for borrower to confirm |
| \`confirmed\` | Borrower confirmed — item is actively lent out |
| \`returned\` | Item has been returned (terminal state) |
| \`cancelled\` | Loan was cancelled by either party (terminal state) |

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`404\` | \`ITEMS_NOT_FOUND\` | Item does not exist or does not belong to the authenticated user |
| \`422\` | \`VALIDATION_INVALID_REQUEST\` | Request body failed validation |`,
        security: [{ BearerAuth: [] }],
        body: createLoanSchema,
        response: {
          201: z.object({
            loan: loanResponseSchema,
            confirmUrl: z.string().url(),
          }),
          401: errorResponse401,
          404: errorResponse404,
          422: errorResponse422,
        },
      },
    },
    async (request, reply) => {
      const { loan, confirmUrl } = await createLoan(request.user.userId, request.body);
      return reply.status(201).send({ loan, confirmUrl });
    }
  );

  typed.get(
    '/',
    {
      schema: {
        tags: ['Loans'],
        description: `**List active loans for the authenticated user**

Returns loans where the authenticated user is either the lender or the borrower. Use the \`filter\` query parameter to scope results.

**Filter options:**
| \`filter\` value | Description |
|---------------|-------------|
| _(omitted)_ | All loans where the user is lender or borrower |
| \`lent\` | Loans where the user is the lender |
| \`borrowed\` | Loans where the user is the borrower |
| \`pending\` | Loans in \`pending\` status only |
| \`confirmed\` | Loans in \`confirmed\` status only |
| \`returned\` | Loans in \`returned\` status only |

**Note:** For paginated loan history (returned/cancelled), use \`GET /api/loans/history\` instead.`,
        security: [{ BearerAuth: [] }],
        querystring: loanFilterSchema,
        response: {
          200: z.object({ loans: z.array(loanResponseSchema) }),
          401: errorResponse401,
        },
      },
    },
    async (request, reply) => {
      const loans = await getLoansByUser(request.user.userId, request.query.filter);
      return reply.send({ loans });
    }
  );

  typed.get(
    '/history',
    {
      schema: {
        tags: ['Loans'],
        description: `**Get completed loan history**

Returns completed loans (status \`returned\` or \`cancelled\`) for the authenticated user. Designed for the history screen with tab-based navigation.

**Direction filter:**
| \`direction\` value | Description |
|------------------|-------------|
| \`all\` _(default)_ | All completed loans regardless of role |
| \`lent\` | Completed loans where the user is the lender |
| \`borrowed\` | Completed loans where the user is the borrower |

**Response:**
The response includes both the filtered \`loans\` array and a \`counts\` object with totals for all three directions (\`all\`, \`lent\`, \`borrowed\`) — use the counts to render tab badge numbers without making extra requests.`,
        security: [{ BearerAuth: [] }],
        querystring: historyFilterSchema,
        response: {
          200: historyResponseSchema,
          401: errorResponse401,
        },
      },
    },
    async (request, reply) => {
      const direction = request.query.direction as HistoryDirection;
      const result = await getLoansHistory(request.user.userId, direction);
      return reply.send(result);
    }
  );

  typed.get(
    '/:id',
    {
      schema: {
        tags: ['Loans'],
        description: `**Get loan details**

Returns full details for a specific loan. Only the lender or the borrower of the loan can retrieve it.

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`404\` | \`LOANS_NOT_FOUND\` | Loan does not exist or the user is not a party to it |`,
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: z.object({ loan: loanResponseSchema }),
          401: errorResponse401,
          404: errorResponse404,
        },
      },
    },
    async (request, reply) => {
      const loan = await getLoanById(request.params.id, request.user.userId);

      if (!loan) {
        throw new NotFoundError(ErrorCodes.LOANS_NOT_FOUND, 'Loan not found');
      }

      return reply.send({ loan });
    }
  );

  typed.patch(
    '/:id/return',
    {
      schema: {
        tags: ['Loans'],
        description: `**Mark a loan as returned**

Transitions the loan to \`returned\` status. Only the lender can mark a loan as returned. The loan must be in \`confirmed\` status — \`pending\` loans must be confirmed first.

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`400\` | \`LOANS_INVALID_STATUS\` | Loan is not in a state that can be marked as returned (e.g., already returned or cancelled) |
| \`404\` | \`LOANS_NOT_FOUND\` | Loan not found or user is not the lender |`,
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: z.object({ loan: loanResponseSchema }),
          400: errorResponse400,
          401: errorResponse401,
          404: errorResponse404,
        },
      },
    },
    async (request, reply) => {
      const loan = await markLoanAsReturned(request.params.id, request.user.userId);

      if (!loan) {
        throw new NotFoundError(ErrorCodes.LOANS_NOT_FOUND, 'Loan not found');
      }

      return reply.send({ loan });
    }
  );

  typed.patch(
    '/:id/cancel',
    {
      schema: {
        tags: ['Loans'],
        description: `**Cancel a loan**

Transitions the loan to \`cancelled\` status. Either the lender or the borrower can cancel a loan. Only loans in \`pending\` or \`confirmed\` status can be cancelled.

Returns \`204 No Content\` on success.

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`404\` | \`LOANS_NOT_FOUND\` | Loan not found or the user is not a party to it |`,
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        response: {
          204: z.null(),
          401: errorResponse401,
          404: errorResponse404,
        },
      },
    },
    async (request, reply) => {
      const cancelled = await cancelLoan(request.params.id, request.user.userId);

      if (!cancelled) {
        throw new NotFoundError(ErrorCodes.LOANS_NOT_FOUND, 'Loan not found');
      }

      return reply.status(204).send(null);
    }
  );

  typed.post(
    '/:id/remind',
    {
      schema: {
        tags: ['Loans'],
        description: `**Send a manual return reminder**

Sends an email reminder to the borrower asking them to return the item. Only the lender can send reminders, and only for loans in \`confirmed\` status.

**Usage guidance:**
- Use this for a polite nudge when the expected return date has passed
- The system does not enforce a cooldown period on manual reminders, but avoid spamming — a future version may add rate limiting per loan

**Error codes:**
| Status | \`errorCode\` | Meaning |
|--------|------------|---------|
| \`400\` | \`LOANS_INVALID_STATUS\` | Loan is not in \`confirmed\` status (cannot remind on pending/returned/cancelled loans) |
| \`404\` | \`LOANS_NOT_FOUND\` | Loan not found or user is not the lender |`,
        security: [{ BearerAuth: [] }],
        params: idParamSchema,
        response: {
          200: messageResponseSchema,
          400: errorResponse400,
          401: errorResponse401,
          404: errorResponse404,
        },
      },
    },
    async (request, reply) => {
      const sent = await sendReminder(request.params.id, request.user.userId);

      if (!sent) {
        throw new NotFoundError(ErrorCodes.LOANS_NOT_FOUND, 'Loan not found');
      }

      return reply.send({ message: 'Reminder sent successfully!' });
    }
  );
}
