# Upload de Fotos - API

## Endpoint

```
POST /api/upload/images
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

## Request

```bash
curl -X POST http://localhost:3000/api/upload/images \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "images=@photo1.jpg" \
  -F "images=@photo2.png" \
  -F "images=@photo3.webp"
```

## Response (200 OK)

```json
{
  "images": [
    {
      "url": "https://images.tacq.app/items/user-id/abc12345-1707000000000.webp",
      "sizeBytes": 125430
    },
    {
      "url": "https://images.tacq.app/items/user-id/def67890-1707000000001.webp",
      "sizeBytes": 98765
    }
  ]
}
```

## Errors

**400 Bad Request - Invalid file type**
```json
{
  "error": "Tipo de arquivo não permitido. Use JPEG, PNG ou WebP."
}
```

**400 Bad Request - File too large**
```json
{
  "error": "Arquivo muito grande (máx 10MB)"
}
```

**400 Bad Request - No files sent**
```json
{
  "error": "Nenhum arquivo foi enviado"
}
```

**400 Bad Request - Too many files**
```json
{
  "error": "Máximo 5 arquivos por upload"
}
```

**401 Unauthorized**
```json
{
  "error": "Unauthorized"
}
```

**503 Service Unavailable**
```json
{
  "error": "Erro ao fazer upload: Storage unavailable"
}
```

## Características

- ✅ Aceita até 5 arquivos por request
- ✅ Máximo 10MB por arquivo
- ✅ Compacta automaticamente para WebP
- ✅ Redimensiona para 1080px (mantendo aspect ratio)
- ✅ Remove EXIF metadata
- ✅ Processa uploads em paralelo
- ✅ Cleanup automático de órfãos após 24h

## Tipos de arquivo aceitos

- JPEG (.jpg, .jpeg)
- PNG (.png)
- WebP (.webp)
- HEIC (.heic)
- TIFF (.tiff)

## Cleanup de órfãos

Uploads que não são confirmados em um item são deletados automaticamente após 24 horas.

**Como confirmar um upload:**
1. Fazer upload: `POST /api/upload/images`
2. Copiar URL da resposta
3. Criar item: `POST /api/items` com `images: [url]`

Se o item for criado, o upload é confirmado e não será deletado.
Se o upload não for usado, será deletado após 24h.

## Fluxo completo

```bash
# 1. Fazer upload de imagens
RESPONSE=$(curl -X POST http://localhost:3000/api/upload/images \
  -H "Authorization: Bearer $TOKEN" \
  -F "images=@photo.jpg")

# 2. Extrair URL da resposta
IMAGE_URL=$(echo $RESPONSE | jq -r '.images[0].url')

# 3. Criar item com a imagem
curl -X POST http://localhost:3000/api/items \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"Furadeira\",
    \"description\": \"Furadeira Bosch\",
    \"images\": [\"$IMAGE_URL\"]
  }"
```

## Processamento de imagem

Todas as imagens passam por processamento automático:

1. **Validação de tipo** - Verifica magic bytes (não apenas extensão)
2. **Validação de tamanho** - Rejeita arquivos > 10MB
3. **Redimensionamento** - Máximo 1080px (mantém proporção)
4. **Conversão** - Converte para WebP com qualidade 80%
5. **Limpeza de metadados** - Remove EXIF para privacidade
6. **Upload para R2** - Armazenamento durável na nuvem
7. **Registro no banco** - Rastreia uploads para cleanup

## Performance

- Processamento paralelo de múltiplos arquivos
- ~150-300ms por arquivo
- ~300-500ms para 5 arquivos em paralelo
- Redução média de 80% no tamanho dos arquivos
