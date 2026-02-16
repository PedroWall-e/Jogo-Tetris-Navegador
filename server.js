const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.static('public'));

let players = {};
let gameSettings = { speed: 1, winLimit: 3 };
let isMatchRunning = false;

io.on('connection', (socket) => {
    console.log('Jogador conectado:', socket.id);

    players[socket.id] = {
        id: socket.id,
        name: "Jogador",
        matrix: [],
        score: 0,
        wins: 0,
        isReady: false,
        isAlive: true
    };

    socket.emit('initSetup', { players, settings: gameSettings, isRunning: isMatchRunning });
    socket.broadcast.emit('newPlayer', players[socket.id]);

    socket.on('changeSettings', (newSettings) => {
        gameSettings = { ...gameSettings, ...newSettings };
        io.emit('updateSettings', gameSettings);
    });

    socket.on('playerReady', (data) => {
        if (players[socket.id]) {
            players[socket.id].isReady = data.state;
            players[socket.id].name = data.name || "Sem Nome";
            io.emit('updatePlayerList', players);

            const allReady = Object.values(players).every(p => p.isReady);
            const playerCount = Object.keys(players).length;

            if (allReady && playerCount > 0 && !isMatchRunning) {
                isMatchRunning = true;
                Object.values(players).forEach(p => p.isAlive = true);
                io.emit('startGame', players);
            }
        }
    });

    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            // Apenas atualiza o estado para quem chegar depois ou espectadores
            players[socket.id].matrix = data.matrix;
            players[socket.id].score = data.score;
            // Retransmite para os oponentes desenharem
            socket.broadcast.emit('playerUpdated', players[socket.id]);
        }
    });

    socket.on('playerGameOver', () => {
        if (players[socket.id]) {
            players[socket.id].isAlive = false;
            io.emit('playerDied', socket.id);
            checkRoundWinner();
        }
    });

    // CORREÇÃO DO LIXO: O servidor apenas repassa a quantidade
    socket.on('sendAttack', (lines) => {
        socket.broadcast.emit('receiveGarbage', { senderId: socket.id, lines });
    });

    socket.on('requestReset', () => {
        isMatchRunning = false;
        Object.values(players).forEach(p => {
            p.isReady = false;
            p.wins = 0;
            p.score = 0;
            p.matrix = [];
            p.isAlive = true;
        });
        io.emit('resetToLobby', players);
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
        if (Object.keys(players).length === 0) isMatchRunning = false;
    });
});

function checkRoundWinner() {
    const alivePlayers = Object.values(players).filter(p => p.isAlive);
    const totalPlayers = Object.keys(players).length;

    if (alivePlayers.length === 1 && totalPlayers > 1) {
        const winner = alivePlayers[0];
        winner.wins++;
        io.emit('roundOver', { 
            winnerId: winner.id, 
            wins: winner.wins,
            isMatchOver: winner.wins >= gameSettings.winLimit,
            players 
        });
        if (winner.wins < gameSettings.winLimit) {
            setTimeout(() => {
                Object.values(players).forEach(p => p.isAlive = true);
                io.emit('startNextRound');
            }, 3000);
        }
    } else if (alivePlayers.length === 0) {
        io.emit('roundOver', { winnerId: null, isMatchOver: false, players });
        setTimeout(() => {
            Object.values(players).forEach(p => p.isAlive = true);
            io.emit('startNextRound');
        }, 3000);
    }
}

server.listen(3000, () => {
    console.log('Servidor rodando na porta 3000');
});