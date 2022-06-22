const express = require("express");
const schedule = require("node-schedule");
const cors = require("cors");
const http = require("http");
const app = express();

app.use(cors());

const { Server } = require("socket.io");
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin:
      process.env.NODE_ENV == "production"
        ? "https://ttt.shahriyar.dev"
        : "http://localhost:3000",
  },
});

const games = {};
const blank_board = {
  one: null,
  two: null,
  three: null,
  four: null,
  five: null,
  six: null,
  seven: null,
  eight: null,
  nine: null,
};

const createGame = (socket, data) => {
  games[data.game_id] = {
    id: data.game_id,
    players: [socket.id],
    marks: {},
    board: { ...blank_board },
    turn: socket.id,
    moves: 0,
    last_move: new Date(),
  };
  const game = games[data.game_id];
  game.marks[socket.id] = "x";
  return game;
};

const won = (p, mark) => {
  if (
    (p["one"] == mark && p["two"] == mark && p["three"] == mark) ||
    (p["four"] == mark && p["five"] == mark && p["six"] == mark) ||
    (p["seven"] == mark && p["eight"] == mark && p["nine"] == mark) ||
    (p["one"] == mark && p["four"] == mark && p["seven"] == mark) ||
    (p["two"] == mark && p["five"] == mark && p["eight"] == mark) ||
    (p["three"] == mark && p["six"] == mark && p["nine"] == mark) ||
    (p["one"] == mark && p["five"] == mark && p["nine"] == mark) ||
    (p["three"] == mark && p["five"] == mark && p["seven"] == mark)
  ) {
    return true;
  } else {
    return false;
  }
};

const detectWin = (game) => {
  const positions = game.board;
  const winner = won(positions, "x") ? "x" : won(positions, "o") ? "o" : "draw";

  if (game.moves < 9 && winner === "draw") return;
  io.emit("result", {
    game_id: game.id,
    winner,
    marks: game.marks,
  });
};

const emitGames = (socket) => {
  const free_games = [];
  for (game_id in games) {
    const game = games[game_id];

    if (game.players.length < 2) {
      free_games.push(game.id);
    }
  }

  socket.emit("games", {
    games: free_games,
  });
};

io.on("connection", (socket) => {
  socket.on("join", (data) => {
    let game;
    if (games[data.game_id]) {
      game = games[data.game_id];

      if (game.players.length == 2) {
        return socket.emit("full", {});
      } else {
        game.players.push(socket.id);
        game.marks[socket.id] = "o";
      }
    } else {
      game = createGame(socket, data);
    }

    io.emit("joined", game);
    if (game.players.length == 2) {
      io.emit("start", {
        game_id: game.id,
      });
    }
    emitGames(io);
  });

  socket.on("move", (data) => {
    let game = games[data.game_id];
    if (game.players.length < 2) return;

    const player_id = data.player_id;

    if (game.turn !== player_id) return;

    const mark = game.marks[player_id];
    game.board[data.position] = mark;

    const new_player = game.players.filter((player) => player !== player_id)[0];
    game.turn = new_player;
    game.moves += 1;
    game.last_move = new Date();

    io.emit("board_update", {
      game_id: game.id,
      board: game.board,
      turn: game.turn,
    });

    detectWin(game);
  });

  socket.on("destroy", (data) => {
    const { game_id } = data;
    delete games[game_id];
    emitGames(io);
  });

  socket.on("message", (data) => {
    io.emit("message", data);
  });

  socket.on("list", () => {
    emitGames(socket);
  });
});

app.get("/", (req, res) => {
  res.json(games);
});

schedule.scheduleJob("* * * * *", () => {
  const now = new Date();
  for (game_id in games) {
    const game = games[game_id];
    const delta = now - game.last_move;
    if (delta > 30000) {
      delete games[game_id];
      io.emit("abandoned", { game_id });
      emitGames(io);
    }
  }
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log("http://localhost:5000");
});
