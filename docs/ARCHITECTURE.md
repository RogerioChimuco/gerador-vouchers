# Arquitetura do Sistema - Gerador de Vouchers

## 📐 Visão Geral

O Gerador de Vouchers é uma aplicação web monolítica baseada em Node.js/Express que segue o padrão MVC simplificado. O sistema é otimizado para processamento de ficheiros CSV e geração de PDFs em lote.

## 🏗️ Arquitetura de Alto Nível

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTE (Browser)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Interface  │  │   Upload    │  │  Download Manager       │  │
│  │  HTML/CSS   │  │   CSV       │  │  (Progress + Retry)     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SERVIDOR (Express.js)                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    Middlewares                           │    │
│  │  • CORS  • Body Parser  • Static Files  • Multer        │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│  ┌───────────────┬───────────────┬───────────────────────────┐  │
│  │    Rotas      │    Rotas      │        API REST           │  │
│  │   Vouchers    │   Convites    │    /api/download          │  │
│  │  /process-csv │/process-invite│    /api/check-file        │  │
│  └───────────────┴───────────────┴───────────────────────────┘  │
│                              │                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 Serviços de Processamento                │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │    │
│  │  │ CSV Parser  │  │ QR Code Gen │  │ PDF Generator   │  │    │
│  │  │(auto-detect)│  │  (qrcode)   │  │(pdf-lib/pdfkit) │  │    │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SISTEMA DE FICHEIROS                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  uploads/   │  │  qrcodes/   │  │  public/downloads/      │  │
│  │ (temporário)│  │ (temporário)│  │  (PDFs gerados)         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 🔄 Fluxo de Processamento de Vouchers

```
1. Upload CSV          2. Parsing           3. Geração QR        4. Geração PDF
┌─────────────┐       ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   Cliente   │──────▶│   Multer    │──────▶│  csv-parser │──────▶│   qrcode    │
│   (POST)    │       │  (upload)   │       │(auto-detect)│       │  (PNG)      │
└─────────────┘       └─────────────┘       └─────────────┘       └─────────────┘
                                                                         │
                                                                         ▼
5. Download           6. Limpeza            7. Overlay            8. Template
┌─────────────┐       ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   Cliente   │◀──────│   Auto      │◀──────│   PDFKit    │◀──────│   pdf-lib   │
│ (streaming) │       │  cleanup    │       │  (overlay)  │       │  (template) │
└─────────────┘       └─────────────┘       └─────────────┘       └─────────────┘
```

## 📦 Componentes Principais

### 1. Servidor Express (`server.js`)

O ficheiro principal contém toda a lógica da aplicação:

```javascript
// Estrutura principal
├── Imports & Configuração
├── Middlewares (CORS, Body Parser, Static)
├── Funções Utilitárias
│   ├── buildQrCodeUrl()      // Construir URL do QR
│   ├── generateQRCode()      // Gerar QR PNG
│   ├── processCSV()          // Parse CSV com auto-detect
│   ├── createVoucherPages()  // Gerar páginas do PDF
│   ├── createEtiquetaPDF()   // Gerar etiquetas
│   └── generateDownloadPage() // HTML de download
├── Rotas
│   ├── GET /                 // Página principal
│   ├── POST /process-csv     // Processar vouchers
│   ├── GET /gerador-convites // Página de convites
│   ├── POST /process-invites // Processar convites
│   └── API REST (/api/*)     // Download endpoints
└── Inicialização
```

### 2. Sistema de Templates

```
public/voucher_pdf/
├── template.pdf           # Template padrão
├── template2.pdf          # Variante 2
├── template3.pdf          # Variante 3
├── voucher-albufeira.pdf  # Regional
└── voucher-comerciante-v1.pdf

public/previews/
├── template.png           # Preview auto-gerada
├── template2.png
├── etiqueta.png          # Preview manual (SVG)
└── ...
```

### 3. Geração de QR Codes

O sistema usa parâmetros dinâmicos para construir a URL:

```javascript
function buildQrCodeUrl(csvRow, promotorId) {
    const baseUrl = "https://www.misericordiassaude.pt/aderir";
    const params = new URLSearchParams();
    
    if (csvRow.public_id) params.append('plano', csvRow.public_id);
    if (csvRow.code) params.append('voucher', csvRow.code);
    if (csvRow.id_partner) params.append('parceiro', csvRow.id_partner);
    if (promotorId) params.append('promotor', promotorId);
    
    return `${baseUrl}?${params.toString()}`;
}
```

### 4. Sistema de Download

Implementação robusta com:
- **Streaming** - Não carrega ficheiro inteiro em memória
- **Range Headers** - Suporte a downloads resumíveis
- **Progress Tracking** - Barra de progresso no frontend
- **Auto-retry** - Até 3 tentativas em caso de falha

```javascript
// Frontend - Download com progresso
const reader = response.body.getReader();
while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    updateProgress(received / total * 100);
}
```

## 🔐 Segurança

### Medidas Implementadas

1. **Sanitização de Ficheiros**
   - Nomes de ficheiros sanitizados com `sanitize-filename`
   - Validação de tipos de ficheiro

2. **Headers de Segurança**
   - `X-Content-Type-Options: nosniff`
   - `Cache-Control: no-store` para downloads

3. **Limpeza Automática**
   - Ficheiros temporários removidos após 7 minutos
   - Cleanup após processamento

4. **CORS**
   - Configurado para aceitar apenas origens autorizadas

## 📊 Performance

### Otimizações

1. **Processamento em Lote**
   - QR codes gerados em paralelo
   - PDFs compostos por overlay (não recriação)

2. **Gestão de Memória**
   - Streaming de ficheiros grandes
   - Buffers libertados após uso

3. **Cache de Templates**
   - Templates PDF carregados uma vez por request
   - Previews PNG cacheadas

### Limites

| Recurso | Limite Recomendado |
|---------|-------------------|
| Tamanho CSV | < 10MB |
| Vouchers por lote | < 500 |
| PDF resultante | < 200MB |

## 🔄 Escalabilidade

### Atual (Monólito)
- ✅ Adequado para uso interno
- ✅ Simples de manter
- ❌ Limitado a uma instância

### Futuro (Microserviços)
```
┌─────────────────┐     ┌─────────────────┐
│   API Gateway   │────▶│  Queue (Redis)  │
└─────────────────┘     └─────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│  CSV Service  │     │  QR Service   │     │  PDF Service  │
└───────────────┘     └───────────────┘     └───────────────┘
```

## 📝 Decisões de Arquitetura

### Por que Express.js?
- Simplicidade e maturidade
- Vasto ecossistema de middlewares
- Boa performance para I/O bound

### Por que pdf-lib + PDFKit?
- **pdf-lib**: Manipulação de PDFs existentes (templates)
- **PDFKit**: Geração de conteúdo novo (overlays, etiquetas)
- Combinação permite flexibilidade máxima

### Por que processamento síncrono?
- Simplifica gestão de estado
- Adequado para tamanho atual de lotes
- Facilita debug e manutenção

## 🔮 Roadmap Técnico

1. **Curto Prazo**
   - [ ] Adicionar testes unitários
   - [ ] Implementar logging estruturado
   - [ ] Dockerizar aplicação

2. **Médio Prazo**
   - [ ] Queue para processamento assíncrono
   - [ ] Cache Redis para templates
   - [ ] Métricas Prometheus

3. **Longo Prazo**
   - [ ] Separar em microserviços
   - [ ] API GraphQL
   - [ ] Interface administrativa
