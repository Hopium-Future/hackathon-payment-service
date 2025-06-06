const GeneralException = use('App/Exceptions/GeneralException')
const limiter = require("limiter");

// Create a map to store limiters for each IP address
const ipLimiters = new Map();

class Throttle {
    // {limit} times per {duration} milliseconds
    async handle({ request, response }, next, [limit, duration]) {
        const ip = request.ip(); // Get the IP address
        let requestLimiter = ipLimiters.get(ip);

        if (!requestLimiter) {
            // Create a new RateLimiter instance if one doesn't exist for this IP
            requestLimiter = new limiter.RateLimiter(parseInt(limit ?? 1), parseInt(duration ?? 1000), true);

            ipLimiters.set(ip, requestLimiter);
        }

        if (requestLimiter.tryRemoveTokens(1)) {
            await next();
        } else {
            return response.status(GeneralException.Error.TOO_MANY_REQUEST.status)
            .send({ status: GeneralException.Error.TOO_MANY_REQUEST.message })
        }
    }
}

module.exports = Throttle;
