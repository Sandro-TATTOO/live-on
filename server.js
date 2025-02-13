const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('Novo cliente conectado');

    socket.on('video-stream', (data) => {
        socket.broadcast.emit('video-stream', data);
    });

    socket.on('disconnect', () => {
        console.log('Cliente desconectado');
    });
});

server.listen(3001, () => {
    console.log('Servidor rodando na porta 3001');

});
