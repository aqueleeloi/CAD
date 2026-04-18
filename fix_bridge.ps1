$content = Get-Content 'C:\Users\HP\.openclaw\workspace\pessa-quotes-platform\bridge.js' -Raw
$pattern = '(?s)const sessionId = `cad-session-\$\{Date.now\(\)\}`;.*?log\(`Executing: \$\{cmd\}`\);'

$replacement = 'const sessionId = `cad-session-${Date.now()}`;' + "`r`n                " + 'const cmd = `openclaw agent --agent main --message "Age como especialista em CAD. LÊ OBRIGATORIAMENTE a foto do utilizador localizada em: ${tempInput} (usa a tool image). Em seguida, gera um blueprint ortográfico 2x2 com a tool image_generate." --json`;' + "`r`n                " + 'log(`Executing: ${cmd}`);'

$newContent = [regex]::Replace($content, $pattern, $replacement)
Set-Content 'C:\Users\HP\.openclaw\workspace\pessa-quotes-platform\bridge.js' $newContent
