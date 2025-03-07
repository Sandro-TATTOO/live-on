const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Map(); // Armazena informações dos clientes (nickname, userType)
const clientStreams = new Map(); // Armazena o frame mais recente de cada cliente

const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));

function log(message) {
    const logMessage = `[${new Date().toISOString()}] ${message}\n`;
    console.log(logMessage);
    fs.appendFile('server.log', logMessage, (err) => {
        if (err) console.error('Erro ao salvar log:', err);
    });
}

wss.on('connection', (ws) => {
    log('Novo cliente conectado');
    broadcastClientList();

    let nickname = 'Anônimo';

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (!data || !data.type) {
                console.error('Mensagem inválida recebida:', message);
                return;
            }

            if (data.type === 'nickname') {
                if (data.userType && data.userType.includes('admin')) {
                    const adminPassword = 'admin123';
                    if (data.password !== adminPassword) {
                        ws.send(JSON.stringify({ type: 'error', content: 'Senha inválida para admin' }));
                        ws.close();
                        return;
                    }
                }
                nickname = data.content;
                ws.userType = data.userType || 'client';
                clients.set(ws, { nickname: data.content, userType: ws.userType });
                log(`Novo nickname registrado: ${data.content} (${ws.userType})`);
                broadcastNickname(data.content);

            } else if (data.type === 'toggle-camera') {
                const targetClient = Array.from(clients.entries()).find(([_, info]) => info.nickname === data.target);
                if (targetClient) {
                    const [targetWs] = targetClient;
                    if (targetWs.readyState === WebSocket.OPEN) {
                        targetWs.send(JSON.stringify({ type: 'toggle-camera' }));
                        log(`Comando toggle-camera enviado para ${data.target}`);
                        // Notifica os viewers que a câmera foi desligada
                        wss.clients.forEach((client) => {
                            if (client !== ws && client.readyState === WebSocket.OPEN && client.userType === 'viewer') {
                                client.send(JSON.stringify({
                                    type: 'camera-off',
                                    nickname: data.target
                                }));
                            }
                        });
                    }
                }

            } else if (data.type === 'disconnect') {
                const targetClient = Array.from(clients.entries()).find(([_, info]) => info.nickname === data.target);
                if (targetClient) {
                    const [targetWs] = targetClient;
                    if (targetWs.readyState === WebSocket.OPEN) {
                        targetWs.close();
                        log(`Usuário ${data.target} desconectado pelo admin`);
                    }
                }

            } else if (data.type === 'private-message') {
                const targetClient = Array.from(clients.entries()).find(([_, info]) => info.nickname === data.target);
                if (targetClient) {
                    const [targetWs] = targetClient;
                    if (targetWs.readyState === WebSocket.OPEN) {
                        targetWs.send(JSON.stringify({
                            type: 'private-message',
                            content: data.content,
                            from: nickname
                        }));
                        log(`Mensagem privada enviada para ${data.target}: ${data.content}`);
                    }
                }

            } else if (data.type === 'message') {
                log(`Mensagem recebida de ${nickname}: ${data.content}`);
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
            }
        } catch (error) {
            if (message instanceof Buffer) {
                log(`Frame de vídeo recebido de ${nickname}`);
                if (clients.has(ws) && clients.get(ws).userType === 'client') {
                    clientStreams.set(nickname, message); // Armazena o frame no Map
                    const frameMessage = JSON.stringify({
                        type: 'stream',
                        nickname: nickname,
                        content: message.toString('base64')
                    });
                    wss.clients.forEach((client) => {
                        if (client !== ws && client.readyState === WebSocket.OPEN && client.userType === 'viewer') {
                            client.send(frameMessage);
                        }
                    });
                }
            } else {
                log(`Erro ao processar mensagem: ${error.message}`);
            }
        }
    });

    ws.on('error', (error) => {
        log(`Erro na conexão WebSocket: ${error.message}`);
    });

    ws.on('close', () => {
        log(`Cliente desconectado: ${nickname}`);
        clients.delete(ws);
        clientStreams.delete(nickname);
        broadcastClientList();
    });
});

function broadcastNickname(nickname) { 
    broadcastClientList();
}

function broadcastClientList() {
    const clientList = Array.from(clients.entries())
        .filter(([_, data]) => data.userType === 'client')
        .map(([_, data]) => data.nickname);
    const clientMessage = JSON.stringify({ type: 'clientList', content: clientList });
    
    const viewerList = Array.from(clients.entries())
        .filter(([_, data]) => data.userType === 'viewer')
        .map(([_, data]) => data.nickname);
    const viewerMessage = JSON.stringify({ type: 'viewerList', content: viewerList });

    clients.forEach((data, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            if (data.userType === 'admin-client') {
                ws.send(clientMessage);
            } else if (data.userType === 'admin-viewer') {
                ws.send(viewerMessage);
            } else {
                ws.send(clientMessage);
            }
        }
    });

    log(`Clientes atualizados: ${clientList}`);
    log(`Viewers atualizados: ${viewerList}`);
}

server.listen(PORT, '0.0.0.0', () => {
    log(`Servidor rodando na porta ${PORT}`);
    console.log(`Acesse http://localhost:${PORT} para testar a aplicação`);
});