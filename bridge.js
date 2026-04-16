const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 18790;
const LOG_FILE = path.join(__dirname, 'bridge_debug.log');

function log(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(LOG_FILE, entry);
    console.log(msg);
}

const server = http.createServer((req, res) => {
    log(`${req.method} ${req.url}`);
    
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.method === 'GET' && req.url === '/ping') {
        res.writeHead(200);
        res.end('pong');
        return;
    }

    if (req.method === 'POST' && req.url === '/generate') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                log(`Received request for generation`);
                const data = JSON.parse(body);
                const { image, prompt } = data;
                
                if (!image) throw new Error("No image provided");

                const tempInput = path.join(__dirname, 'temp_input.jpg');
                const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
                fs.writeFileSync(tempInput, base64Data, 'base64');
                log(`Saved temp image: ${tempInput}`);

                const safePrompt = (prompt || '').replace(/"/g, '\\"').replace(/\n/g, ' ');
                const fullPrompt = `Gera um desenho técnico CAD 2x2. Fundo branco, cotas em cm. Referência: pessoa 1.80m. ${safePrompt}`;
                
                const sessionId = `cad-session-${Date.now()}`;
                const cmd = `openclaw tools call default_api:image_generate "{\\"prompt\\": \\"Blueprint ortogr�fico de desenho t�cnico CAD 2x2. Fundo branco.\\", \\"image\\": \\"${tempInput.replace(/\\/g, '\\\\')}\\"}"`;
                log(`Executing: ${cmd}`);

                const env = { ...process.env, OPENCLAW_TOKEN: 'beea43f799c784b449b7ea467b9a8919e0b7f736ce94ea54' };
                exec(cmd, { env }, (error, stdout, stderr) => {
                    if (error) {
                        log(`Exec error: ${error.message}`);
                        res.writeHead(500);
                        res.end(JSON.stringify({ error: error.message, stderr }));
                        return;
                    }
                    processResult(stdout, res);
                });
            } catch (e) {
                log(`Request error: ${e.message}`);
                res.writeHead(400);
                res.end(JSON.stringify({ error: e.message }));
            }
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

function processResult(stdout, res) {
    try {
        log(`Parsing result...`);
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            // Se falhar o parse do wrapper do OpenClaw, assumimos que o output é cru
            log("Fallback: searching string for media path");
            const mediaMatch = stdout.match(/MEDIA:(.*?\.jpg)/i);
            if (mediaMatch) {
                outPath = mediaMatch[1];
            } else {
                throw new Error("No JSON or MEDIA tag found in output");
            }
        } else {
            const result = JSON.parse(jsonMatch[0]);
            if (result.attachments && result.attachments.length > 0) {
                outPath = result.attachments.find(a => a.path && a.path.match(/\.(jpg|jpeg|png|webp)$/i))?.path;
            }
            if (!outPath && result.path) outPath = result.path;
            if (!outPath && result.result?.path) outPath = result.result.path;
            // Se for string pura com json parseado
            if (!outPath && typeof result === 'string') {
                const innerMatch = result.match(/"path":\s*"([^"]+)"/);
                if (innerMatch) outPath = innerMatch[1].replace(/\\\\/g, '\\');
            }
        }

        if (outPath && fs.existsSync(outPath)) {
            log(`Found output image: ${outPath}`);
            const outBase64 = fs.readFileSync(outPath, 'base64');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ imageUrl: `data:image/png;base64,${outBase64}` }));
        } else {
            log(`Output image not found in result`);
            res.writeHead(404);
            res.end(JSON.stringify({ error: "Imagem não gerada", details: result }));
        }
    } catch (e) {
        log(`Parse error: ${e.message}`);
        res.writeHead(500);
        res.end(JSON.stringify({ error: "Erro ao processar output", message: e.message, stdout }));
    }
}

server.listen(PORT, '0.0.0.0', () => {
    log(`Bridge listening on http://0.0.0.0:${PORT}`);
});



