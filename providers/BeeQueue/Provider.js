const { ServiceProvider } = require('@adonisjs/fold')

class Provider extends ServiceProvider {
    register () {
        this.app.singleton('BeeQueue', () => {
            const Config = this.app.use('Adonis/Src/Config')
            return new (require('.'))(Config)
        })
    }
}

module.exports = Provider
