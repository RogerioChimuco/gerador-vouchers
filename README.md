# 🎫 Gerador de Vouchers - MS Saúde

<p align="center">
  <img src="public/images/logo.svg" alt="MS Saúde Logo" width="200">
</p>

<p align="center">
  <strong>Sistema profissional para geração de vouchers e convites com QR Codes</strong>
</p>

<p align="center">
  <a href="#-funcionalidades">Funcionalidades</a> •
  <a href="#-instalação">Instalação</a> •
  <a href="#-uso">Uso</a> •
  <a href="#-api">API</a> •
  <a href="#-contribuição">Contribuição</a>
</p>

---

## 📋 Sobre o Projeto

O **Gerador de Vouchers** é uma aplicação web desenvolvida para a MS Saúde que permite a geração em massa de vouchers e convites personalizados com QR Codes. O sistema processa ficheiros CSV e gera PDFs prontos para impressão.

### ✨ Principais Características

- 🎨 **Múltiplos Templates** - Escolha entre diversos modelos de vouchers
- 📱 **QR Codes Dinâmicos** - Cada voucher recebe um QR code único com URL de adesão
- 📊 **Processamento em Lote** - Processe centenas de vouchers de uma vez
- 📥 **Download Robusto** - Sistema de download com progresso e retry automático
- 🏷️ **Etiquetas** - Gere folhas de etiquetas (30 por página A4)
- 💼 **Promotores** - Associe vouchers a promotores específicos (opcional)

## 🚀 Funcionalidades

### Gerador de Vouchers
- Upload de ficheiro CSV com dados dos vouchers
- Seleção de template visual
- Campo opcional para ID do promotor
- Geração de PDF com QR codes incorporados
- Download automático com barra de progresso

### Gerador de Convites
- Templates específicos para convites
- Geração de múltiplos PDFs
- Download em formato ZIP

### API REST
- `/api/download/:filename` - Download de ficheiros com suporte a resumable downloads
- `/api/check-file/:filename` - Verificar existência de ficheiros
- `/api/list-downloads` - Listar ficheiros disponíveis

## 📦 Instalação

### Pré-requisitos

- Node.js 18+ 
- npm ou yarn

### Passos

```bash
# Clonar o repositório
git clone https://github.com/RogerioChimuco/gerador-vouchers.git

# Entrar no diretório
cd gerador-vouchers

# Instalar dependências
npm install

# Iniciar o servidor
npm start
```

O servidor estará disponível em `http://localhost:3000`

## 💻 Uso

### 1. Preparar o CSV

O ficheiro CSV deve conter as seguintes colunas:
- `code` - Código único do voucher
- `expiration_date` - Data de expiração (formato: YYYY-MM-DD)
- `public_id` - ID público do plano (opcional)
- `id_partner` - ID do parceiro (opcional)

**Exemplo:**
```csv
code;expiration_date;public_id;id_partner
ABC123;2025-12-31;plano-001;partner-123
DEF456;2025-12-31;plano-001;partner-123
```

> 💡 O sistema detecta automaticamente o separador (vírgula ou ponto-e-vírgula)

### 2. Gerar Vouchers

1. Acesse `http://localhost:3000`
2. Selecione um template
3. (Opcional) Insira o ID do promotor
4. Faça upload do ficheiro CSV
5. Clique em "Gerar Vouchers"
6. O download iniciará automaticamente

### 3. Estrutura do QR Code

O QR Code gerado contém uma URL no formato:
```
https://www.misericordiassaude.pt/aderir?plano={public_id}&voucher={code}&parceiro={id_partner}&promotor={promotor_id}
```

## 🔧 Configuração

### Variáveis de Ambiente

| Variável | Descrição | Default |
|----------|-----------|---------|
| `PORT` | Porta do servidor | 3000 |

### Adicionar Novos Templates

1. Coloque o ficheiro PDF em `public/voucher_pdf/`
2. O sistema gerará automaticamente a preview PNG (requer ImageMagick)
3. Ou coloque manualmente uma imagem PNG em `public/previews/` com o mesmo nome

## 📁 Estrutura do Projeto

```
gerador-vouchers/
├── server.js              # Servidor Express principal
├── package.json           # Dependências e scripts
├── public/
│   ├── images/           # Imagens estáticas (logo, favicon)
│   ├── fonts/            # Fontes Poppins
│   ├── voucher_pdf/      # Templates PDF de vouchers
│   ├── convite_pdf/      # Templates PDF de convites
│   ├── previews/         # Miniaturas dos templates
│   └── downloads/        # PDFs gerados (temporário)
├── qrcodes/              # QR codes gerados (temporário)
├── uploads/              # CSVs carregados (temporário)
└── docs/
    └── ARCHITECTURE.md   # Documentação da arquitetura
```

## 🔌 API

### Download de Ficheiro
```http
GET /api/download/:filename
```
Suporta Range headers para downloads resumíveis.

### Verificar Ficheiro
```http
GET /api/check-file/:filename
```
**Resposta:**
```json
{
  "exists": true,
  "size": 1234567,
  "created": "2025-01-02T12:00:00Z"
}
```

### Listar Downloads
```http
GET /api/list-downloads
```
**Resposta:**
```json
{
  "files": [
    { "name": "vouchers.pdf", "size": 1234567, "created": "2025-01-02T12:00:00Z" }
  ]
}
```

## 🛠️ Stack Tecnológica

- **Runtime:** Node.js
- **Framework:** Express.js
- **PDF:** pdf-lib, PDFKit
- **QR Codes:** qrcode
- **Upload:** Multer
- **Compressão:** Archiver

## 🤝 Contribuição

Contribuições são bem-vindas! Por favor, leia o [CONTRIBUTING.md](CONTRIBUTING.md) para detalhes.

## 📄 Licença

Este projeto está licenciado sob a Licença MIT - veja o ficheiro [LICENSE](LICENSE) para detalhes.

## 👥 Autores

- **MS Saúde** - Desenvolvimento inicial

## 📞 Suporte

Para suporte, entre em contacto através do email: suporte@misericordiassaude.pt

---

<p align="center">
  Desenvolvido com ❤️ para <strong>MS Saúde</strong>
</p>
