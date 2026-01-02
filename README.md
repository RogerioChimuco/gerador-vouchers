# 🎫 Gerador de Vouchers - MS Saúde

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-blue.svg)](https://expressjs.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Sistema web para geração automática de vouchers e convites em PDF com QR Codes para a Misericórdias Saúde.

![Screenshot](public/images/logo.svg)

## ✨ Funcionalidades

- 📄 **Geração de Vouchers PDF** - Cria PDFs com vouchers personalizados a partir de ficheiros CSV
- 📱 **QR Codes Automáticos** - Gera QR codes únicos para cada voucher
- 🎨 **Templates Personalizáveis** - Múltiplos templates de voucher disponíveis
- 🏷️ **Etiquetas** - Modo especial para impressão de etiquetas (30 por página A4)
- 💌 **Gerador de Convites** - Sistema separado para geração de convites
- 📥 **Download Robusto** - Sistema de download com progresso e retry automático
- 🔄 **Auto-detecção CSV** - Suporta separadores vírgula (,) e ponto-e-vírgula (;)

## 🚀 Início Rápido

### Pré-requisitos

- Node.js 18+ 
- npm ou yarn

### Instalação

```bash
# Clonar o repositório
git clone https://github.com/seu-usuario/gerador-vouchers.git
cd gerador-vouchers

# Instalar dependências
npm install

# Iniciar o servidor
npm start
```

O servidor estará disponível em `http://localhost:3000`

### Scripts Disponíveis

```bash
npm start     # Inicia o servidor em produção
npm run dev   # Inicia em modo de desenvolvimento (com watch)
```

## 📖 Como Usar

### 1. Geração de Vouchers

1. Acesse `http://localhost:3000`
2. Selecione um template de voucher
3. Faça upload do ficheiro CSV
4. Clique em "Gerar Vouchers"
5. O download iniciará automaticamente

### 2. Formato do CSV

O ficheiro CSV deve conter as seguintes colunas:

| Coluna | Descrição | Obrigatório |
|--------|-----------|-------------|
| `code` | Código único do voucher | ✅ |
| `expiration_date` | Data de expiração (YYYY-MM-DD) | ✅ |
| `public_id` | ID do plano | ❌ |
| `id_partner` | ID do parceiro | ❌ |

**Exemplo:**
```csv
code;expiration_date;public_id;id_partner
ABC123;2025-12-31;plan-001;partner-001
DEF456;2025-12-31;plan-001;partner-001
```

### 3. Geração de Convites

1. Acesse `http://localhost:3000/gerador-convites`
2. Selecione um modelo de convite
3. Faça upload do ficheiro CSV com os códigos
4. Receba um ficheiro ZIP com todos os convites

## 🔧 Configuração

### Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `PORT` | Porta do servidor | `3000` |

### Promotor ID

Para associar vouchers a um promotor específico, edite o ficheiro `server.js`:

```javascript
const DEFAULT_PROMOTOR_ID = "seu-promotor-id";
```

## 📁 Estrutura do Projeto

```
gerador-vouchers/
├── server.js              # Servidor principal Express
├── package.json           # Dependências e scripts
├── public/
│   ├── voucher_pdf/       # Templates de vouchers (.pdf)
│   ├── convite_pdf/       # Templates de convites (.pdf)
│   ├── previews/          # Miniaturas dos templates
│   ├── downloads/         # PDFs gerados (temporário)
│   ├── images/            # Imagens estáticas
│   └── fonts/             # Fontes (Poppins)
├── qrcodes/               # QR codes temporários
├── uploads/               # CSVs temporários
└── temp_output/           # Ficheiros temporários
```

## 🔌 API Endpoints

### Páginas

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/` | Página principal (Gerador de Vouchers) |
| GET | `/gerador-convites` | Gerador de Convites |

### Processamento

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/process-csv` | Processa CSV e gera vouchers |
| POST | `/process-invites` | Processa CSV e gera convites (ZIP) |

### API de Downloads

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/download/:filename` | Download com streaming |
| GET | `/api/check-file/:filename` | Verifica existência do ficheiro |
| GET | `/api/list-downloads` | Lista ficheiros disponíveis |

## 🛠️ Tecnologias

- **Backend**: Node.js, Express.js
- **PDF**: pdf-lib, PDFKit
- **QR Code**: qrcode
- **Upload**: Multer
- **Compressão**: Archiver, JSZip
- **Parsing**: csv-parser

## 📋 Requisitos do Sistema

- Node.js 18.0.0 ou superior
- 512MB RAM mínimo (recomendado 1GB+ para ficheiros grandes)
- Espaço em disco para ficheiros temporários

## 🤝 Contribuição

Contribuições são bem-vindas! Por favor, leia o [CONTRIBUTING.md](CONTRIBUTING.md) para detalhes.

## 📄 Licença

Este projeto está licenciado sob a Licença MIT - veja o ficheiro [LICENSE](LICENSE) para detalhes.

## 👥 Autores

- **MS Saúde** - Desenvolvimento inicial

## 🙏 Agradecimentos

- Misericórdias Saúde pelo suporte
- Comunidade open-source pelas bibliotecas utilizadas

---

Feito com ❤️ para MS Saúde
