# Planos de Implementação

Este diretório contém os planos de implementação do TáComQuem, organizados por iniciativa.

## Estrutura

```
plans/
├── README.md                    # Este arquivo
└── NNN-<nome-da-iniciativa>/    # Pasta por iniciativa
    ├── design.md                # Documento de design (o que construir)
    ├── implementation.md        # Plano de implementação (como construir)
    └── assets/                  # Mockups, diagramas, etc.
```

## Convenções

- **Numeração:** Iniciativas são numeradas sequencialmente (001, 002, ...)
- **Nomenclatura:** `NNN-nome-em-kebab-case`
- **Design primeiro:** Sempre criar `design.md` antes de implementar
- **Implementação:** Criar `implementation.md` quando for executar

## Iniciativas

| # | Nome | Status | Descrição |
|---|------|--------|-----------|
| 001 | [mvp](./001-mvp/) | Em implementação | MVP do TáComQuem (Auth, Items, Loans essenciais) |
| 001.1 | [upload-r2](./001-mvp/002-upload-r2-implementation.md) | Pronto para implementar | Upload de fotos com compactação para R2 |
| 003 | [admin-backoffice](./003-admin-backoffice/) | Design validado | Sistema admin com RBAC, moderação e analytics |
| 004 | [auth-swagger-fix](./004-auth-swagger-fix/) | Proposto | Correção de bug de role no login + documentação Swagger |
