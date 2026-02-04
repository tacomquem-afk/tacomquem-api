# Upload de Fotos para R2 — Design Document

**Data:** 2026-02-04
**Status:** Validado via Brainstorming
**Feature:** Upload e compactação de fotos de itens com armazenamento em Cloudflare R2

---

## 1. Visão Geral

Sistema de upload de fotos com:
- ✅ Múltiplos arquivos por upload (até 5)
- ✅ Compactação server-side para WebP (80% redução)
- ✅ Processamento paralelo
- ✅ Cleanup automático de órfãos após 24h
- ✅ Armazenamento durável em R2

**Problema resolvido:** MVP precisa de forma eficiente e segura para usuários fazerem upload de fotos dos itens que desejam emprestar, com compactação automática para reduzir custos de storage.

---

## 2. Decisões de Design

### 2.1 Upload Location

| Opção | Decisão | Por quê |
|-------|---------|--------|
| **Backend processa** | ✅ Selecionado | Validação segura, controle de tamanho, compactação obrigatória |
| Client direto (presigned URL) | ❌ Não | Menos controle, LLM pode consumir mais |

### 2.2 Processamento de Imagem

| Aspecto | Decisão | Justificativa |
|--------|---------|---------------|
| **Biblioteca** | Sharp (Rust-based) | 3-5x mais rápido que alternativas puras |
| **Formato** | WebP | 97% suporte em 2026, 80% menor que JPEG |
| **Dimensões** | Max 1080px | Adequado para web/mobile, bom LOD |
| **Qualidade** | 80% | Sweet spot entre quality e tamanho |
| **EXIF** | Remove automático | Segurança + reduz tamanho |

### 2.3 Armazenamento de Metadata

| Tabela | Objetivo |
|--------|----------|
| **uploads** | Rastrear todos os arquivos enviados |
| **confirmedAt** | NULL = órfão (ainda não usado em item) |
| **cleanup CRON** | Delete automático após 24h não-confirmado |

### 2.4 Validações

```
1. Magic bytes (não confiar em MIME type do client)
2. Tamanho: max 10MB por arquivo
3. Tipos: JPEG, PNG, WebP, HEIC, TIFF
4. Rate limit: 5 archivos max por request
```

---

## 3. Arquitetura

### 3.1 Fluxo Principal

```
┌─────────────────────────────────────────────────────────────────┐
│ CLIENTE                                                         │
│                                                                 │
│  POST /api/upload/images                                       │
│  Authorization: Bearer <token>                                 │
│  Body: multipart/form-data                                     │
│    - images: [file1.jpg, file2.png, file3.webp]               │
└──────────────────────┬──────────────────────────────────────────┘
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ FASTIFY SERVER                                                  │
│                                                                 │
│  1. Autenticação (JWT)                                         │
│  2. Multipart parsing                                          │
│  3. Para cada arquivo em paralelo:                             │
│     ├─ Ler buffer completo                                    │
│     ├─ Validar tamanho (< 10MB)                               │
│     ├─ Validar magic bytes (file-type)                        │
│     ├─ Processing com Sharp:                                  │
│     │  ├─ Resize 1080px (fit: inside, no enlarge)           │
│     │  ├─ Converter para WebP (quality: 80)                  │
│     │  ├─ Remove EXIF metadata                                │
│     │  └─ Retorna buffer                                      │
│     ├─ Upload para R2 (items/userId/id.webp)                │
│     └─ Registrar em DB (confirmedAt = null)                  │
│  4. Retornar URLs                                              │
└──────────────────────┬──────────────────────────────────────────┘
                       │ JSON
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ CLIENTE                                                         │
│                                                                 │
│  Response 200 OK:                                              │
│  {                                                             │
│    "images": [                                                │
│      {                                                        │
│        "url": "https://images.tacq.app/items/...",           │
│        "sizeBytes": 125430                                    │
│      }                                                        │
│    ]                                                          │
│  }                                                            │
│                                                              │
│  ← Cliente agora tem URLs para usar em POST /api/items       │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Confirmação e Cleanup

```
┌─────────────────────────────────────────────────────────────────┐
│ PASSO 1: Upload (criou registro com confirmedAt = null)        │
│                                                                 │
│ uploads table:                                                 │
│  id | userId | url | confirmedAt | createdAt                 │
│  1  | user-1 | ... | NULL        | 2026-02-04 10:00          │
└─────────────────────────────────────────────────────────────────┘
                       │
                       ├─ OPÇÃO A: Usuário cria item com essa URL
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ PASSO 2: Item criado (marca como confirmado)                   │
│                                                                 │
│ POST /api/items { name: "Furadeira", images: [url] }          │
│                                                                 │
│ Backend executa:                                               │
│  UPDATE uploads SET confirmedAt = NOW()                       │
│  WHERE userId = user-1 AND url IN ([...])                     │
│                                                                 │
│ uploads table:                                                 │
│  id | userId | url | confirmedAt | createdAt                 │
│  1  | user-1 | ... | 2026-02-04  | 2026-02-04 10:00          │
│                      10:05                                     │
└─────────────────────────────────────────────────────────────────┘
                       │
                       └─ Arquivo está SEGURO, não será deletado
                       │
                       ├─ OPÇÃO B: Usuário ignora (não usa URL)
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ CRON JOB: Diário às 3 da manhã                                  │
│                                                                 │
│ SELECT * FROM uploads                                          │
│ WHERE confirmedAt IS NULL                                      │
│ AND createdAt < NOW() - interval '24 hours'                   │
│                                                                 │
│ Resultado: uploads que não foram usados há 24h                │
│                                                                 │
│ Para cada registro:                                            │
│  1. DELETE /R2/items/userId/id.webp                           │
│  2. DELETE FROM uploads WHERE id = ...                        │
│                                                                 │
│ ✓ Lixo removido, economia de storage                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3.3 Estrutura de Diretórios no R2

```
s3://tacq-images/
└── items/
    ├── user-id-1/
    │   ├── abc12345-1707000000000.webp    (confirmado)
    │   ├── def67890-1707000000000.webp    (confirmado)
    │   └── ghi11111-1707000000001.webp    (órfão → deletado após 24h)
    │
    ├── user-id-2/
    │   ├── jkl22222-1707000000000.webp
    │   └── mno33333-1707000000000.webp
    │
    └── user-id-3/
        └── pqr44444-1707000000000.webp
```

---

## 4. API Endpoint

### 4.1 Request

```http
POST /api/upload/images HTTP/1.1
Authorization: Bearer eyJhbGc...
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="images"; filename="photo1.jpg"
Content-Type: image/jpeg

[binary data]
------WebKitFormBoundary
Content-Disposition: form-data; name="images"; filename="photo2.png"
Content-Type: image/png

[binary data]
------WebKitFormBoundary--
```

**Limites:**
- Max 5 arquivos por request
- Max 10MB por arquivo
- Max 50MB total por request

### 4.2 Response (200 OK)

```json
{
  "images": [
    {
      "url": "https://images.tacq.app/items/550e8400-e29b-41d4-a716-446655440000/abc12345-1707000000000.webp",
      "sizeBytes": 125430
    },
    {
      "url": "https://images.tacq.app/items/550e8400-e29b-41d4-a716-446655440000/def67890-1707000000001.webp",
      "sizeBytes": 98765
    }
  ]
}
```

### 4.3 Error Responses

**400 - Invalid Image Type**
```json
{
  "error": "Tipo de arquivo não permitido. Use JPEG, PNG ou WebP."
}
```

**400 - File Too Large**
```json
{
  "error": "Arquivo muito grande (máx 10MB)"
}
```

**400 - No Files Sent**
```json
{
  "error": "Nenhum arquivo foi enviado"
}
```

**401 - Unauthorized**
```json
{
  "error": "Unauthorized"
}
```

**503 - Storage Unavailable**
```json
{
  "error": "Erro ao fazer upload: Storage unavailable"
}
```

---

## 5. Schema do Banco

### 5.1 Tabela Uploads

```sql
CREATE TABLE uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relacionamento
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Metadata do arquivo após processamento
  url TEXT NOT NULL UNIQUE,          -- URL pública completa
  key TEXT NOT NULL,                 -- items/userId/id.webp
  filename VARCHAR(255) NOT NULL,    -- Nome original upado
  mime_type VARCHAR(100) NOT NULL,   -- image/webp
  size_bytes INTEGER NOT NULL,       -- Tamanho final compactado

  -- Confirmação
  confirmed_at TIMESTAMP,            -- NULL = órfão

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Índices para queries comuns
CREATE INDEX idx_uploads_user_id ON uploads(user_id);
CREATE INDEX idx_uploads_confirmed_at ON uploads(confirmed_at);
CREATE UNIQUE INDEX idx_uploads_url ON uploads(url);
```

### 5.2 Relações em Drizzle

```typescript
export const uploadsRelations = relations(uploads, ({ one }) => ({
  user: one(users, {
    fields: [uploads.userId],
    references: [users.id],
  }),
}));

// Em usersRelations:
uploads: many(uploads),
```

---

## 6. Componentes

### 6.1 Configuração (src/config/r2.ts)

```typescript
import { S3Client } from '@aws-sdk/client-s3';

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});
```

### 6.2 Serviço (src/services/storage/index.ts)

```typescript
export async function processAndUploadImage(
  file: ImageFile,
  userId: string
): Promise<UploadResult>

export async function deleteUploadFromR2(key: string): Promise<void>
```

### 6.3 Cleanup (src/services/storage/cleanup.ts)

```typescript
export function startCleanupJob(): void
// Roda diariamente às 03:00
```

### 6.4 Rota (src/routes/upload/index.ts)

```typescript
POST /api/upload/images
- Multipart form-data parsing
- Arquivo parallelization
- Error handling
- Response com URLs
```

---

## 7. Integração com Items

Quando um item é criado com imagens, o backend:

```typescript
export async function createItem(
  ownerId: string,
  input: CreateItemInput
): Promise<ItemResponse> {
  // 1. Insere item
  const item = await db.insert(items).values({...});

  // 2. Marca uploads como confirmadas
  if (input.images?.length > 0) {
    await db.update(uploads)
      .set({ confirmedAt: new Date() })
      .where(
        and(
          eq(uploads.userId, ownerId),
          inArray(uploads.url, input.images)
        )
      );
  }

  return item;
}
```

---

## 8. Performance

### 8.1 Processamento

| Operação | Tempo |
|----------|-------|
| Leitura do arquivo | ~5ms |
| Validação magic bytes | ~1ms |
| Sharp resize + webp | ~30-50ms |
| Upload para R2 | ~100-200ms |
| DB insert | ~5ms |
| **Total (1 arquivo)** | ~150-300ms |
| **5 arquivos paralelos** | ~300-500ms |

### 8.2 Compactação

| Formato Original | Tamanho | Tamanho WebP | Redução |
|------------------|---------|------------|----------|
| JPEG 4000x3000 | 2.5MB | 450KB | **82%** |
| PNG 1080x1080 | 800KB | 180KB | **77%** |
| HEIC 5000x3000 | 3MB | 520KB | **83%** |

**Estimativa mensal (1000 uploads):**
- Entrada média: 1.5MB × 1000 = 1.5GB
- Saída média: 250KB × 1000 = 250MB
- **Economia: 83% de storage**

---

## 9. Segurança

### 9.1 Validações

- ✅ JWT autenticação obrigatória
- ✅ Magic bytes (não MIME type apenas)
- ✅ Tamanho máximo enforçado
- ✅ Whitelist de tipos
- ✅ EXIF removal (privacy)
- ✅ Rate limiting no endpoint

### 9.2 Armazenamento R2

- ✅ Bucket privado (apenas app acessa)
- ✅ Custom domain público para leitura
- ✅ Presigned URLs não usadas (security)
- ✅ Cache control: 1 ano (immutable)
- ✅ CORS configurado para frontend

### 9.3 Limpeza

- ✅ Órfãos deletados automaticamente
- ✅ No manual cleanup necessário
- ✅ TTL de 24h eficiente

---

## 10. Operações

### 10.1 Monitoramento

Queries a monitorar:

```sql
-- Uploads órfãos não deletados (bug alert)
SELECT COUNT(*) FROM uploads
WHERE confirmed_at IS NULL
AND created_at < NOW() - interval '25 hours';

-- Tamanho total de storage
SELECT SUM(size_bytes) / 1024 / 1024 as total_mb
FROM uploads;

-- Top users por armazenamento
SELECT user_id, COUNT(*) as files, SUM(size_bytes) / 1024 / 1024 as mb
FROM uploads
WHERE confirmed_at IS NOT NULL
GROUP BY user_id
ORDER BY mb DESC;
```

### 10.2 Troubleshooting

| Problema | Causa | Solução |
|----------|-------|--------|
| Upload falha com 503 | R2 indisponível | Retry automático do cliente |
| Arquivo no R2 mas não no DB | Crash entre upload e DB | Manual cleanup no R2 |
| Órfãos não sendo deletados | CRON job parado | Verificar logs do servidor |
| WebP não renderiza | Cliente antigo | Fallback detectado no frontend |

---

## 11. Futuras Melhorias (pós-MVP)

- [ ] WebP com fallback JPEG automático
- [ ] Geração de thumbnails (200x200)
- [ ] CDN cache no Cloudflare
- [ ] Crop/rotate na rota antes de upload
- [ ] Limite por usuário (disco quota)
- [ ] Admin dashboard para cleanup manual

