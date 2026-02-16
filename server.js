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
    console.log('Novo jogador:', socket.id);

    players[socket.id] = {
        id: socket.id,
        name: "Jogador " + socket.id.substr(0,4), // Nome provisório
        matrix: [],
        score: 0,
        wins: 0,
        isReady: false,
        isAlive: true
    };

    socket.emit('initSetup', { players, settings: gameSettings, isRunning: isMatchRunning });
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // Atualiza Configurações
    socket.on('changeSettings', (newSettings) => {
        gameSettings = { ...gameSettings, ...newSettings };
        io.emit('updateSettings', gameSettings);
    });

    // Jogador define PRONTO e envia NOME
    socket.on('playerReady', (data) => {
        if (players[socket.id]) {
            players[socket.id].isReady = data.state;
            players[socket.id].name = data.name || "Sem Nome"; // Salva o nome
            
            io.emit('updatePlayerList', players);

            // Verifica início do jogo
            const allReady = Object.values(players).every(p => p.isReady);
            const playerCount = Object.keys(players).length;

            if (allReady && playerCount > 0 && !isMatchRunning) {
                isMatchRunning = true;
                Object.values(players).forEach(p => { p.isAlive = true; });
                io.emit('startGame', players); // Envia lista atualizada com nomes
            }
        }
    });

    // Movimento
    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].matrix = data.matrix;
            players[socket.id].score = data.score;
            socket.broadcast.emit('playerUpdated', players[socket.id]);
        }
    });

    // Game Over Individual
    socket.on('playerGameOver', () => {
        if (players[socket.id]) {
            players[socket.id].isAlive = false;
            io.emit('playerDied', socket.id);
            checkRoundWinner();
        }
    });

    // Ataque (Lixo)
    socket.on('sendAttack', (lines) => {
        socket.broadcast.emit('receiveGarbage', { senderId: socket.id, lines });
    });

    // RESET TOTAL (Botão Parar)
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

    // Condição de Vitória do Round
    if (alivePlayers.length === 1 && totalPlayers > 1) {
        const winner = alivePlayers[0];
        winner.wins++;
        
        io.emit('roundOver', { 
            winnerId: winner.id, 
            wins: winner.wins,
            isMatchOver: winner.wins >= gameSettings.winLimit,
            players: players // Envia dados para o Ranking
        });

        if (winner.wins < gameSettings.winLimit) {
            setTimeout(() => {
                Object.values(players).forEach(p => p.isAlive = true);
                io.emit('startNextRound');
            }, 3000);
        }
    } 
    else if (alivePlayers.length === 0) {
        io.emit('roundOver', { winnerId: null, isMatchOver: false, players });
        setTimeout(() => {
            Object.values(players).forEach(p => p.isAlive = true);
            io.emit('startNextRound');
        }, 3000);
    }
}

server.listen(3000, () => {
    console.log('Servidor Atualizado rodando na porta 3000');
});