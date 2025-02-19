const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Configurações do servidor
const PORT = 3000;

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('Novo cliente conectado');

    ws.on('message', (message) => {
        // Transmitir o frame para todos os clientes conectados
        wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    });

    ws.on('error', (error) => {
        console.error('Erro na conexão WebSocket:', error);
    });

    ws.on('close', () => {
        console.log('Cliente desconectado');
    });
});

server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`Acesse http://localhost:${PORT} para testar a aplicação`);
});
