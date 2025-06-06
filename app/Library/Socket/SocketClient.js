'use strict'

const io = require('socket.io-client')

class SocketClient {
    constructor (props) {
        this._queue = []
    }

    onMessage () {
        // eslint-disable-next-line no-throw-literal
        throw 'Abstract function needed to implemented'
    }

    onConnected () {
    }

    init (name, url, path) {
        // eslint-disable-next-line no-throw-literal
        if (!url) throw 'Url not specified'
        const socket = io(url, { path, transports: ['websocket'] })

        this.NAME = name
        const patch = require('socketio-wildcard')(io.Manager)
        patch(socket)
        socket.on('connect', () => {
            console.log(`>>> SOCKET connected TO ${this.NAME}, socket id`, socket.id)
            this._socket = socket
            this.onConnected()
            let data = this.popMessageFromQueue()
            while (data) {
                this.emit(data.event, data.message, data.ack)
                data = this.popMessageFromQueue()
            }
        })

        socket.on('disconnect', () => {
            console.log(`<<< SOCKET closed to ${this.NAME}`)
            this._socket = null
        })

        socket.on('*', packet => {
            this.onMessage(packet)
        })
    }

    popMessageFromQueue () {
        const [elem] = this._queue.splice(0, 1)
        return elem
    }

    pushMessageToQueue (event, message, ack) {
        this._queue.push({
            event,
            message,
            ack
        })
    }

    emit (event, message, ackCallback) {
        if (!this._socket) {
            // Logger.info(`Emit to ${this.NAME} but not connected, event=${event}, message=`, message)
            this.pushMessageToQueue(event, message, ackCallback)
        } else {
            // Connected, emit
            // Logger.info(`Emit to ${this.NAME}, event=${event}, message=`, message)
            this._socket.emit(event, message, ackCallback)
        }
    }
}

module.exports = SocketClient

SocketClient.Event = { _NAME: '_name' }
