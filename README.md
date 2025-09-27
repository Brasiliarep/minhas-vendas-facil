# Minhas Vendas Fácil (PWA)

App offline (PWA) para controle simples de vendas de vinhos: pedidos, clientes, produtos, catálogos, receitas/lucro, despesas, agenda e prospects (GPS).

## Publicar no GitHub Pages (rápido)

1. Crie um repositório no GitHub (ex.: `minhas-vendas-facil`).
2. Envie **todos os arquivos** desta pasta para a raiz do repositório.
3. Vá em **Settings → Pages** e, em **Build and deployment**, selecione:
   - **Source:** `Deploy from a branch`
   - **Branch:** `main` (ou `master`) / **Folder:** `/ (root)`
4. Clique **Save**. A URL será `https://<seu-usuario>.github.io/minhas-vendas-facil/`.

> Dica: mantenha o arquivo `.nojekyll` na raiz para evitar processamento do Jekyll.

### Alternativa: GitHub Actions
Se preferir via Actions, mantenha o arquivo `.github/workflows/pages.yml` incluído neste pacote.
A cada push no `main`, o site será implantado automaticamente.

## Instalar como App
Abra a URL no celular e toque **Adicionar à tela inicial**. O app funciona **offline** (PWA + IndexedDB).

## Desenvolvimento local
Abra `index.html` no navegador (ou sirva com um servidor estático). O *Service Worker* só ativa via `http(s)`.
