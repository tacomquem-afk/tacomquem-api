interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

async function getEnv(key: string): Promise<string> {
  const value = Bun.env[key];
  if (!value) throw new Error(`${key} not set`);
  return value;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const apiKey = await getEnv('RESEND_API_KEY');
    const from = await getEnv('EMAIL_FROM');

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to send email:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Email service error:', error);
    return false;
  }
}

export function buildVerificationEmail(name: string, verificationUrl: string): string {
  return `
    <h1>Bem-vindo ao TáComQuem, ${name}!</h1>
    <p>Clique no link abaixo para verificar seu email:</p>
    <a href="${verificationUrl}">Verificar Email</a>
    <p>Este link expira em 24 horas.</p>
  `;
}

export function buildPasswordResetEmail(name: string, resetUrl: string): string {
  return `
    <h1>Recuperação de Senha</h1>
    <p>Olá ${name},</p>
    <p>Clique no link abaixo para redefinir sua senha:</p>
    <a href="${resetUrl}">Redefinir Senha</a>
    <p>Este link expira em 24 horas.</p>
    <p>Se você não solicitou isso, ignore este email.</p>
  `;
}

export function buildLoanReminderEmail(
  borrowerName: string,
  lenderName: string,
  itemName: string,
  appUrl: string
): string {
  return `
    <h1>Lembrete de Devolução</h1>
    <p>Olá ${borrowerName},</p>
    <p>${lenderName} gostaria de lembrar que você está com o item "${itemName}" emprestado.</p>
    <p>Acesse o app para ver mais detalhes:</p>
    <a href="${appUrl}">Acessar TáComQuem</a>
  `;
}

export function buildLoanConfirmationRequestEmail(
  borrowerEmail: string,
  lenderName: string,
  itemName: string,
  confirmUrl: string
): string {
  return `
    <h1>Confirme o Empréstimo</h1>
    <p>${lenderName} registrou que emprestou "${itemName}" para você.</p>
    <p>Clique no link abaixo para confirmar:</p>
    <a href="${confirmUrl}">Confirmar Empréstimo</a>
  `;
}
