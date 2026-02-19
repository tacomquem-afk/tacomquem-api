# Política de Privacidade — TáComQuem

**Última atualização:** 19 de fevereiro de 2026
**Versão:** 1.0

---

## 1. Apresentação e Controlador dos Dados

Esta Política de Privacidade descreve como o **TáComQuem** ("nós", "Plataforma", "Controlador") coleta, trata, armazena e compartilha dados pessoais dos Usuários da Plataforma, em conformidade com a **Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD)**, o **Marco Civil da Internet (Lei nº 12.965/2014)** e demais normas aplicáveis.

**Controlador dos Dados:**
- **Responsável:** TáComQuem — projeto hobby independente, operado por pessoa física
- **E-mail de contato:** privacidade@tacomquem.com.br

Ao utilizar o TáComQuem, o Usuário ("Titular") reconhece ter lido e concordado com esta Política de Privacidade.

---

## 2. Dados Pessoais Coletados

Coletamos apenas os dados estritamente necessários para a prestação do Serviço, em conformidade com o princípio da minimização previsto na LGPD.

### 2.1 Dados Fornecidos Diretamente pelo Usuário

| Dado | Finalidade | Forma de Armazenamento |
|------|-----------|----------------------|
| Nome completo | Identificação e exibição no perfil | **Criptografado** (AES-256-GCM) |
| Endereço de e-mail | Autenticação, notificações e lembretes | **Criptografado** (AES-256-GCM) + hash para buscas |
| Senha | Autenticação por e-mail/senha | Hash irreversível (bcrypt, fator 12) |
| Foto de perfil | Exibição no perfil | URL de armazenamento externo |
| Descrições e fotos de itens | Registro de itens para empréstimo | Texto simples / URL de imagens |
| Notas de empréstimo | Anotações sobre o empréstimo | Texto simples |

### 2.2 Dados Coletados Automaticamente

| Dado | Finalidade |
|------|-----------|
| Endereço IP | Segurança, auditoria de ações administrativas e prevenção a fraudes |
| Agente do usuário (user agent) | Segurança e auditoria de ações administrativas |
| Data e hora de acesso | Registro de atividade e auditoria |
| Tokens de sessão (JWT) | Autenticação e manutenção de sessão |

### 2.3 Dados de Autenticação via Redes Sociais (OAuth)

Quando o Usuário opta por autenticar via **Google**, coletamos:

| Dado | Finalidade |
|------|-----------|
| Identificador único do provedor | Vinculação da conta OAuth à conta TáComQuem |
| Token de acesso OAuth | Autenticação com o provedor |
| Token de atualização OAuth | Renovação de acesso |

Não acessamos, coletamos ou armazenamos dados além dos fornecidos pelo provedor OAuth no escopo de autenticação básica.

### 2.4 Dados de Terceiros Inseridos pelo Usuário

Para o envio de links de confirmação de empréstimo, o Usuário pode informar o **e-mail de um terceiro** (o tomador do empréstimo). Ao fazê-lo, o Usuário declara e garante que:

- Possui o consentimento do titular desse e-mail para o seu uso na Plataforma; ou
- A comunicação se enquadra no interesse legítimo de ambas as partes para concretizar um empréstimo real.

O e-mail do terceiro é usado exclusivamente para envio do link de confirmação, sendo armazenado vinculado ao registro do empréstimo.

---

## 3. Finalidades do Tratamento

Tratamos seus dados pessoais com base nas seguintes finalidades:

| Finalidade | Base Legal (LGPD) |
|-----------|------------------|
| Criação e gerenciamento de conta | Execução de contrato (art. 7º, V) |
| Autenticação e controle de acesso | Execução de contrato (art. 7º, V) |
| Registro e gestão de empréstimos | Execução de contrato (art. 7º, V) |
| Envio de notificações e lembretes sobre empréstimos | Execução de contrato (art. 7º, V) |
| Envio de e-mails de verificação de conta e redefinição de senha | Execução de contrato (art. 7º, V) |
| Prevenção a fraudes, abusos e proteção da segurança da Plataforma | Legítimo interesse (art. 7º, IX) |
| Auditoria de ações administrativas e de moderação | Cumprimento de obrigação legal (art. 7º, II) / Legítimo interesse (art. 7º, IX) |
| Manutenção de logs de acesso por 6 meses | Cumprimento de obrigação legal — Marco Civil da Internet, art. 15 (art. 7º, II) |
| Análise de métricas agregadas e anonimizadas de uso | Legítimo interesse (art. 7º, IX) |
| Comunicações sobre o Serviço (atualizações, mudanças nos termos) | Legítimo interesse (art. 7º, IX) |

**Não utilizamos seus dados para publicidade comportamental, venda a terceiros ou qualquer finalidade não descrita nesta Política.**

---

## 4. Segurança dos Dados

Implementamos medidas técnicas e organizacionais adequadas para proteger seus dados pessoais contra acesso não autorizado, perda, destruição ou alteração:

### 4.1 Criptografia em Repouso

Todos os dados pessoais sensíveis (nome e e-mail) são **criptografados em repouso** utilizando o algoritmo **AES-256-GCM**, com vetores de inicialização (IV) únicos por dado, garantindo que mesmo em caso de acesso não autorizado ao banco de dados, as informações permaneçam ilegíveis.

### 4.2 Criptografia em Trânsito

Todas as comunicações entre o dispositivo do Usuário e nossos servidores são realizadas via **HTTPS/TLS**, impedindo a interceptação dos dados em trânsito.

### 4.3 Hashing de Senhas

Senhas nunca são armazenadas em texto claro. Utilizamos o algoritmo **bcrypt** com fator de custo 12, tornando computacionalmente inviável a recuperação da senha original em caso de vazamento.

### 4.4 Tokens com Expiração

- Tokens de acesso (JWT): expiram em **7 dias**
- Tokens de atualização: expiram em **30 dias**
- Tokens de verificação de e-mail e redefinição de senha: expiram em **24 horas**
- Links de confirmação de empréstimo: expiram em **7 dias**

### 4.5 Controle de Acesso

O acesso aos dados dos Usuários é restrito por sistema de controle de papéis (RBAC). Membros da equipe somente acessam dados pessoais quando estritamente necessário para suporte ou moderação, com registro em log de auditoria.

---

## 5. Compartilhamento de Dados

**Não vendemos nem comercializamos seus dados pessoais.**

Compartilhamos dados nas seguintes situações limitadas:

### 5.1 Com Outros Usuários da Plataforma

Para a funcionalidade central do Serviço, alguns dados são compartilhados entre Usuários que participam de um empréstimo:

- **Nome** e **foto de perfil** do credor são exibidos ao tomador ao acessar o link de confirmação;
- **Nome** do tomador é exibido ao credor após confirmação do empréstimo;
- Informações básicas sobre o item emprestado são compartilhadas entre credor e tomador.

### 5.2 Com Provedores de Serviços (Suboperadores)

Podemos compartilhar dados com fornecedores que nos auxiliam na prestação do Serviço, sempre vinculados por contratos que garantam confidencialidade e conformidade com a LGPD:

| Fornecedor | Dado Compartilhado | Finalidade |
|-----------|-------------------|-----------|
| Provedor de infraestrutura de nuvem | Dados criptografados do banco de dados | Armazenamento e hospedagem |
| Serviço de envio de e-mails (transacional) | E-mail e nome do destinatário | Envio de notificações e lembretes |
| Google LLC (OAuth) | Dados de autenticação OAuth | Autenticação via conta Google |

### 5.3 Por Obrigação Legal

Podemos divulgar dados pessoais quando exigido por lei, ordem judicial, autoridade competente ou para cumprimento de obrigações legais. Quando possível e legalmente permitido, notificaremos o Usuário previamente.

### 5.4 Em Transferência do Projeto

Caso o TáComQuem seja transferido, vendido ou assumido por outro desenvolvedor ou organização, os dados pessoais dos Usuários poderão ser transferidos ao novo responsável, que ficará obrigado a respeitar esta Política de Privacidade. Os Usuários serão notificados com pelo menos **15 (quinze) dias** de antecedência e poderão solicitar a exclusão de seus dados antes da transferência.

---

## 6. Retenção de Dados

Mantemos seus dados pelo tempo necessário às finalidades para as quais foram coletados, observados os seguintes critérios:

| Dado | Prazo de Retenção |
|------|-------------------|
| Dados de conta (nome, e-mail) | Enquanto a conta estiver ativa + 1 ano após exclusão |
| Logs de acesso (IP, user agent) | 6 meses, conforme Marco Civil da Internet (art. 15) |
| Registros de empréstimos | Enquanto a conta estiver ativa + 1 ano após exclusão |
| Tokens de sessão expirados | Excluídos imediatamente após expiração |
| Tokens de verificação utilizados | 30 dias após uso |
| Log de auditoria administrativa | 5 anos (obrigação legal e legítimo interesse) |
| Dados de OAuth | Enquanto a conta estiver ativa |

Após o prazo de retenção, os dados são **definitivamente excluídos ou anonimizados**, de modo que não possam mais ser associados a um Titular específico.

Dados que devam ser mantidos por exigência legal (e.g., logs do Marco Civil) serão conservados pelo prazo mínimo obrigatório, mesmo após o encerramento da conta.

---

## 7. Exclusão de Conta e Portabilidade

### 7.1 Exclusão

O Usuário pode solicitar a exclusão de sua conta e de seus dados pessoais a qualquer momento. A exclusão é processada em até **15 (quinze) dias úteis** e implica:

- Remoção ou anonimização de todos os dados pessoais identificáveis;
- Encerramento do acesso à Plataforma;
- Manutenção de dados para cumprimento de obrigações legais pelo prazo cabível.

Dados de empréstimos nos quais outros Usuários são partes poderão ser mantidos de forma anonimizada para preservar a integridade do histórico do outro Usuário.

### 7.2 Portabilidade

O Usuário pode solicitar a exportação de seus dados pessoais em formato estruturado e legível por máquina (JSON ou CSV). A solicitação será atendida em até **15 (quinze) dias úteis**.

---

## 8. Direitos do Titular (LGPD — Art. 18)

Nos termos da LGPD, o Usuário possui os seguintes direitos em relação aos seus dados pessoais, que podem ser exercidos a qualquer momento:

| Direito | Descrição |
|---------|-----------|
| **Confirmação e acesso** | Confirmar a existência de tratamento e acessar seus dados |
| **Correção** | Corrigir dados incompletos, inexatos ou desatualizados |
| **Anonimização, bloqueio ou eliminação** | De dados desnecessários, excessivos ou tratados em desconformidade |
| **Portabilidade** | Receber seus dados em formato estruturado |
| **Eliminação** | Solicitar a exclusão de dados tratados com base no consentimento |
| **Informação sobre compartilhamento** | Saber com quem seus dados são compartilhados |
| **Revogação do consentimento** | Revogar consentimento dado previamente |
| **Oposição** | Opor-se a tratamento realizado em desconformidade com a LGPD |
| **Revisão de decisões automatizadas** | Solicitar revisão de decisões tomadas por meios automatizados |

**Como exercer seus direitos:**
- E-mail: **privacidade@tacomquem.com.br** com assunto "Direitos LGPD — [seu nome]"
- Responderemos em até **15 (quinze) dias úteis**
- Podemos solicitar a verificação de identidade antes de atender a solicitação

Se não ficar satisfeito com nossa resposta, você pode contatar a **Autoridade Nacional de Proteção de Dados (ANPD)**: [www.gov.br/anpd](https://www.gov.br/anpd)

---

## 9. Cookies e Tecnologias Similares

### 9.1 Uso de Cookies

O TáComQuem utiliza tecnologias de armazenamento local (cookies e armazenamento do navegador) exclusivamente para:

- **Autenticação:** manter a sessão do Usuário logado (cookies de sessão);
- **Preferências:** armazenar preferências de interface do Usuário.

### 9.2 O que não fazemos

- **Não** utilizamos cookies de rastreamento publicitário;
- **Não** compartilhamos dados de navegação com redes de publicidade;
- **Não** realizamos rastreamento comportamental para fins comerciais.

### 9.3 Controle de Cookies

O Usuário pode configurar seu navegador para bloquear ou excluir cookies, mas isso pode afetar o funcionamento do Serviço, especialmente o sistema de autenticação.

---

## 10. Dados de Menores de Idade

O TáComQuem é aberto a Usuários de **qualquer idade**, sem restrição mínima. Entretanto, a LGPD estabelece proteções específicas que seguimos integralmente:

### 10.1 Crianças (até 12 anos)

O tratamento de dados pessoais de **crianças com até 12 anos** somente ocorrerá mediante **consentimento específico e expresso de pelo menos um dos pais ou responsável legal**, conforme art. 14 da LGPD. Ao criar uma conta ou consentir o uso da Plataforma por uma criança, o responsável legal:

- Assume integralmente a responsabilidade pelo uso da conta pela criança;
- Garante que o uso atende ao melhor interesse da criança;
- Pode solicitar a revisão, correção ou exclusão dos dados da criança a qualquer momento.

### 10.2 Adolescentes (13 a 17 anos)

Adolescentes podem utilizar a Plataforma, sendo fortemente recomendado que o façam com o conhecimento e supervisão de seus pais ou responsáveis legais.

### 10.3 Identificação de uso indevido

Caso identifiquemos que dados de uma criança foram coletados sem o devido consentimento parental, eliminaremos esses dados imediatamente. Responsáveis que identificarem tal situação devem nos contatar em privacidade@tacomquem.com.br.

---

## 11. Transferência Internacional de Dados

Nossos servidores estão localizados no Brasil. Entretanto, alguns de nossos suboperadores (e.g., Google LLC para autenticação OAuth e serviços de e-mail transacional) podem processar dados em servidores fora do Brasil.

Quando há transferência internacional, garantimos que ela ocorra em conformidade com os mecanismos previstos na LGPD (art. 33), incluindo:

- Transferência para países que ofereçam nível adequado de proteção de dados; ou
- Adoção de garantias contratuais adequadas (cláusulas-padrão ou certificações).

---

## 12. Responsável pelo Tratamento de Dados

O TáComQuem é um projeto hobby independente operado por pessoa física. O próprio responsável pela Plataforma atua como ponto de contato para questões de privacidade e proteção de dados, podendo ser acionado diretamente:

- **E-mail:** privacidade@tacomquem.com.br
- **Assunto sugerido:** "Privacidade — [sua solicitação]"

---

## 13. Alterações nesta Política

Podemos atualizar esta Política de Privacidade periodicamente. Alterações materiais serão comunicadas ao Usuário com antecedência mínima de **15 (quinze) dias** via e-mail ou notificação dentro da Plataforma, informando a data da entrada em vigor das novas condições.

O histórico de versões desta Política está disponível em [docs/legal/historico-politica.md](./historico-politica.md) (quando disponível).

---

## 14. Lei Aplicável

Esta Política é regida pelas leis da **República Federativa do Brasil**, especialmente:

- Lei nº 13.709/2018 (LGPD — Lei Geral de Proteção de Dados Pessoais)
- Lei nº 12.965/2014 (Marco Civil da Internet)
- Código de Defesa do Consumidor (Lei nº 8.078/1990), quando aplicável

---

## 15. Contato

Para dúvidas, solicitações ou exercício de direitos relacionados a esta Política de Privacidade:

- **E-mail:** privacidade@tacomquem.com.br
- **Encarregado (DPO):** privacidade@tacomquem.com.br
- **ANPD (Autoridade Nacional de Proteção de Dados):** [www.gov.br/anpd](https://www.gov.br/anpd)

---

*Esta Política de Privacidade entra em vigor na data de sua publicação e aplica-se a todos os Usuários da Plataforma TáComQuem.*
