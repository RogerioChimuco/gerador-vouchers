# 🏗️ Arquitetura do Sistema

## Visão Geral

O Gerador de Vouchers é uma aplicação web Node.js/Express que processa ficheiros CSV para gerar PDFs personalizados com QR codes.

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTE                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Browser   │  │   Upload    │  │  Download   │              │
│  │   (HTML)    │  │    CSV      │  │    PDF      │              │
│  └──────┬──────┘  └──────┬──────┘  └──────▲──────┘              │
└─────────┼────────────────┼────────────────┼─────────────────────┘
          │                │                │
          ▼                ▼                │
┌─────────────────────────────────────────────────────────────────┐
│                      SERVIDOR EXPRESS                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    ROTAS                                  │    │
│  │  ┌────────┐  ┌─────────────┐  ┌────────────────────┐    │    │
│  │  │  GET / │  │ POST /proc  │  │ GET /api/download  │    │    │
│  │  └────────┘  └─────────────┘  └────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌───────────────────────────▼──────────────────────────────┐   │
│  │                   PROCESSAMENTO                           │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │   │
│  │  │  Multer  │  │   CSV    │  │    QR    │  │   PDF    │ │   │
│  │  │ (Upload) │  │  Parser  │  │   Code   │  │   Lib    │ │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SISTEMA DE FICHEIROS                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │ uploads/ │  │ qrcodes/ │  │templates/│  │  downloads/  │    │
│  │  (CSV)   │  │  (PNG)   │  │  (PDF)   │  │    (PDF)     │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Componentes Principais

### 1. Servidor Express (`server.js`)

O ficheiro principal contém toda a lógica da aplicação:

```
server.js
├── Configuração e Middleware
│   ├── CORS
│   ├── Body Parser
│   └── Static Files
│
├── Funções Utilitárias
│   ├── buildQrCodeUrl()      # Constrói URL para QR code
│   ├── detectCSVSeparator()  # Detecta separador do CSV
│   ├── processCSV()          # Processa ficheiro CSV
│   ├── generateQRCode()      # Gera imagem QR code
│   └── generateDownloadPage() # Gera HTML de download
│
├── Geração de PDF
│   ├── createVoucherPages()  # Cria páginas de voucher
│   └── createEtiquetaPDF()   # Cria etiquetas A4
│
├── Rotas de API
│   ├── GET /                 # Página principal
│   ├── POST /process-csv     # Processa vouchers
│   ├── GET /gerador-convites # Página de convites
│   ├── POST /process-invites # Processa convites
│   └── GET /api/download/*   # API de downloads
│
└── Gestão de Ficheiros
    ├── setupDirectories()    # Cria diretórios necessários
    └── cleanOldFiles()       # Limpa ficheiros antigos
```

### 2. Fluxo de Processamento de Vouchers

```
CSV Upload → Parse CSV → Gerar QR Codes → Criar PDF → Download
     │            │             │              │           │
     ▼            ▼             ▼              ▼           ▼
  Multer    csv-parser      qrcode      pdf-lib/     Streaming
  Storage   Auto-detect   PNG files    PDFKit        Response
```

### 3. Sistema de Templates

Os templates são ficheiros PDF na pasta `public/voucher_pdf/`:

```
Template PDF (Input)
       │
       ▼
┌─────────────────┐
│   pdf-lib       │ ← Carrega template
│   (embedPage)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    PDFKit       │ ← Adiciona overlay (QR + texto)
│   (overlay)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Merged PDF     │ ← Combina template + overlay
│   (Output)      │
└─────────────────┘
```

### 4. Estrutura de Posicionamento (Vouchers)

O sistema usa um array de posições para colocar 3 vouchers por página:

```javascript
const POSICOES = [
    [441, 612, 70, 30],  // Voucher 1: [x, y, tamanho_qr, offset_texto]
    [441, 400, 70, 30],  // Voucher 2
    [441, 187, 70, 30]   // Voucher 3
];
```

### 5. Sistema de Etiquetas

Para o modo etiqueta, é criada uma grelha de 5x6 (30 etiquetas por página A4):

```
┌────┬────┬────┬────┬────┐
│ 01 │ 02 │ 03 │ 04 │ 05 │
├────┼────┼────┼────┼────┤
│ 06 │ 07 │ 08 │ 09 │ 10 │
├────┼────┼────┼────┼────┤
│ 11 │ 12 │ 13 │ 14 │ 15 │
├────┼────┼────┼────┼────┤
│ 16 │ 17 │ 18 │ 19 │ 20 │
├────┼────┼────┼────┼────┤
│ 21 │ 22 │ 23 │ 24 │ 25 │
├────┼────┼────┼────┼────┤
│ 26 │ 27 │ 28 │ 29 │ 30 │
└────┴────┴────┴────┴────┘
```

## Fluxo de Dados

### Upload e Processamento

```
1. Cliente envia CSV via POST /process-csv
                    │
2. Multer guarda em /uploads/{timestamp}_{filename}
                    │
3. detectCSVSeparator() lê primeira linha
                    │
4. processCSV() parse com separador correto
                    │
5. Loop por cada linha:
   │
   ├─► buildQrCodeUrl() → cria URL com parâmetros
   │
   └─► generateQRCode() → guarda PNG em /qrcodes/session_{id}/
                    │
6. createVoucherPages() ou createEtiquetaPDF()
   │
   ├─► Carrega template PDF
   │
   ├─► Para cada grupo de vouchers:
   │   ├─► Cria overlay com PDFKit
   │   ├─► Adiciona QR codes
   │   └─► Adiciona texto (código, data)
   │
   └─► Guarda PDF em /public/downloads/
                    │
7. Retorna página HTML com link de download
                    │
8. Cliente faz GET /api/download/{filename}
                    │
9. Servidor faz streaming do ficheiro
                    │
10. Cleanup: remove CSV e QR codes temporários
```

### URL do QR Code

```
https://www.misericordiassaude.pt/aderir
    ?plano={public_id}
    &voucher={code}
    &parceiro={id_partner}
    &promotor={promotor_id}
```

## Gestão de Memória

### Estratégias de Otimização

1. **Streaming de Downloads**: Ficheiros grandes são enviados em chunks
2. **Limpeza Automática**: Ficheiros com mais de 7 minutos são removidos
3. **Processamento em Lote**: QR codes são gerados sequencialmente para evitar picos de memória

### Limites

- Recomendado máximo de ~500 vouchers por processamento
- PDFs grandes (>100MB) podem requerer mais tempo de geração

## Segurança

### Medidas Implementadas

1. **Sanitização de Nomes**: `sanitize-filename` para prevenir path traversal
2. **Validação de Input**: Verificação de campos obrigatórios no CSV
3. **CORS**: Configurado para controlar origens permitidas
4. **Headers de Download**: Content-Disposition para forçar download

### Recomendações para Produção

- Implementar autenticação (JWT, OAuth)
- Adicionar rate limiting
- Usar HTTPS
- Configurar firewall
- Implementar logging centralizado

## Extensibilidade

### Adicionar Novo Template

1. Colocar ficheiro PDF em `public/voucher_pdf/`
2. O sistema detecta automaticamente
3. Preview gerado via ImageMagick (se instalado)

### Personalizar Posições

Editar o array `POSICOES` em `server.js`:

```javascript
const POSICOES = [
    [x1, y1, size1, offset1],
    [x2, y2, size2, offset2],
    // ...
];
```

### Adicionar Campos ao QR Code

Modificar `buildQrCodeUrl()`:

```javascript
function buildQrCodeUrl(csvRow, promotorId = null) {
    // Adicionar novos parâmetros aqui
    params.append('novo_campo', csvRow.novo_campo);
}
```
