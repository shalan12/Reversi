// requires atleast version node version 4.45
// to play on a single computer, open up localhost:8000 on two different browsers
// the game doesn't start until both players have joined the game

'use strict'
const http = require('http')
const jade = require('jade')
const html = jade.renderFile('index.jade')
const fs = require('mz/fs')
const socketio = require('socket.io')

const pathimg = 'images/'
const images = ['emptytile.png', 'redtile.png', 'bluetile.png']
              .map((s) => pathimg + s)
const js = ['client.js']
const uuid = require('node-uuid')

const zero = 0
const one = 1
const two = 2
const minusOne = -1

const empty = 0
const blue = 1
const red = 2

const PORT_NO = 8000

const numrows = 8
const middlerow = numrows / two
const blueTilesPos = [[middlerow - one, middlerow - one],
                      [middlerow, middlerow]]
const redTilesPos = [[middlerow - one, middlerow],
                     [middlerow, middlerow - one]]
const defBord = replicate(empty, numrows).map(() => replicate(empty, numrows))
blueTilesPos.forEach(([x, y]) => {
    defBord[x][y] = blue
})
redTilesPos.forEach(([x, y]) => {
    defBord[x][y] = red
})

const playerIdToGameId = {}
const gameSubcribers = {} // gameId:[sockets]
const gameState = {} // gameId : board
const waitingUsers = []
const sockets = {} // playerid: socket

const verbose = isArgDefined('verbose')
const debug = isArgDefined('debug')

const msgDc = 'one of the players disconnected'

// Asynchronously read the images from the files, store them into variables, 'then' create the http server
Promise.all(images.concat(js).map(file => fs.readFile(file))).
then(([emptytile, redtile, bluetile, client]) => {
    const images = {'emptytile.png': emptytile, 'redtile.png': redtile,
                    'bluetile.png': bluetile}
    const server = http.createServer((req, res) => {
        //setCookie(req, res)
        if (req.url === '/') {
            res.end(html)
        } else if (req.url === '/client.js') {
            res.end(client)
        } else if (req.url.startsWith('/images')) {
            const filename = req.url.substring('/images/'.length) // extract filename
            if (images[filename] === undefined) {
                console.log('Unexpected image requested : ' + req.url)
            } else {
                res.end(images[filename]) // send image
            }
        } else {
            console.log('Unexpected file requested : ' + req.url)
            res.end('')
        }
    })

    const io = socketio(server) // server socket
    server.listen(PORT_NO)

    io.sockets.on('connection', socket => {
        
        socket.on('move', data => {
            if (verbose) {
                console.log('recieved -- move : ' + JSON.stringify(data))
            }
            const gameId = playerIdToGameId[getPlayerId(socket)]
            if (gameId !== undefined) {
                console.log('game id : ' + gameId.toString())
                if (gameState[gameId].turn !== data.playerNum) {
                    socket.emit('invalidMove', data.move)
                } else {
                    const [moveX, moveY] = data.move.split('')
                                           .map(val => parseInt(val))

                    const updatedState = applyMove(data.playerNum, moveX, moveY, gameState[gameId])
                    sendMessageToAllSubscribers(gameId, 'update', updatedState)
                }
            }
        })

        socket.on('disconnect', () => {
            const id = getPlayerId(socket)
            const gameId = playerIdToGameId[id]
            const idx = gameSubcribers[gameId].indexOf(id)
            gameSubcribers[gameId].splice(idx, one)
            sendMessageToAllSubscribers(gameId, 'game-end', msgDc)
            if (verbose) {
                console.log('user:' + id + ' disconnected')
            }
        })

        processNewConnection(socket)
    })
})

function sendMessageToAllSubscribers(gameId, tag, message) {
    gameSubcribers[gameId].forEach(id => {
        if (verbose) {
            console.log('sending -- message : ' +
            JSON.stringify(message) +
                         ' to ' + id.toString())
        }
        sockets[id].emit(tag, message)
    })
}

function replicate(num, times) {
    return Array(times).fill(num)
}

function processNewConnection(socket) {
    const id = getPlayerId(socket)
    
    if (debug) {
        console.log('socketid == ' + id.toString())
    }

    sockets[id] = socket

    // if first player add to list of waitingUsers
    // otherwise start game
    if (waitingUsers.length === zero) { 
        waitingUsers.push(id)
    } else { 
        const otherPlayer = waitingUsers.pop()
        makeNewGame(id, otherPlayer)
        sockets[id].emit('init', blue)
        sockets[otherPlayer].emit('init', red)
    }
}

function makeNewGame(playerOne, playerTwo) {
    const gameId = uuid.v4()
    playerIdToGameId[playerOne] = gameId
    playerIdToGameId[playerTwo] = gameId
    gameSubcribers[gameId] = [playerOne, playerTwo]
    const boardCopy = JSON.parse(JSON.stringify(defBord))
    gameState[gameId] = {'board':boardCopy, 'turn':blue}
}

function getPlayerId(socket) {
    return socket.id
}

function isArgDefined(arg) {
    return process.argv.indexOf('--' + arg) >= zero
}

function applyMove(playerNum, moveX, moveY, gameState) {
    const tileUpdates = getTileUpdates(playerNum, moveX, moveY, gameState.board)
    applyTileUpdates(gameState.board, tileUpdates, playerNum)
    let state = 'ongoing' //ongoing, draw, blue, red
    const player2 = playerNum === blue ? red : blue
    const canMove = [playerNum, player2]
                    .map(val => isMovePossible(val, gameState.board))
    
    // if no one can move, game has ended
    if (canMove.every(val => val !== true)) {
        state = getWinner(gameState.board)
    }

    // otherwise toggle the turn
    if (tileUpdates.length > zero && canMove[one]) {
        gameState.turn = player2
    }

    return {'tileUpdates':tileUpdates, 'turn': gameState.turn, 'state': state}
}

function getWinner(board) {
    let countBlue = 0
    let countRed = 0
    board.forEach(row => row.forEach(cell => {
        if (cell === blue) {
            countBlue++
        } else if (cell === red) {
            countRed++
        }
    }))
    if (countBlue > countRed) {
        return blue
    } else if (countRed > countBlue) {
        return red
    }
    return empty
}

function applyTileUpdates(board, tileUpdates, newColor) {
    tileUpdates.forEach(([x, y]) => {
        board[x][y] = newColor
    })
}

function isMovePossible(playerNum, board) {
    for (let i = 0; i < numrows; i++) {
        for (let j = 0; j < numrows; j++) {
            if (getTileUpdates(playerNum, i, j, board).length > zero) {
                return true
            }
        }
    }
    return false
}

function coordsInRange(x, y) {
    return [x, y].every(val => zero <= val && val < numrows)
}

function getTileUpdates(playerNum, moveX, moveY, board) {
    const directions = [[zero, one], [zero, minusOne], [one, zero],
                        [minusOne, zero], [one, one], [minusOne, minusOne],
                        [one, minusOne], [minusOne, one]]
    const player2 = playerNum === blue ? red : blue
    let tileUpdates = []
    if (board[moveX][moveY] === empty) {
        directions.forEach(([xInc, yInc]) => {
            let [x, y] = [moveX + xInc, moveY + yInc]
            const tilesToInvert = [[moveX, moveY]]

            while (coordsInRange(x, y)) {
                if (board[x][y] === player2) {
                    tilesToInvert.push([x, y])
                    x = x + xInc
                    y = y + yInc
                } else {
                    break
                }
            }
            if (tilesToInvert.length > one && coordsInRange(x, y) &&
                board[x][y] === playerNum) {
                tileUpdates = tileUpdates.concat(tilesToInvert)
            }
        })
    }
    return tileUpdates
}