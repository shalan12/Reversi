//() is called when the document is loaded
/* global $, io, alert */
const blue = 1
const red = 2
const zero = 0
const one = 1
const images = {}
images[blue] = 'images/bluetile.png'
images[red] = 'images/redtile.png'
let playerNum = -1
let turn = blue

$(() => {
    const socketio = io()

    function getPlayerString(playerNum) {
        return playerNum === blue ? 'blue' : 'red'
    }

    socketio.on('init', num => {
        playerNum = num
        alert('Game Starting -- I am player ' + getPlayerString(num))
    })

    socketio.on('update', data => {
        data.tileUpdates.forEach(val => {
            const row = val[zero]
            const col = val[one]
            console.log(images[turn])
            console.log('.' + row.toString() + col.toString())
            console.log($('.' + row.toString() + col.toString()))
            $('#' + row.toString() + col.toString())
            .find('img')
            .attr('src', images[turn])
        })
        turn = data.turn
        if (data.state !== 'ongoing') {
            const winner = data.state === zero
                           ? 'Nobody' : getPlayerString(data.state)
            alert('Game Finished -- Winner == ' + winner)
        }
        console.log(data)
    })

    socketio.on('game-end', msg => alert(msg))

    $('td').click((e) => {
        socketio.emit('move',
                      {'playerNum': playerNum, 'move':e.currentTarget.id})
        return false
    })
})