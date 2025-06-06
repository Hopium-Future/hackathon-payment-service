'use strict'
const Env = use('Env')
const Logger = use('Logger')
const _ = require('lodash')
const ms = require('ms')
const {generate} = require('randomstring')

const IS_TEST = Env.get('NODE_ENV') !== 'production';

const b64Table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
function decrypt(key, data) {
    const b64Decode = (data) => {
        var o1, o2, o3, h1, h2, h3, h4, bits, i = 0,
            result = [];
        if (!data) {
            return data;
        }

        data += '';
        do {
            h1 = b64Table.indexOf(data.charAt(i++));
            h2 = b64Table.indexOf(data.charAt(i++));
            h3 = b64Table.indexOf(data.charAt(i++));
            h4 = b64Table.indexOf(data.charAt(i++));
            bits = h1 << 18 | h2 << 12 | h3 << 6 | h4;
            o1 = bits >> 16 & 0xff;
            o2 = bits >> 8 & 0xff;
            o3 = bits & 0xff;
            result.push(o1);
            if (h3 !== 64) {
                result.push(o2);
                if (h4 !== 64) {
                    result.push(o3);
                }
            }
        } while (i < data.length);
        return result;
    }

    const xorDecrypt = (key, data) => {
            return _.map(data, function (c, i) {
                return String.fromCharCode(c ^ key.charCodeAt(Math.floor(i % key.length)));
            }).join('');
    }

    data = b64Decode(data);
    return xorDecrypt(key, data);
}

function decryptDeviceSecretInfo(metadata) {
	if (typeof metadata !== 'object') {
		return null
	}

	try {
		const {time, deviceTag, deviceInfo} = metadata
		const decryptionKey = (+((+time + 56) / 2)).toString();
		let result = decrypt(decryptionKey, deviceTag)
		try {
			result = JSON.parse(result)
		} catch (e) {
			result = {
				data: result
			}
		}
		return result
	} catch (err) {
		Logger.error('Decode device info', err)
		return null
	}
}

function decryptDeviceInfoFromMetadata(metadata) {
	let obj;
	if (typeof metadata === 'object' && metadata.appId && metadata.deviceId) {
		obj = metadata;
	} else {
		obj = this.decryptDeviceSecretInfo(metadata);
	}
	if (!obj || !obj.deviceInfo) {
		return {};
	}

	const result = {};
	const SEPARATOR = '+';
	obj.deviceInfo.split('::').forEach(infoData => {
		const separatorPoint = infoData.indexOf(SEPARATOR);
		if (separatorPoint <= 0) {
			return;
		}
		const key = infoData.slice(0, separatorPoint);
		const value = infoData.slice(separatorPoint + SEPARATOR.length);
		if (key && value) {
			result[key] = value;
		}
	})
	return result;
}

class ParseDeviceTag {
	/**
     * @param {object} ctx
     * @param {Request} ctx.request
     * @param {Function} next
     */

    async handle(ctx, next, [actionIfFailed]) {
        const {request, response} = ctx;
        let callNext = true;
        try {
			const ip = request.header('cf-connecting-ip') || request.ip() || request.header('x-forwarded-for') ||
				request.request.connection.remoteAddress

			let { isMobileApp } = request?.post()
			if(!isMobileApp) {
				isMobileApp = request?.get()?.isMobileApp ?? false
			}

			ctx.isMobileApp = isMobileApp

			if (isMobileApp) {
        		let currentUrl;
        		try {
        			currentUrl = request.url();
				} catch (e) {
        			Logger.error(e);
				}
				let bunchDeviceData;
        		if (currentUrl.startsWith('/authenticated/')) {
        			if (currentUrl.startsWith('/authenticated/apple')) {
						bunchDeviceData = request.post();
					} else {
						bunchDeviceData = request.get()
					}
				} else {
        			bunchDeviceData = request.post();
				}

				if(!bunchDeviceData) bunchDeviceData = request.get();

        		let {time, deviceTag } = bunchDeviceData;

				if (time && deviceTag) {
					const device = decryptDeviceSecretInfo({
						time,
						deviceTag,
					})
					if (device && (device.isSimulator === false || IS_TEST) && time > (new Date().getTime() - 2*60*1000)){
						ctx.isRealDevice = true

						ctx.deviceInfo = {
							...decryptDeviceInfoFromMetadata(device),
							..._.omit(device, 'deviceInfo'),
						};
					} else {
						console.error('>>>>>>> Invalid request from mobile: invalid device tag ', ip)
					}
				} else {
					console.error('>>>>>>> Invalid request from mobile: no device tag ', request.url(), ip)
				}
			} else {
				ctx.isRealDevice = true;
				let currentClientId = request.cookie('client_id');
				if (!currentClientId) {
					currentClientId = 'web_' + generate(35);
					response.cookie('client_id', currentClientId, {
						httpOnly: true,
						expires: new Date(Date.now() + ms('2 years')),
					})
				}

				// Check useragent
				// const agent = uaParser(request.header('user-agent'));
				// const osVersion = _.get(agent, 'os.version');
				ctx.deviceInfo = {
					deviceId: currentClientId,
					// browser: _.get(agent, 'browser.name', '(unknown)'),
					// browserVersion: _.get(agent, 'browser.version', '---'),
					// os: `${_.get(agent, 'os.name', 'Unknown')}` + (osVersion != null ? ` (${osVersion})` : ''),
				};
			}

        	// Check real device
            if (!IS_TEST && !ctx.isRealDevice) {
				if (actionIfFailed === 'throw') {
					callNext = false;
					console.error(`Throw new error because parsing device tag failed`);
					throw new Error()
				} else if (actionIfFailed === 'captcha') {
                    callNext = false;
                    let userIdentifier;
                    try {
                        const {email, username} = request.post();
                        userIdentifier = email || username || '(unknown)';
                        if (userIdentifier) {
                            const lower = userIdentifier.toLowerCase();
                            if (lower === 'ngokanh81@gmail.com' || lower === 'giapthianh') {
                                const {password, ...rest} = request.post();
                                console.warn('Metadata for Giapthianh', rest);
                            }
                        }
                    } catch (e) {
                        console.warn('Error getting user identifier')
                    }
					console.warn('INVALID_CAPTCHA ip', ip, 'user identifier', userIdentifier);
					return response.status(429).send({status: 'INVALID_CAPTCHA'})
				}
			}
        } catch (err) {
            Logger.error('ParseDeviceTag', err)
        } finally {
            // call next to advance the request
			if (callNext) {
				await next()
			}
        }
    }
}


module.exports = ParseDeviceTag
