exports.subscribeChange = function() {
    [
        use('App/Models/Config/AssetConfig'),
        use('App/Models/DwConfig')
    ].map(model => model.watch()
        .on('change', async data => {
            clearCacheThrottle(model, data?.ns?.coll)
        }))
}
const _ = require('lodash')

const clearCacheThrottle = _.memoizeThrottle(async (model, key) => {
    try {
        await model.clearMemoryCache()
    } catch (e) {
        console.error('updateOpeningOrder error', e)
    }
}, 10000, { leading: false, trailing: true, resolver: key => key })
