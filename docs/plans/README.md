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
| 001 | [mvp](./001-mvp/) | Em design | MVP do TáComQuem |
