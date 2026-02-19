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
    const apiUrl = await getEnv('RESEND_API_URL');
    const apiKey = await getEnv('RESEND_API_KEY');
    const from = await getEnv('EMAIL_FROM');

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
  _borrowerEmail: string,
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

export function buildParentalConsentRequestEmail(
  childName: string,
  parentalName: string,
  confirmUrl: string
): string {
  return `
    <h1>Solicitação de Consentimento Parental</h1>
    <p>Olá ${parentalName},</p>
    <p>${childName} (${childName.toLowerCase()}@example.com) está tentando criar uma conta no TáComQuem.</p>
    <p>Para continuar, precisamos do seu consentimento como responsável legal.</p>
    <p>Clique no link abaixo para confirmar:</p>
    <a href="${confirmUrl}">Confirmar Cadastro</a>
    <p>Este link expira em 48 horas.</p>
    <p>O TáComQuem é um aplicativo para controle de empréstimos entre amigos. Seu filho(a) poderá gerenciar empréstimos de itens pessoais apenas com sua autorização.</p>
  `;
}

export function buildDataExportReadyEmail(
  downloadUrl: string,
  expiresIn: string,
  format: string
): string {
  return `
    <h1>Seu Dado de Exportação está Pronto</h1>
    <p>Suas dados do TáComQuem foram exportados com sucesso no formato ${format.toUpperCase()}.</p>
    <p>Clique no link abaixo para baixar seus dados:</p>
    <a href="${downloadUrl}">Baixar Meus Dados</a>
    <p>⚠️ Importante: Este link expira em ${expiresIn}.</p>
    <p>Os dados incluem:</p>
    <ul>
      <li>Informações do seu perfil</li>
      <li>Seus itens cadastrados</li>
      <li>Histórico de empréstimos</li>
      <li>Notificações recebidas</li>
    </ul>
    <p>Esta exportação está em conformidade com a LGPD (Lei Geral de Proteção de Dados).</p>
  `;
}
