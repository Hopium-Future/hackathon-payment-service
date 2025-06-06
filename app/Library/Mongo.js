const Mongoose = use('Mongoose')
const _ = require('lodash')
const Promise = require('bluebird')

const RequiredCollections = [
]

exports.checkRequiredCollections = function() {
    if (Mongoose.connections) {
        Mongoose.connection.on('open', async ref => {
            try {
                const collections = await Mongoose.connection.db.listCollections().toArray()
                const collectionNames = collections.map((item, index) => item.name)
                const needCreatedCollecions = _.without(RequiredCollections, ...collectionNames)
                await Promise.map(needCreatedCollecions, async collectionName => await Mongoose.connection.createCollection(collectionName), { concurrency: 1 })
            } catch (e) {
                Logger.error('Mongo: create require collection error: ', e)
            }
        })
    }
}
