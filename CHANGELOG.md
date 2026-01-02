# Changelog

Todas as alterações notáveis neste projeto serão documentadas neste ficheiro.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [1.1.0] - 2026-01-02

### Adicionado
- 🆕 Sistema de download robusto com streaming e suporte a downloads resumíveis
- 🆕 API REST para downloads (`/api/download/:filename`)
- 🆕 Endpoint para verificar ficheiros (`/api/check-file/:filename`)
- 🆕 Endpoint para listar downloads (`/api/list-downloads`)
- 🆕 Detecção automática de separador CSV (vírgula ou ponto-e-vírgula)
- 🆕 Barra de progresso visual no download
- 🆕 Sistema de retry automático (até 3 tentativas)
- 🆕 Favicon SVG personalizado
- 🆕 Preview placeholder para template de etiquetas
- 🆕 Documentação completa (README, ARCHITECTURE, CONTRIBUTING, CHANGELOG)

### Melhorado
- ⬆️ Interface de download com feedback visual melhorado
- ⬆️ Normalização de headers CSV para snake_case
- ⬆️ Headers HTTP para downloads (Content-Disposition, Cache-Control)
- ⬆️ Suporte a CORS
- ⬆️ Scripts npm (start, dev)

### Corrigido
- 🐛 Erro 404 para etiqueta.png
- 🐛 Erro 404 para favicon.ico
- 🐛 Parsing de CSV com ponto-e-vírgula

## [1.0.0] - 2025-05-23

### Adicionado
- 🎉 Versão inicial do Gerador de Vouchers
- ✨ Geração de vouchers PDF a partir de CSV
- ✨ Geração de QR codes únicos para cada voucher
- ✨ Múltiplos templates de voucher
- ✨ Modo etiqueta (30 vouchers por página A4)
- ✨ Gerador de convites separado
- ✨ Interface web responsiva
- ✨ Pré-visualização de templates
- ✨ Limpeza automática de ficheiros temporários

---

## Tipos de Alterações

- 🎉 `Added` - Novas funcionalidades
- ⬆️ `Changed` - Alterações em funcionalidades existentes
- 🗑️ `Deprecated` - Funcionalidades marcadas para remoção futura
- ❌ `Removed` - Funcionalidades removidas
- 🐛 `Fixed` - Correções de bugs
- 🔒 `Security` - Correções de vulnerabilidades
