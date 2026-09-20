# Pipeline de conteúdo — planilha → site

Editores de conteúdo editam a **planilha Google compartilhada** (2 abas). O
site nunca tem textos hardcoded: tudo vem de `data.json` + `src/data/ui.json`.

## Abas

- **Coletivos** — 1 linha por coletivo: `id` (NÃO editar), `mapa`
  (ananindeua|belem|moju), `nome`, `icone` (icone-1 … icone-7), e uma coluna
  por seção (Conflitos, Ação, …). Vários itens numa célula = um por linha
  (Alt+Enter no Sheets).
- **Textos do site** — `chave` (NÃO editar), "onde aparece", `valor`.

## Comandos

```bash
bun run content:export                # data.json + ui.json → content/*.csv (semente inicial)
bun run content:import coletivos.csv  # seca: mostra o diff, não escreve
bun run content:import coletivos.csv --write   # aplica em data.json + ui.json
bun run content:import "https://docs.google.com/spreadsheets/d/ID" --write
```

Importar por URL requer `content.config.json` (copie
`content.config.example.json`) com os `gid`s das abas — e a planilha
compartilhada como **"Qualquer pessoa com o link · Leitor"**.

A importação por padrão é um **dry run** com diff célula a célula; só `--write`
altera os arquivos. Validações: ids intactos (coletivo apagado = erro, nunca
exclusão silenciosa), ícone existente, mapa conhecido, sem células de erro de
fórmula (#REF!), chaves de texto completas. `pos` (calibração) nunca vem da
planilha — é preservada do repositório. Coletivo novo entra sem `pos`: a
calibração continua sendo um passo humano (ferramenta DEV).

## Regras para as abas no Sheets

1. Formato → Número → **Texto simples** em TODA a aba (antes de colar),
   senão `+item` vira fórmula e `1/2` vira data.
2. NÃO renomeie as colunas do cabeçalho (a importação reconhece a aba pelas
   colunas, com ou sem acento).
3. Não edite as colunas `id` / `chave`.

## Build

`vite.config.ts` injeta `%ui.docTitle%` / `%ui.metaDescription%` no
`index.html` NA BUILD (não em runtime) — previews do WhatsApp/Instagram não
executam JS. `content/` e `content.config.json` são gitignored (a planilha é
a superfície de edição; o repositório mantém o JSON canônico).
