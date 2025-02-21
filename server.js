const express = require('express');
const https = require('https');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const selfSigned = require('selfsigned');

// Gerar certificado auto-assinado
const attrs = [{ name: 'commonName', value: 'localhost' }];
const pems = selfSigned.generate(attrs, { days: 365 });

const options = {
  key: pems.private,
  cert: pems.cert
};

const app = express();

// Middleware para redirecionamento HTTP para HTTPS
app.use((req, res, next) => {
  console.log(`Requisição recebida: ${req.method} ${req.url} - Protocolo: ${req.protocol}`);
  
  // Verificar se a requisição é HTTP
  if (req.protocol === 'http') {
    // Obter o host correto para redirecionamento
    const host = req.headers.host || 'localhost:3000';
    const [hostname, port] = host.split(':');
    const secureHost = hostname === 'localhost' ? 'localhost:3001' : `${hostname}:3001`;
    const redirectUrl = `https://${secureHost}${req.url}`;
    
    console.log('Detalhes da requisição HTTP:');
    console.log(`- Host original: ${host}`);
    console.log(`- URL original: ${req.url}`);
    console.log(`- URL de redirecionamento: ${redirectUrl}`);
    
    // Realizar o redirecionamento permanente
    return res.redirect(301, redirectUrl);
  }
  
  // Continuar para a próxima middleware se já for HTTPS
  next();
});

// Criar servidores HTTP e HTTPS
const httpServer = http.createServer(app);
const httpsServer = https.createServer(options, app);

const wss = new WebSocket.Server({ server: httpsServer });

// Armazenar conexões de clientes e viewers
const clients = new Map();
const viewers = new Set();

// Configurações do servidor
const PORT = 3000;

// Servir arquivos estáticos com cache control
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Rotas
app.get('/client', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'client.html'));
});

app.get('/viewer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'viewer.html'));
});

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('Nova conexão estabelecida');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'register') {
                if (data.role === 'client') {
                    // Registrar como client
                    clients.set(ws, { id: data.id });
                    console.log(`Novo client registrado: ${data.id}`);
                } else if (data.role === 'viewer') {
                    // Registrar como viewer
                    viewers.add(ws);
                    console.log('Novo viewer conectado');
                }
            } else if (data.type === 'video') {
                // Enviar frame de vídeo para todos os viewers
                if (clients.has(ws)) {
                    viewers.forEach(viewer => {
                        if (viewer.readyState === WebSocket.OPEN) {
                            viewer.send(message);
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Erro ao processar mensagem:', error);
        }
    });

    ws.on('close', () => {
        if (clients.has(ws)) {
            const { id } = clients.get(ws);
            console.log(`Client desconectado: ${id}`);
            clients.delete(ws);
        } else if (viewers.has(ws)) {
            console.log('Viewer desconectado');
            viewers.delete(ws);
        }
    });
});

// Iniciar servidores com logs detalhados
httpServer.listen(3000, '0.0.0.0', () => {
  console.log('Servidor HTTP rodando na porta 3000');
  console.log('Endereços de acesso:');
  console.log(`- Local: http://localhost:3000`);
  console.log(`- Rede local: http://${getLocalIp()}:3000`);
  console.log('Todas as requisições HTTP serão redirecionadas para:');
  console.log(`- https://localhost:3001`);
  console.log('Verifique se o firewall permite conexões nas portas 3000 e 3001');
});

httpsServer.listen(3001, '0.0.0.0', () => {
  console.log('Servidor HTTPS rodando na porta 3001');
  console.log('Acessos disponíveis:');
  console.log(`- Local: https://localhost:3001`);
  console.log(`- Rede local: https://${getLocalIp()}:3001`);
  console.log('Nota: O navegador pode mostrar um aviso de segurança para certificados auto-assinados');
});

// Função para obter IP local
function getLocalIp() {
  const interfaces = require('os').networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return 'localhost';
}
