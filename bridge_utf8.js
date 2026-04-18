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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.method === 'GET' && req.url === '/ping') { res.writeHead(200); res.end('pong'); return; }

    if (req.method === 'POST' && req.url === '/generate') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                log(`Received generation request`);
                const data = JSON.parse(body);
                if (!data.image) throw new Error("No image provided");

                const tempInput = path.join(__dirname, 'temp_input.jpg');
                const base64Data = data.image.replace(/^data:image\/\w+;base64,/, "");
                fs.writeFileSync(tempInput, base64Data, 'base64');
                log(`Saved temp image: ${tempInput}`);

                const finalPrompt = `Crie uma Ãºnica imagem composta de alta resoluÃ§Ã£o, organizada numa grade 2x2 precisa, para uma instalaÃ§Ã£o de arco de PÃ¡scoa em grande escala, baseada nos dados especÃ­ficos fornecidos abaixo. O estilo deve ser um desenho tÃ©cnico CAD limpo com renderizaÃ§Ã£o colorida em um fundo branco puro. 1.Quadrante Superior Esquerdo: Uma renderizaÃ§Ã£o fotogrÃ¡fica 3D colorida e realista do arco de PÃ¡scoa completo, com orelhas de coelho brancas e rosa, um arco-Ã­ris turquesa e branco, e uma coleÃ§Ã£o de ovos de PÃ¡scoa decorados (bolinhas, listras) na base. 2.Quadrante Superior Direito: Uma vista superior tÃ©cnica (planta) do arco. DimensÃµes: comprimento total de '2,40m (240 cm)', profundidade de '0,25m (25 cm)'. Inclua o texto 'Topo'. 3.Quadrante Inferior Esquerdo: Uma vista lateral tÃ©cnica do arco e de um ovo lateral. DimensÃµes: profundidade da base de '0,70m', altura do ovo lateral de '0,35m'. 4.Quadrante Inferior Direito: Uma vista frontal tÃ©cnica (elevaÃ§Ã£o) detalhada. DimensÃµes: largura total da base de '2,50m (250 cm)', altura total de '3,40m (340 cm)', largura interior do arco de '0,90m (90 cm)', altura interior do arco de '2,20m (220 cm)', altura do ovo esquerdo de '0,60m'. Inclua uma silhueta humana inteira dentro do arco, com a linha de cota lateral 'Escala Humana (1,80m)'. Todas as linhas de cota, setas e nÃºmeros devem ser claros, precisos e consistentes com os padrÃµes profissionais de desenho de engenharia. Use o sÃ­mbolo de diÃ¢metro (Ã˜) para todos os furos redondos. Todas as medidas devem ser dadas em centÃ­metros onde apropriado, usando as conversÃµes mostradas. CRIA A IMAGEM!`;

                const escapedPrompt = finalPrompt.replace(/"/g, '\\"').replace(/\n/g, ' ');
                const escapedInput = tempInput.replace(/\\/g, '\\\\');
                
                const cmd = `openclaw agent --agent main --message "Gera uma imagem exatamente com esta prompt: ${escapedPrompt}. Usa a ferramenta image_generate. Aqui estÃ¡ a imagem base: ${escapedInput}" --json`;
                log(`Executing: ${cmd}`);

                const env = { ...process.env, OPENCLAW_TOKEN: 'beea43f799c784b449b7ea467b9a8919e0b7f736ce94ea54' };
                exec(cmd, { env }, (error, stdout, stderr) => {
                    log(`STDOUT: ${stdout}`);
                    log(`STDERR: ${stderr}`);
                    
                    let outPath = null;
                    const match = stdout.match(/MEDIA:\s*([^\s]+\.(jpg|png|webp))/i);
                    if(match) outPath = match[1];
                    else {
                        try {
                            const jsonMatch = stdout.match(/\{[\s\S]*\}/);
                            if(jsonMatch) {
                                const parsed = JSON.parse(jsonMatch[0]);
                                if(parsed.output && parsed.output.attachments && parsed.output.attachments[0]) {
                                    outPath = parsed.output.attachments[0].path;
                                }
                            }
                        } catch(e){}
                    }

                    if (outPath && fs.existsSync(outPath)) {
                        log(`Found output image: ${outPath}`);
                        const outBase64 = fs.readFileSync(outPath, 'base64');
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ imageUrl: `data:image/png;base64,${outBase64}` }));
                    } else {
                        log(`Image not found.`);
                        res.writeHead(500);
                        res.end(JSON.stringify({ error: "Image generation failed.", stdout }));
                    }
                });
            } catch (e) {
                res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
            }
        });
    } else {
        res.writeHead(404); res.end();
    }
});

server.listen(PORT, '0.0.0.0', () => { log(`Server listening on port ${PORT}`); });

