const archiver = require('archiver');
const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const path = require('path');
const QRCode = require('qrcode');
const fs = require('fs');
const bodyParser = require('body-parser');
const cors = require('cors');
const compression = require('compression');
const PDFKit = require('pdfkit');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
// const { parse } = require('csv-parse/sync'); // Not used, csv-parser handles it
const sanitize = require('sanitize-filename');
const fsPromises = require('fs').promises;
const { execSync } = require('child_process');
const JSZip = require('jszip');

const port = process.env.PORT || 3000;
const app = express();

// Compressão gzip/brotli para todas as respostas
app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));
// Detectar ambiente Vercel (filesystem read-only exceto /tmp)
const IS_VERCEL = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
const TEMP_BASE = IS_VERCEL ? '/tmp' : __dirname;

// Configurações de caminho
const FONT_PATH_BOLD = path.join(__dirname, 'public', 'fonts', 'Poppins', 'Poppins-Bold.ttf');
const FONT_PATH_REGULAR = path.join(__dirname, 'public', 'fonts', 'Poppins', 'Poppins-Regular.ttf');
const QRCODE_BASE_DIR = path.join(TEMP_BASE, 'qrcodes');
const PREVIEW_DIR = path.join(__dirname, 'public', 'previews');
const TEMPLATES_CONVITE_DIR = path.join(__dirname, 'public', 'convite_pdf');
const TEMP_OUTPUT_DIR = path.join(TEMP_BASE, 'temp_output');

// Posições base dos 3 vouchers por página [x, yBase, size, offset]
// yBase controla a altura - valores maiores = mais acima
const POSICOES = [
    [441, 612, 70, 30],
    [441, 400, 70, 30],
    [441, 187, 70, 30]
];

// Ajuste vertical para subir todos os elementos (em pixels)
// Valor positivo = sobe, negativo = desce
const VERTICAL_OFFSET_ADJUSTMENT = 50;

// Middlewares
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Ficheiros estáticos com cache agressivo (imagens, fonts, etc.)
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '365d',  // Cache por 1 ano
    etag: true,
    immutable: true,
    setHeaders: (res, filePath) => {
        // Cache de 1 ano para imagens, fonts e assets estáticos
        if (filePath.match(/\.(png|jpg|jpeg|gif|svg|webp|avif|woff|woff2|ttf|eot|css|js)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));

// Diretório de downloads com headers especiais (dinâmico para Vercel)
const DOWNLOADS_DIR = IS_VERCEL ? '/tmp/downloads' : path.join(__dirname, 'public', 'downloads');
app.use('/downloads', express.static(DOWNLOADS_DIR, {
    setHeaders: (res, filePath) => {
        res.set('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
        res.set('Content-Type', 'application/pdf');
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
}));

const MAX_AGE = 7 * 60 * 1000;

// --- New Function to build QR Code URL ---
/**
 * Builds the URL for the QR code based on CSV data and an optional promotor ID.
 * @param {object} csvRow - A row object from the parsed CSV. Expected properties: public_id, code, id_partner.
 * @param {string|null} [promotorId=null] - An optional promotor ID.
 * @returns {string} The constructed URL.
 */
function buildQrCodeUrl(csvRow, promotorId = null) {
    const baseUrl = "https://www.misericordiassaude.pt/aderir";
    const params = new URLSearchParams();

    if (csvRow.public_id && csvRow.public_id.trim() !== "") {
        params.append('plano', csvRow.public_id.trim());
    }
    if (csvRow.code && csvRow.code.trim() !== "") {
        params.append('voucher', csvRow.code.trim());
    }
    if (csvRow.id_partner && csvRow.id_partner.trim() !== "") {
        params.append('parceiro', csvRow.id_partner.trim());
    }
    if (promotorId && String(promotorId).trim() !== "") { // Convert promotorId to string before trim
        params.append('promotor', String(promotorId).trim());
    }

    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

// Promotor ID (not from CSV as per your instructions)
// You can set this to null or "" if no default promotor should be used.
const DEFAULT_PROMOTOR_ID = "";

// ============================================================
// ROTAS DE DOWNLOAD ROBUSTAS
// ============================================================

/**
 * Rota de download com streaming e tratamento de erros robusto
 * Suporta resumable downloads (Range headers)
 */
app.get('/api/download/:filename', async (req, res) => {
    try {
        const filename = sanitize(req.params.filename);
        const filePath = path.join(DOWNLOADS_DIR, filename);

        // Verificar se o arquivo existe
        if (!fs.existsSync(filePath)) {
            console.error(`Arquivo não encontrado: ${filePath}`);
            return res.status(404).json({ 
                error: 'Arquivo não encontrado',
                message: 'O ficheiro solicitado não existe ou foi removido.'
            });
        }

        const stat = await fsPromises.stat(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        // Headers comuns
        const commonHeaders = {
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'X-Content-Type-Options': 'nosniff'
        };

        // Suporte a Range requests (resumable downloads)
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = (end - start) + 1;

            res.writeHead(206, {
                ...commonHeaders,
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Content-Length': chunkSize,
                'Content-Type': 'application/pdf'
            });

            const stream = fs.createReadStream(filePath, { start, end });
            stream.on('error', (err) => {
                console.error('Erro no stream:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Erro ao ler arquivo' });
                }
            });
            stream.pipe(res);
        } else {
            // Download completo
            res.writeHead(200, {
                ...commonHeaders,
                'Content-Length': fileSize,
                'Content-Type': 'application/pdf'
            });

            const stream = fs.createReadStream(filePath);
            stream.on('error', (err) => {
                console.error('Erro no stream:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Erro ao ler arquivo' });
                }
            });
            stream.pipe(res);
        }
    } catch (error) {
        console.error('Erro no download:', error);
        res.status(500).json({ 
            error: 'Erro interno',
            message: error.message 
        });
    }
});

/**
 * Rota para verificar status do arquivo antes de download
 */
app.get('/api/check-file/:filename', async (req, res) => {
    try {
        const filename = sanitize(req.params.filename);
        const filePath = path.join(DOWNLOADS_DIR, filename);

        if (!fs.existsSync(filePath)) {
            return res.json({ exists: false });
        }

        const stat = await fsPromises.stat(filePath);
        res.json({
            exists: true,
            size: stat.size,
            created: stat.birthtime,
            modified: stat.mtime
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * Rota para listar arquivos disponíveis para download
 */
app.get('/api/list-downloads', async (req, res) => {
    try {
        if (!fs.existsSync(DOWNLOADS_DIR)) {
            return res.json({ files: [] });
        }
        
        const files = await fsPromises.readdir(DOWNLOADS_DIR);
        const fileStats = await Promise.all(
            files.filter(f => f.endsWith('.pdf')).map(async (file) => {
                const stat = await fsPromises.stat(path.join(DOWNLOADS_DIR, file));
                return {
                    name: file,
                    size: stat.size,
                    created: stat.birthtime
                };
            })
        );
        
        res.json({ files: fileStats });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// PÁGINA PRINCIPAL
// ============================================================

app.get('/', async (req, res) => {
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '0');

    const templatesDir = path.join(__dirname, 'public', 'voucher_pdf');
    let templates = [];
    try {
        templates = fs.readdirSync(templatesDir)
            .filter(file => file.endsWith('.pdf'))
            .sort((a, b) => a.localeCompare(b));
    } catch (err) {
        console.error('Erro ao ler templates PDF:', err);
    }

    templates.unshift('etiqueta.pdf'); 

    const defaultTemplate = templates.includes('template1.pdf')
        ? 'template1.pdf'
        : templates[0] || 'etiqueta.pdf'; 

    const previews = templates.map(template => {
        const previewFilenameBase = template.replace(/\.pdf$/i, '');
        const previewFilename = `${previewFilenameBase}.png`;
        const previewFilePath = path.join(PREVIEW_DIR, previewFilename);
        let previewFileUrl = `/previews/${encodeURIComponent(previewFilename)}`;

        if (template === 'etiqueta.pdf') {
            const etiquetaPreviewPath = path.join(PREVIEW_DIR, 'etiqueta.png');
            if (!fs.existsSync(etiquetaPreviewPath)) {
                console.warn(`Preview image 'etiqueta.png' not found in ${PREVIEW_DIR}. Please create one.`);
            }
            previewFileUrl = '/previews/etiqueta.png'; 
        } else if (!fs.existsSync(previewFilePath)) {
            try {
                const inputPath = path.join(templatesDir, template);
                if (fs.existsSync(inputPath)) { 
                    const command = `magick -density 150 "${inputPath}[0]" -quality 90 "${previewFilePath}"`;
                    execSync(command);
                    console.log(`Miniatura gerada para ${template}`);
                } else {
                    console.warn(`Source PDF for template ${template} not found at ${inputPath}. Cannot generate preview.`);
                }
            } catch (error) {
                console.error(`Erro ao gerar miniatura para ${template}:`, error);
            }
        }

        return `
        <div class="template-preview ${template === defaultTemplate ? 'selected' : ''}"
            onclick="selectTemplate('${template}')" title="${template}">
            <img src="${previewFileUrl}" alt="Preview de ${template}" loading="lazy" decoding="async" style="width: 100%;">
        </div>
        `;
    }).join('');

    res.send(`
        <!DOCTYPE html>
        <html lang="pt">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Gerador de Vouchers - MS Saúde</title>
            <link rel="icon" type="image/svg+xml" href="/favicon.svg">
            <style>
                :root {
                    --primary: #164769;
                    --secondary: #3498db;
                    --accent: #e74c3c;
                    --light: #ecf0f1;
                    --radius: 8px;
                    --shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                    font-family: 'Segoe UI', system-ui, sans-serif;
                }
                body {
                    min-height: 100vh;
                    display: grid;
                    place-items: center;
                    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                    padding: 1rem;
                }
                .container {
                    background: white;
                    padding: 2rem;
                    border-radius: var(--radius);
                    box-shadow: var(--shadow);
                    width: 100%;
                    max-width: 600px;
                    transition: transform 0.3s ease;
                }
                h1 {
                    color: var(--primary);
                    text-align: center;
                    margin-bottom: 2rem;
                    font-size: 1.8rem;
                    position: relative;
                }
                h1::after {
                    content: '';
                    display: block;
                    width: 60px;
                    height: 3px;
                    background: var(--secondary);
                    margin: 0.5rem auto;
                    border-radius: 2px;
                }
                form {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }
                input[type="file"] {
                    width: 100%;
                    padding: 1rem;
                    border: 2px dashed var(--secondary);
                    border-radius: var(--radius);
                    background: #f8f9fa;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }
                input[type="file"]:hover {
                    border-style: solid;
                    background: #fff;
                }
                button[type="submit"] {
                    padding: 1rem;
                    background: var(--secondary);
                    color: white;
                    border: none;
                    border-radius: var(--radius);
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                }
                button[type="submit"]:hover {
                    background: #2980b9;
                    transform: translateY(-1px);
                }
                .links {
                    margin-top: 2rem;
                    text-align: center;
                }
                .links a {
                    color: var(--secondary);
                    text-decoration: none;
                    margin: 0 1rem;
                    transition: color 0.3s ease;
                }
                .links a:hover {
                    color: var(--primary);
                }
                img.logo {
                    width: 200px;
                    height: auto;
                    margin-bottom: 2rem;
                    display: block;
                    margin-left: auto;
                    margin-right: auto;
                }
                .template-container {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); 
                    gap: 1rem; 
                    margin-bottom: 1rem;
                }
                .template-preview {
                    border: 2px solid #ddd;
                    border-radius: 8px;
                    padding: 2px; 
                    cursor: pointer;
                    transition: transform 0.2s, border-color 0.2s;
                    overflow: hidden; 
                }
                .template-preview img {
                    display: block; 
                    width: 100%;
                    height: auto; 
                    border-radius: 6px; 
                }
                .template-preview.selected {
                    border-color: var(--secondary); 
                    transform: scale(1.05); 
                }
                 h4 { 
                    color: var(--primary);
                    margin-bottom: 0.5rem; 
                    font-size: 1.1rem;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <img src="/images/logo.svg" alt="Logo MS Saúde" class="logo" fetchpriority="high" decoding="async">
                <h1>Gerador de Vouchers</h1>
                
                <h4>Templates:</h4>
                <div class="template-container">
                    ${previews}
                </div>
                
                <h4>ID do Promotor (opcional):</h4>
                <input type="text" name="promotorId" id="promotorId" placeholder="Ex: 123 ou deixe vazio" style="width: 100%; padding: 0.8rem; border: 2px solid #ddd; border-radius: var(--radius); margin-bottom: 1rem; font-size: 1rem;">
                
                <h4>Ficheiro CSV:</h4>
                <form action="/process-csv" method="post" enctype="multipart/form-data">
                    <input type="hidden" name="template" id="selectedTemplate" value="${defaultTemplate}">
                    <input type="hidden" name="promotorId" id="promotorIdHidden" value="">
                    <input type="file" name="csvFile" accept=".csv" required>
                    <button type="submit">Gerar Vouchers</button>
                </form>
                
                <div style="border-top: 1px solid #e0e0e0; margin: 2rem 0;"></div>
                <a href="/gerador-convites" style="display:block; text-decoration: none; background-color: #7f8c8d; color: white; padding: 1rem; border-radius: 8px; font-weight: bold; transition: background-color 0.3s;">Ir para o Gerador de Convites</a>
            </div>

            <script>
                function selectTemplate(template) {
                    document.querySelectorAll('.template-preview').forEach(el => 
                        el.classList.remove('selected')
                    );
                    const selectedElement = document.querySelector(\`[onclick="selectTemplate('\${template}')"]\`);
                    if (selectedElement) {
                        selectedElement.classList.add('selected');
                    }
                    document.getElementById('selectedTemplate').value = template;
                }
                document.addEventListener('DOMContentLoaded', () => {
                    const defaultSelectedElement = document.querySelector(\`[onclick="selectTemplate('${defaultTemplate}')"]\`);
                     if (defaultSelectedElement) {
                        defaultSelectedElement.classList.add('selected');
                    }
                    
                    // Sincronizar campo promotor com o formulário
                    const promotorInput = document.getElementById('promotorId');
                    const promotorHidden = document.getElementById('promotorIdHidden');
                    if (promotorInput && promotorHidden) {
                        promotorInput.addEventListener('input', () => {
                            promotorHidden.value = promotorInput.value.trim();
                        });
                    }
                });
            </script>
        </body>
        </html>
    `);
});

app.use(express.static(path.join(__dirname, 'public'), {
    index: false
}));

const UPLOAD_DIR = path.join(TEMP_BASE, 'uploads');
const DOWNLOADS_OUTPUT_DIR = IS_VERCEL ? path.join('/tmp', 'downloads') : path.join(__dirname, 'public', 'downloads');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Garantir que o diretório existe
        if (!fs.existsSync(UPLOAD_DIR)) {
            fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        }
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const sanitizedName = sanitize(file.originalname);
        cb(null, `${timestamp}_${sanitizedName}`);
    }
});

const upload = multer({ storage: storage });

const setupDirectories = async () => {
    const dirs = [
        UPLOAD_DIR,
        QRCODE_BASE_DIR,
        TEMP_OUTPUT_DIR,
        DOWNLOADS_OUTPUT_DIR
    ];
    
    // Em ambiente local, criar também diretórios não-temp
    if (!IS_VERCEL) {
        dirs.push(path.join(__dirname, 'output'));
        dirs.push(PREVIEW_DIR);
    }
    
    for (const dir of dirs) {
        try {
            await fsPromises.mkdir(dir, { recursive: true });
        } catch (e) {
            console.log(`Aviso: Não foi possível criar ${dir}: ${e.message}`);
        }
    }
};


const generateQRCode = async (data, outputPath) => {
    const options = {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 300,
        color: { dark: '#000000', light: '#ffffff' }
    };
    await QRCode.toFile(outputPath, data, options);
};

const createFolderName = (originalFilename) => {
    const dateStr = new Date().toISOString().split('T')[0];
    const baseName = path.parse(originalFilename).name;
    return sanitize(`${baseName}_${dateStr}`);
};

async function cleanDirectory(directory) {
    try {
        if (!fs.existsSync(directory)) { 
            console.log(`Diretório para limpeza não encontrado: ${directory}`);
            return;
        }
        const entries = await fsPromises.readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                await cleanDirectory(fullPath); 
                const remaining = await fsPromises.readdir(fullPath);
                if (remaining.length === 0) { 
                    await fsPromises.rmdir(fullPath);
                    console.log(`Diretório vazio removido: ${fullPath}`);
                }
            } else {
                const stats = await fsPromises.stat(fullPath);
                if (Date.now() - stats.mtimeMs > MAX_AGE) {
                    await fsPromises.unlink(fullPath);
                    console.log(`Arquivo antigo removido: ${fullPath}`);
                }
            }
        }
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error(`Erro ao limpar o diretório ${directory}:`, err);
        }
    }
}


async function cleanOldFiles() {
    console.log("Iniciando limpeza de arquivos antigos...");
    const directoriesToClean = [
        UPLOAD_DIR,
        QRCODE_BASE_DIR,
        DOWNLOADS_DIR
    ];
    for (const dir of directoriesToClean) {
        await cleanDirectory(dir);
    }
    console.log("Limpeza de arquivos antigos concluída.");
}

setInterval(cleanOldFiles, 60 * 1000);

app.post('/process-csv', upload.single('csvFile'), async (req, res) => {
    let folderName; // Declare folderName here to be accessible in catch block
    try {
        if (!req.file) {
            return res.status(400).send('Nenhum arquivo CSV enviado.');
        }
        const records = await processCSV(req.file.path);

        const selectedTemplate = req.body.template || 'template1.pdf';
        const promotorId = req.body.promotorId ? req.body.promotorId.trim() : '';

        folderName = createFolderName(req.file.originalname); // Assign here
        const qrCodeDir = path.join(QRCODE_BASE_DIR, folderName);
        await fsPromises.mkdir(qrCodeDir, { recursive: true });

        for (const row of records) {
            // Ensure essential fields for QR and file naming are present
            if (!row.code || !row.expiration_date) {
                console.warn("Linha do CSV ignorada por falta de 'code' ou 'expiration_date':", row);
                continue; 
            }
            const fileName = sanitize(`qrcode_${row.code}_${row.expiration_date}.png`);
            const qrCodePath = path.join(qrCodeDir, fileName);
            
            // Build URL for QR code using the new function
            // Usa o promotorId do formulário ou o DEFAULT_PROMOTOR_ID como fallback
            const qrDataUrl = buildQrCodeUrl(row, promotorId || DEFAULT_PROMOTOR_ID);
            // console.log(`Gerando QR Code para URL: ${qrDataUrl}`); // Debugging
            
            await generateQRCode(qrDataUrl, qrCodePath);
        }

        const vouchers = records
            .filter(row => row.code && row.expiration_date) // Ensure they are valid for PDF
            .map(row => [row.code.trim(), row.expiration_date.trim()]);

        let pdfDoc;
        if (selectedTemplate === 'etiqueta.pdf') {
            pdfDoc = await createEtiquetaPDF(vouchers, folderName);
        } else {
            const templatePath = path.join(__dirname, 'public', 'voucher_pdf', selectedTemplate);
            if (!fs.existsSync(templatePath)) {
                if (req.file.path) await fsPromises.rm(req.file.path, { force: true }).catch(e => console.warn(e));
                if (qrCodeDir) await fsPromises.rm(qrCodeDir, { recursive: true, force: true }).catch(e => console.warn(e));
                return res.status(400).send(`Template ${selectedTemplate} não encontrado.`);
            }
            pdfDoc = await createVoucherPages(templatePath, vouchers, folderName);
        }

        const pdfBytes = await pdfDoc.save();

        const csvBaseName = path.parse(req.file.originalname).name;
        const dateStr = new Date().toISOString().split('T')[0];
        const pdfFilename = `${csvBaseName}_${dateStr}.pdf`;
        const outputPath = path.join(DOWNLOADS_DIR, pdfFilename);
        
        // Garantir que o diretório existe
        await fsPromises.mkdir(DOWNLOADS_DIR, { recursive: true });
        await fsPromises.writeFile(outputPath, pdfBytes);

        // Calcular tamanho do arquivo para exibição
        const fileSizeKB = Math.round(pdfBytes.length / 1024);
        const fileSizeMB = (pdfBytes.length / (1024 * 1024)).toFixed(2);
        const fileSizeDisplay = (fileSizeKB > 1024) ? (fileSizeMB + ' MB') : (fileSizeKB + ' KB');

        res.send(generateDownloadPage(pdfFilename, fileSizeDisplay, vouchers.length));

        await fsPromises.unlink(req.file.path).catch(err => console.warn(`Falha ao remover CSV: ${err.message}`));
        await fsPromises.rm(qrCodeDir, { recursive: true, force: true }).catch(err => console.warn(`Falha ao remover diretório de QR: ${err.message}`));

    } catch (error) {
        console.error('Erro no processamento /process-csv:', error);
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            await fsPromises.unlink(req.file.path).catch(err => console.warn(`Falha ao remover CSV em erro: ${err.message}`));
        }
        if (folderName) { // Use the folderName variable from the outer scope
             const qrCodeDirOnError = path.join(QRCODE_BASE_DIR, folderName);
             if (fs.existsSync(qrCodeDirOnError)) {
                await fsPromises.rm(qrCodeDirOnError, { recursive: true, force: true }).catch(err => console.warn(`Falha ao remover diretório de QR em erro: ${err.message}`));
             }
        }
        res.status(500).send('Erro no processamento: ' + error.message);
    }
});

// ============================================================
// FUNÇÃO PARA GERAR PÁGINA DE DOWNLOAD
// ============================================================
function generateDownloadPage(pdfFilename, fileSizeDisplay, voucherCount) {
    const encodedFilename = encodeURIComponent(pdfFilename);
    // Link direto para download - browser ou app de download do utilizador faz o resto
    const directDownloadUrl = '/downloads/' + encodedFilename;
    
    return `<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PDF Gerado - MS Saúde</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
    <style>
        :root { --primary: #164769; --secondary: #3498db; --green: #28a745; --light: #f8f9fa; --radius: 12px; --shadow: 0 10px 40px rgba(0,0,0,0.1); }
        * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', system-ui, sans-serif; }
        body { min-height: 100vh; display: grid; place-items: center; background: linear-gradient(135deg, #f8f9fa 0%, #e2e6ea 100%); padding: 1rem; }
        .container { background: white; padding: 2.5rem; border-radius: var(--radius); box-shadow: var(--shadow); width: 100%; max-width: 500px; text-align: center; }
        .success-icon { width: 80px; height: 80px; background: var(--green); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem; }
        .success-icon svg { width: 40px; height: 40px; fill: white; }
        h1 { color: var(--primary); margin-bottom: 0.5rem; font-size: 1.5rem; }
        .subtitle { color: #666; font-size: 0.95rem; margin-bottom: 1.5rem; }
        .file-info { background: var(--light); padding: 1.25rem; border-radius: 8px; margin: 1.5rem 0; }
        .file-info p { color: #666; font-size: 0.9rem; margin: 0.25rem 0; }
        .file-info .filename { color: var(--primary); font-weight: 600; word-break: break-all; font-size: 1rem; }
        .download-btn { display: inline-flex; align-items: center; justify-content: center; gap: 10px; padding: 1rem 2rem; background: var(--green); color: white; font-weight: 600; font-size: 1.1rem; text-decoration: none; border-radius: var(--radius); transition: all 0.3s ease; width: 100%; margin-bottom: 1rem; }
        .download-btn:hover { background: #218838; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(40,167,69,0.4); }
        .download-btn svg { width: 24px; height: 24px; fill: currentColor; }
        .copy-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 0.75rem 1.5rem; background: #6c757d; color: white; font-weight: 500; font-size: 0.9rem; text-decoration: none; border-radius: 8px; border: none; cursor: pointer; transition: all 0.3s ease; width: 100%; margin-bottom: 1rem; }
        .copy-btn:hover { background: #5a6268; }
        .copy-btn svg { width: 18px; height: 18px; fill: currentColor; }
        .secondary-btn { display: inline-block; padding: 0.75rem 1.5rem; background: var(--secondary); color: white; text-decoration: none; border-radius: 8px; font-weight: 500; transition: all 0.3s ease; }
        .secondary-btn:hover { background: #2980b9; }
        .logo { width: 150px; margin-bottom: 1.5rem; }
        .info-box { background: #e7f3ff; border: 1px solid #b6d4fe; color: #0c5460; padding: 1rem; border-radius: 8px; margin: 1rem 0; font-size: 0.85rem; text-align: left; }
        .info-box strong { display: block; margin-bottom: 0.5rem; }
        .copied-toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #28a745; color: white; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 500; opacity: 0; transition: opacity 0.3s ease; pointer-events: none; }
        .copied-toast.show { opacity: 1; }
    </style>
</head>
<body>
    <div class="container">
        <img src="/images/logo.svg" alt="Logo MS Saúde" class="logo" fetchpriority="high" decoding="async">
        <div class="success-icon">
            <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        </div>
        <h1>Vouchers Gerados com Sucesso!</h1>
        <p class="subtitle">O seu PDF está pronto para download</p>
        
        <div class="file-info">
            <p class="filename">${pdfFilename}</p>
            <p>📄 Tamanho: ${fileSizeDisplay} • 🎫 ${voucherCount} voucher(s)</p>
        </div>
        
        <a href="${directDownloadUrl}" class="download-btn" download="${pdfFilename}">
            <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
            Baixar PDF
        </a>
        
        <button class="copy-btn" onclick="copyLink()">
            <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
            Copiar Link de Download
        </button>
        
        <div class="info-box">
            <strong>💡 Dica:</strong>
            Clique com o botão direito no botão "Baixar PDF" e selecione "Guardar link como..." para escolher onde guardar o ficheiro, ou use o seu gestor de downloads preferido.
        </div>
        
        <a href="/" class="secondary-btn">Gerar Novos Vouchers</a>
    </div>
    
    <div class="copied-toast" id="toast">✓ Link copiado!</div>
    
    <script>
        const downloadUrl = window.location.origin + '${directDownloadUrl}';
        
        function copyLink() {
            navigator.clipboard.writeText(downloadUrl).then(() => {
                const toast = document.getElementById('toast');
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 2000);
            }).catch(() => {
                // Fallback para browsers antigos
                const textarea = document.createElement('textarea');
                textarea.value = downloadUrl;
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                
                const toast = document.getElementById('toast');
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 2000);
            });
        }
    </script>
</body>
</html>`;
}

/**
 * Detecta automaticamente o separador do CSV (vírgula ou ponto-e-vírgula)
 */
async function detectCSVSeparator(filePath) {
    const firstLine = await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
        let data = '';
        stream.on('data', chunk => {
            data += chunk;
            const newlineIndex = data.indexOf('\n');
            if (newlineIndex !== -1) {
                stream.destroy();
                resolve(data.substring(0, newlineIndex));
            }
        });
        stream.on('end', () => resolve(data));
        stream.on('error', reject);
    });
    
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    
    return semicolonCount > commaCount ? ';' : ',';
}

async function processCSV(filePath) {
    const separator = await detectCSVSeparator(filePath);
    console.log(`CSV detectado com separador: "${separator}"`);
    
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
            .pipe(csv({ 
                separator: separator,
                mapHeaders: ({ header }) => header.trim().replace(/^["']|["']$/g, '').toLowerCase().replace(/\s+/g, '_')
            })) 
            .on('data', data => results.push(data))
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}



async function createVoucherPages(templatePath, vouchers, qrCodeSubFolder) {
    const templateBytes = await fsPromises.readFile(templatePath);
    const templateDoc = await PDFDocument.load(templateBytes);
    const templatePages = templateDoc.getPages();
    const numTemplatePages = templatePages.length;
    const [firstTemplatePage] = templatePages; 
    const { width, height } = firstTemplatePage.getSize();

    const pdfDoc = await PDFDocument.create(); 

    for (let i = 0; i < vouchers.length; i += 3) { 
        const voucherGroup = vouchers.slice(i, i + 3);

        const overlayDocKit = new PDFKit({ size: [width, height], autoFirstPage: false });
        overlayDocKit.addPage({ margin: 0 }); 
        overlayDocKit.registerFont('Poppins-Bold', FONT_PATH_BOLD);
        overlayDocKit.registerFont('Poppins-Regular', FONT_PATH_REGULAR);

        voucherGroup.forEach((voucher, idx) => {
            if (idx >= POSICOES.length) return; 

            const [code, expirationDate] = voucher;
            const [x, yBase, size, offset] = POSICOES[idx];
            
            // Aplicar ajuste vertical global (subir elementos)
            const adjustedYBase = yBase + VERTICAL_OFFSET_ADJUSTMENT;
            
            const fileName = sanitize(`qrcode_${code}_${expirationDate}.png`);
            const qrCodePath = path.join(QRCODE_BASE_DIR, qrCodeSubFolder, fileName);

            if (!fs.existsSync(qrCodePath)) {
                console.error('QR code ausente em:', qrCodePath);
                overlayDocKit.font('Poppins-Regular').fontSize(8).fillColor('red');
                overlayDocKit.text('QR Code N/A', x, height - adjustedYBase - size / 2, { width: size, align: 'center' });
                return;
            }

            // ========== GRUPO DE ELEMENTOS DO VOUCHER ==========
            // Posição Y base para todo o grupo (QR + código + data)
            const groupBaseY = height - adjustedYBase - size;
            
            // 1. QR Code
            overlayDocKit.image(qrCodePath, x, groupBaseY, {
                width: size,
                height: size
            });

            // 2. Código do voucher (abaixo do QR)
            overlayDocKit.font('Poppins-Bold').fontSize(9).fillColor('#164769');
            const codeText = code;
            const codeWidth = overlayDocKit.widthOfString(codeText);
            const codeX = x + (size / 2) - (codeWidth / 2);
            const codeY = groupBaseY + size + 19; // 20px  abaixo do QR
            overlayDocKit.text(codeText, codeX, codeY);

            // 3. Data de validade (abaixo do código)
            overlayDocKit.font('Poppins-Regular').fontSize(6).fillColor('#164769');
            const dateText = `*ativação válida até ${expirationDate.trim()}`;
            const dateWidth = overlayDocKit.widthOfString(dateText);
            const dateX = x + (size / 2) - (dateWidth / 2);
            const dateY = codeY + 53; // 12px abaixo do código
            
            // Fundo branco para a data
            const padding = 3;
            const rectHeight = 10;
            overlayDocKit.rect(
                dateX - padding,
                dateY - 2,
                dateWidth + (padding * 2),
                rectHeight
            )
            .fillColor('white')
            .fill()
            .fillColor('#164769');
            
            overlayDocKit.text(dateText, dateX, dateY);
            // ========== FIM DO GRUPO ==========
        });

        const overlayBytes = await new Promise((resolvePromise, rejectPromise) => {
            const chunks = [];
            overlayDocKit.on('data', chunk => chunks.push(chunk));
            overlayDocKit.on('end', () => resolvePromise(Buffer.concat(chunks)));
            overlayDocKit.on('error', rejectPromise);
            overlayDocKit.end();
        });

        const overlayPdfLibDoc = await PDFDocument.load(overlayBytes);
        const [overlayPageForEmbedding] = overlayPdfLibDoc.getPages();

        const [copiedTemplatePage] = await pdfDoc.copyPages(templateDoc, [0]); 
        const newPage = pdfDoc.addPage(copiedTemplatePage);

        const embeddedOverlayPage = await pdfDoc.embedPage(overlayPageForEmbedding);
        newPage.drawPage(embeddedOverlayPage, {
            x: 0,
            y: 0,
            xScale: 1,
            yScale: 1,
        });

        for (let pageIndex = 1; pageIndex < numTemplatePages; pageIndex++) {
            const [copiedExtraPage] = await pdfDoc.copyPages(templateDoc, [pageIndex]);
            pdfDoc.addPage(copiedExtraPage);
        }
    }
    return pdfDoc;
}


async function createEtiquetaPDF(vouchers, qrCodeSubFolder) {
    return new Promise(async (resolve, reject) => {
        const doc = new PDFKit({
            size: 'A4', 
            margins: { top: 30, bottom: 30, left: 30, right: 30 }
        });

        try {
            doc.registerFont('Poppins-Bold', FONT_PATH_BOLD);
            doc.registerFont('Poppins-Regular', FONT_PATH_REGULAR);
        } catch (fontError) {
            console.error("Erro ao registrar fontes para PDFKit:", fontError);
            return reject(new Error("Falha ao registrar fontes Poppins. Verifique os caminhos dos arquivos .ttf."));
        }

        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', async () => {
            const pdfBytes = Buffer.concat(buffers);
            try {
                const pdfLibDoc = await PDFDocument.load(pdfBytes);
                resolve(pdfLibDoc);
            } catch (err) {
                console.error("Erro ao carregar bytes do PDFKit no PDFDocument (pdf-lib):", err);
                reject(err);
            }
        });
        doc.on('error', (err) => {
            console.error("Erro no stream do PDFKit:", err);
            reject(err);
        });

        const pageMarginTop = doc.page.margins.top;
        const pageMarginLeft = doc.page.margins.left;
        const pageContentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const pageContentHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;

        const numCols = 5;
        const numRows = 6;
        
        const colGap = 0; 
        const rowGap = 0;

        const labelWidth = (pageContentWidth - (colGap * (numCols - 1))) / numCols;
        const labelHeight = (pageContentHeight - (rowGap * (numRows - 1))) / numRows;

        let currentVoucherIndex = 0;
        let pageHasBeenAdded = false;

        const cellPaddingTopRatio = 0.05;   
        const cellPaddingBottomRatio = 0.05; 
        const qrWidthRatio = 0.9;            
        const qrToTitlePaddingRatio = 0.03; 
        const titleToCodeBoxPaddingRatio = 0.03;
        const codeBoxHeightRatio = 0.16;    
        const codeBoxWidthRatio = 0.9;     


        while (currentVoucherIndex < vouchers.length) {
            if (pageHasBeenAdded) {
                doc.addPage();
            } else {
                pageHasBeenAdded = true; 
            }

            for (let r = 0; r < numRows; r++) {
                for (let c = 0; c < numCols; c++) {
                    if (currentVoucherIndex >= vouchers.length) break;

                    const voucher = vouchers[currentVoucherIndex];
                    const [code, expirationDate] = voucher;

                    const cellX = pageMarginLeft + c * (labelWidth + colGap);
                    const cellY = pageMarginTop + r * (labelHeight + rowGap);

                    doc.rect(cellX, cellY, labelWidth, labelHeight)
                       .lineWidth(0.5) 
                       .strokeColor('#164769') 
                       .stroke();

                    const cellInternalPaddingTop = labelHeight * cellPaddingTopRatio;
                    const cellInternalPaddingBottom = labelHeight * cellPaddingBottomRatio;
                    
                    const titleText = "O SEU VOUCHER";
                    const titleFontSize = Math.max(6, Math.min(8, labelHeight * 0.075)); 
                    doc.font('Poppins-Bold').fontSize(titleFontSize); 
                    const titleActualHeight = doc.heightOfString(titleText, { width: labelWidth * 0.9 }); 
                    
                    const codeBoxActualHeight = Math.max(12, labelHeight * codeBoxHeightRatio);

                    const paddingAfterQR = labelHeight * qrToTitlePaddingRatio;
                    const paddingAfterTitle = labelHeight * titleToCodeBoxPaddingRatio;

                    let availableHeightForQR = labelHeight - cellInternalPaddingTop - titleActualHeight - codeBoxActualHeight - paddingAfterQR - paddingAfterTitle - cellInternalPaddingBottom;
                    availableHeightForQR = Math.max(20, availableHeightForQR); 

                    const qrYInCell_offset = cellInternalPaddingTop; 
                    let actualQrSize = Math.min(labelWidth * qrWidthRatio, availableHeightForQR);
                    actualQrSize = Math.max(20, actualQrSize); 

                    const qrXInCell_offset = (labelWidth - actualQrSize) / 2; 
                    
                    const qrCodeFileName = sanitize(`qrcode_${code}_${expirationDate}.png`);
                    const qrCodePath = path.join(QRCODE_BASE_DIR, qrCodeSubFolder, qrCodeFileName);

                    if (fs.existsSync(qrCodePath)) {
                        doc.image(qrCodePath, cellX + qrXInCell_offset, cellY + qrYInCell_offset, {
                            width: actualQrSize,
                            height: actualQrSize
                        });
                    } else {
                        console.warn(`QR Code não encontrado para etiqueta: ${qrCodePath}`);
                        const qrErrorMsg = "QR N/A";
                        const errorFontSize = Math.max(6, actualQrSize * 0.12);
                        doc.font('Poppins-Regular').fontSize(errorFontSize).fillColor('red');
                        doc.text(qrErrorMsg, 
                                 cellX + qrXInCell_offset + (actualQrSize - doc.widthOfString(qrErrorMsg)) / 2, 
                                 cellY + qrYInCell_offset + (actualQrSize - doc.heightOfString(qrErrorMsg)) / 2, 
                                 { width: actualQrSize, align: 'center' });
                    }
                    const qrBottom_offsetY = qrYInCell_offset + actualQrSize;

                    doc.font('Poppins-Bold').fontSize(titleFontSize).fillColor('#164769'); 
                    const titleWidth = doc.widthOfString(titleText);
                    const titleXInCell_offset = (labelWidth - titleWidth) / 2; 
                    const titleYInCell_offset = qrBottom_offsetY + paddingAfterQR; 
                    
                    doc.text(titleText, cellX + titleXInCell_offset, cellY + titleYInCell_offset);
                    const titleBottom_offsetY = titleYInCell_offset + titleActualHeight;

                    const codeBoxWidth = labelWidth * codeBoxWidthRatio; 
                    const codeBoxXInCell_offset = (labelWidth - codeBoxWidth) / 2;
                    let codeBoxYInCell_offset = titleBottom_offsetY + paddingAfterTitle;

                    const maxCodeBoxY = labelHeight - cellInternalPaddingBottom - codeBoxActualHeight;
                    if (codeBoxYInCell_offset > maxCodeBoxY) {
                        codeBoxYInCell_offset = maxCodeBoxY; 
                    }
                    if (codeBoxYInCell_offset < titleBottom_offsetY + paddingAfterTitle) { 
                        codeBoxYInCell_offset = titleBottom_offsetY + paddingAfterTitle; 
                    }


                    doc.rect(cellX + codeBoxXInCell_offset, cellY + codeBoxYInCell_offset, codeBoxWidth, codeBoxActualHeight)
                       .lineWidth(1)
                       .strokeColor('#164769')
                       .stroke();

                    const codeTextString = code; 
                    const codeFontSize = Math.max(6, Math.min(8, codeBoxActualHeight * 0.45)); 
                    doc.font('Poppins-Regular').fontSize(codeFontSize).fillColor('#164769'); 

                    const codeTextHeight = doc.heightOfString(codeTextString, { width: codeBoxWidth });
                    const codeTextYInBox_offset = (codeBoxActualHeight - codeTextHeight) / 2;

                    doc.text(codeTextString,
                        cellX + codeBoxXInCell_offset, 
                        cellY + codeBoxYInCell_offset + codeTextYInBox_offset, 
                        { width: codeBoxWidth, align: 'center' }
                    );

                    currentVoucherIndex++;
                }
                if (currentVoucherIndex >= vouchers.length) break;
            }
        }
        doc.end();
    });
}

// =======================================================================
// INÍCIO DO CÓDIGO NOVO - GERADOR DE CONVITES COMPLETO
// =======================================================================

/**
 * @param {string} rawCode O código extraído do CSV.
 * @returns {string} O código limpo e pronto para uso.
 */
function cleanQrCode(rawCode) {
    // Garante que a entrada é uma string antes de processar
    if (typeof rawCode !== 'string' || !rawCode) {
        return '';
    }

    return rawCode.replace(/;+$/, '').trim();
}


/**
 * Função auxiliar para gerar as miniaturas dos templates de convite.
 */
function generateInvitePreviewsHTML(templates, templateDir) {
    if (!templates || templates.length === 0) {
        return `<p class="col-span-full text-center text-red-600 bg-red-100 p-3 rounded-lg"><b>Aviso:</b> Nenhum modelo de convite encontrado na pasta <code>public/convite_pdf</code>.</p>`;
    }
    const defaultTemplate = templates[0];
    return templates.map(template => {
        const previewFilename = `${path.parse(template).name}.png`;
        const previewFilePath = path.join(PREVIEW_DIR, previewFilename);
        const previewFileUrl = `/previews/${encodeURIComponent(previewFilename)}`;

        if (!fs.existsSync(previewFilePath)) {
            try {
                const inputPath = path.join(templateDir, template);
                if (fs.existsSync(inputPath)) {
                    const command = `magick -density 150 "${inputPath}[0]" -quality 90 "${previewFilePath}"`;
                    execSync(command);
                    console.log(`Miniatura gerada para o convite ${template}`);
                }
            } catch (error) {
                console.error(`Erro ao gerar miniatura para ${template}:`, error);
            }
        }
        
        return `<div class="template-preview border-4 border-transparent rounded-lg p-1 cursor-pointer transition-all duration-200 hover:scale-105" onclick="selectTemplate('${template}')" title="${template}"><img src="${previewFileUrl}" alt="Preview de ${template}" class="w-full h-auto rounded-md"></div>`;
    }).join('');
}

/**
 * ROTA PARA APRESENTAR A PÁGINA DO GERADOR DE CONVITES
 */
app.get('/gerador-convites', async (req, res) => {
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    let templates = [];
    try {
        if (fs.existsSync(TEMPLATES_CONVITE_DIR)) {
            templates = fs.readdirSync(TEMPLATES_CONVITE_DIR).filter(file => file.toLowerCase().endsWith('.pdf')).sort();
        }
    } catch (err) { console.error('Erro ao ler modelos de convite:', err); }
    
    const previewsHTML = generateInvitePreviewsHTML(templates, TEMPLATES_CONVITE_DIR);
    const defaultTemplate = templates.length > 0 ? templates[0] : '';

    res.send(`
        <!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Gerador de Convites</title><link rel="preconnect" href="https://cdn.tailwindcss.com" crossorigin><link rel="dns-prefetch" href="https://cdn.tailwindcss.com"><script src="https://cdn.tailwindcss.com"></script></head>
        <body class="bg-gradient-to-br from-gray-50 to-gray-200 min-h-screen grid place-items-center p-4 font-sans">
            <div class="bg-white p-6 sm:p-8 rounded-xl shadow-lg w-full max-w-2xl space-y-8">
                <div class="text-center"><h1 class="text-3xl font-bold text-gray-800">Gerador de Convites</h1><p class="text-gray-500 mt-2">Crie múltiplos convites a partir de um ficheiro CSV.</p></div>
                <div><h4 class="text-lg font-semibold text-gray-700 mb-4 text-left">1. Selecione o Modelo:</h4><div id="template-container" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">${previewsHTML}</div></div>
                <div><h4 class="text-lg font-semibold text-gray-700 mb-4 text-left">2. Carregue o Ficheiro CSV:</h4>
                    <form action="/process-invites" method="post" enctype="multipart/form-data" class="space-y-6">
                        <input type="hidden" name="template" id="selectedTemplate" value="${defaultTemplate}">
                        <label for="csvFile" class="flex flex-col items-center justify-center w-full h-40 px-4 transition bg-white border-2 border-gray-300 border-dashed rounded-lg appearance-none cursor-pointer hover:border-blue-400"><span class="flex items-center space-x-2"><svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg><span id="file-name" class="font-medium text-gray-600">Clique para escolher um ficheiro <span class="text-blue-600 underline">ou arraste</span></span></span></label>
                        <input id="csvFile" type="file" name="csvFile" class="hidden" accept=".csv" required>
                        <button type="submit" class="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-all disabled:bg-gray-400" ${!defaultTemplate ? 'disabled' : ''}>Gerar Convites (ZIP)</button>
                    </form>
                </div>
                <div class="text-center pt-4 border-t border-gray-200"><a href="/" class="text-sm text-gray-600 hover:text-blue-600">Voltar à Página Principal</a></div>
            </div>
            <script>
                const fileInput = document.getElementById('csvFile'); const fileNameDisplay = document.getElementById('file-name');
                fileInput.addEventListener('change', () => { fileNameDisplay.textContent = fileInput.files.length > 0 ? fileInput.files[0].name : 'Clique para escolher...'; });
                function selectTemplate(template) {
                    document.querySelectorAll('.template-preview').forEach(el => el.classList.remove('border-blue-600', 'scale-105'));
                    const selectedElement = document.querySelector(\`[onclick="selectTemplate('\${template}')"]\`);
                    if (selectedElement) selectedElement.classList.add('border-blue-600', 'scale-105');
                    document.getElementById('selectedTemplate').value = template;
                }
                if ('${defaultTemplate}') document.addEventListener('DOMContentLoaded', () => selectTemplate('${defaultTemplate}'));
            </script>
        </body></html>
    `);
});

/**
 * ROTA PARA PROCESSAR O PEDIDO DE GERAÇÃO DE CONVITES
 */
app.post('/process-invites', upload.single('csvFile'), async (req, res) => {
    if (!req.file) return res.status(400).send('Nenhum ficheiro CSV foi enviado.');
    const tempSessionFolder = `session_${Date.now()}`;
    const tempPdfDir = path.join(TEMP_OUTPUT_DIR, tempSessionFolder);
    const tempQrDir = path.join(QRCODE_BASE_DIR, tempSessionFolder);
    try {
        await fsPromises.mkdir(tempPdfDir, { recursive: true });
        await fsPromises.mkdir(tempQrDir, { recursive: true });
        const selectedTemplateFile = req.body.template;
        if (!selectedTemplateFile) throw new Error("Nenhum modelo de convite foi selecionado.");
        const templatePath = path.join(TEMPLATES_CONVITE_DIR, selectedTemplateFile);
        if (!fs.existsSync(templatePath)) throw new Error(`O modelo de convite '${selectedTemplateFile}' não foi encontrado.`);
        const templateBytes = await fsPromises.readFile(templatePath);
        const records = await processCSV(req.file.path);
        const qrCodesData = records.slice(1).filter(r => Object.values(r)[0] && Object.values(r)[0].trim() !== '');
        if (qrCodesData.length === 0) throw new Error("O ficheiro CSV não contém dados válidos para gerar convites a partir da terceira linha.");
        console.log(`A gerar ${qrCodesData.length} convites...`);
        for (const record of qrCodesData) {
            const rawCode = Object.values(record)[0].trim();
            const qrCodeText = cleanQrCode(rawCode);
            if (!qrCodeText) {
                console.warn('Linha do CSV ignorada por ter um código inválido/vazio:', record);
                continue; 
            }
            const qrCodeImagePath = path.join(tempQrDir, `${sanitize(qrCodeText)}.png`);
            await generateQRCode(qrCodeText, qrCodeImagePath);
            const qrImageBytes = await fsPromises.readFile(qrCodeImagePath);
            const pdfDoc = await PDFDocument.load(templateBytes);
            const qrImage = await pdfDoc.embedPng(qrImageBytes);
            const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            const firstPage = pdfDoc.getPages()[0];
            const qrPosition = { x: 563, y: 210, width: 100, height: 100 };
            const textPosition = { x: 563, y: 195 };
            firstPage.drawImage(qrImage, qrPosition);
            const textWidth = boldFont.widthOfTextAtSize(qrCodeText, 12);
            const centeredTextX = qrPosition.x + (qrPosition.width - textWidth) / 2;
            firstPage.drawText(qrCodeText, { x: centeredTextX, y: textPosition.y, font: boldFont, size: 12, color: rgb(0, 0, 0) });
            const pdfBytes = await pdfDoc.save();
            const today = new Date();
            const pdfFileName = `${sanitize(qrCodeText)}_${today.getDate()}-${today.getMonth() + 1}.pdf`;
            await fsPromises.writeFile(path.join(tempPdfDir, pdfFileName), pdfBytes);
        }
        console.log("Processo de geração de PDFs concluído.");
        const generatedPdfFiles = await fsPromises.readdir(tempPdfDir);
        let totalSizeInBytes = 0;
        if (generatedPdfFiles.length > 0) {
            const statPromises = generatedPdfFiles.map(file => fsPromises.stat(path.join(tempPdfDir, file)));
            const statsArray = await Promise.all(statPromises);
            totalSizeInBytes = statsArray.reduce((sum, stats) => sum + stats.size, 0);
        }
        if (totalSizeInBytes > 0) {
            console.log(`Verificação bem-sucedida: ${generatedPdfFiles.length} ficheiros com ${totalSizeInBytes} bytes.`);
            const zipFileName = `Convites_${path.parse(req.file.originalname).name}.zip`;
            res.attachment(zipFileName);
            const archive = archiver('zip', { zlib: { level: 9 } });
            archive.on('error', err => { throw err; });
            archive.pipe(res);
            archive.directory(tempPdfDir, false);
            await archive.finalize();
            console.log("Ficheiro ZIP enviado com sucesso.");
        } else {
            console.error("Nenhum PDF válido foi gerado (tamanho total é 0 bytes).");
            throw new Error("Não foi possível gerar nenhum convite. Os ficheiros gerados estavam vazios ou corrompidos. Verifique os dados no CSV e o modelo de PDF.");
        }
    } catch (error) {
        console.error('Erro durante o processamento de convites:', error);
        res.status(500).send(`<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8"><title>Erro</title><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-gray-100 flex items-center justify-center h-screen p-4"><div class="bg-white p-8 rounded-lg shadow-xl max-w-lg text-center"><h1 class="text-2xl font-bold text-red-600 mb-4">Ocorreu um Erro</h1><p class="text-gray-700 mb-6">${error.message}</p><a href="/gerador-convites" class="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700">Tentar Novamente</a></div></body></html>`);
    } finally {
        await fsPromises.rm(tempPdfDir, { recursive: true, force: true }).catch(err => console.warn(err.message));
        await fsPromises.rm(tempQrDir, { recursive: true, force: true }).catch(err => console.warn(err.message));
        if (req.file && req.file.path) await fsPromises.unlink(req.file.path).catch(err => console.warn(err.message));
        console.log("Limpeza de ficheiros temporários da sessão concluída.");
    }
});

// =======================================================================
// FIM DO CÓDIGO NOVO
// =======================================================================


const startServer = async () => {
    try {
        await setupDirectories();
        await cleanOldFiles();
        
        // Vercel usa serverless, não precisa de listen()
        if (process.env.VERCEL) {
            console.log('Running on Vercel - serverless mode');
        } else {
            app.listen(port, () => {
                console.log(`Servidor rodando em http://localhost:${port}`);
                console.log(`QR Codes serão gerados em: ${QRCODE_BASE_DIR}`);
                console.log(`PDFs para download em: ${path.join(__dirname, 'public', 'downloads')}`);
                console.log(`Previews de templates em: ${PREVIEW_DIR}`);
                console.log(`Usando DEFAULT_PROMOTOR_ID: ${DEFAULT_PROMOTOR_ID || '(nenhum)'}`);
            });
        }
    } catch (error) {
        console.error('Erro ao iniciar servidor:', error);
        if (!process.env.VERCEL) {
            process.exit(1);
        }
    }
};

// Inicializar diretórios (síncrono para Vercel)
(async () => {
    try {
        await setupDirectories();
    } catch (e) {
        console.error('Setup error:', e);
    }
})();

// Para ambiente local
if (!process.env.VERCEL) {
    startServer();
}

// Exportar para Vercel serverless
module.exports = app;