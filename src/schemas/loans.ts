import { z } from 'zod';

export const createLoanSchema = z.object({
  itemId: z.string().uuid('Item inválido'),
  borrowerEmail: z.string().email('Email inválido'),
  expectedReturnDate: z.string().datetime().optional(),
  lenderNotes: z.string().optional(),
});

export const updateLoanNotesSchema = z.object({
  lenderNotes: z.string().optional(),
  borrowerNotes: z.string().optional(),
});

export type CreateLoanInput = z.infer<typeof createLoanSchema>;
export type UpdateLoanNotesInput = z.infer<typeof updateLoanNotesSchema>;
