const WebSocket = require('ws');

module.exports = (req, res) => {
  if (req.headers['upgrade'] === 'websocket') {
    const wss = new WebSocket.Server({ noServer: true });
    const clients = new Map();

    wss.on('connection', (ws) => {
      console.log('Novo cliente conectado');
      let nickname = 'Anônimo';

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          if (!data || !data.type) return;

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
            console.log(`Novo nickname registrado: ${data.content} (${ws.userType})`);
            broadcastClientList();

          } else if (data.type === 'toggle-camera') {
            const targetClient = Array.from(clients.entries()).find(([_, info]) => info.nickname === data.target);
            if (targetClient) {
              const [targetWs] = targetClient;
              if (targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(JSON.stringify({ type: 'toggle-camera' }));
                console.log(`Comando toggle-camera enviado para ${data.target}`);
                wss.clients.forEach((client) => {
                  if (client !== ws && client.readyState === WebSocket.OPEN && client.userType === 'viewer') {
                    client.send(JSON.stringify({ type: 'camera-off', nickname: data.target }));
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
                console.log(`Usuário ${data.target} desconectado pelo admin`);
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
                console.log(`Mensagem privada enviada para ${data.target}: ${data.content}`);
              }
            }

          } else if (data.type === 'message') {
            console.log(`Mensagem recebida de ${nickname}: ${data.content}`);
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
            console.log(`Frame de vídeo recebido de ${nickname}`);
            wss.clients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN && client.userType === 'viewer') {
                client.send(message);
              }
            });
          } else {
            console.error(`Erro ao processar mensagem: ${error.message}`);
          }
        }
      });

      ws.on('close', () => {
        console.log(`Cliente desconectado: ${nickname}`);
        clients.delete(ws);
        broadcastClientList();
      });

      function broadcastClientList() {
        const clientList = Array.from(clients.entries())
          .filter(([_, data]) => data.userType === 'client')
          .map(([_, data]) => data.nickname);
        const clientMessage = JSON.stringify({ type: 'clientList', content: clientList });

        const viewerList = Array.from(clients.entries())
          .filter(([_, data]) => data.userType === 'viewer')
          .map(([_, data]) => data.nickname);
        const viewerMessage = JSON.stringify({ type: 'viewerList', content: viewerList });

        clients.forEach((data, client) => {
          if (client.readyState === WebSocket.OPEN) {
            if (data.userType === 'admin-client') {
              client.send(clientMessage);
            } else if (data.userType === 'admin-viewer') {
              client.send(viewerMessage);
            } else {
              client.send(clientMessage);
            }
          }
        });
      }
    });

    res.socket.server.on('upgrade', (request, socket, head) => {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    });

    res.end();
  } else {
    res.status(200).send('WebSocket server');
  }
};