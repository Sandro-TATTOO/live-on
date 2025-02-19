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

    // Armazenar apelido do usuário
    let nickname = 'Anônimo';
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'nickname') {
                // Atualizar apelido do usuário
                nickname = data.content;
            } else if (data.type === 'message') {
                // Transmitir mensagem de chat para todos os clientes
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'message',
                            content: data.content,
                            nickname: data.nickname || nickname,
                            timestamp: new Date().toISOString()
                        }));

                    }
                });

            } else {
                // Transmitir o frame de vídeo para outros clientes
                wss.clients.forEach((client) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(message);
                    }
                });
            }
        } catch (error) {
            // Se não for JSON, trata como frame de vídeo
            wss.clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(message);
                }
            });
        }
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
