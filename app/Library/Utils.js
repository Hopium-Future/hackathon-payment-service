const Big = require('big.js')
const _ = require('lodash')
const numeral = require('numeral')

exports.formatNumber = function(value) {
    if (_.isNil(value)) return "0"
    if (Math.abs(+value) < 1e-8) return "0"
    return numeral(+value).format("0,0.[00000000]", Math.floor)
}

exports.getDecimalScale = function getDecimalScale (value = 0.00000001) {
    let decimalScale = 8
    if (value && value > 0 && value <= 1) {
        decimalScale = +(-Math.floor(Math.log(value) / Math.log(10))).toFixed(0)
    }
    return decimalScale
}

exports.isInvalidPrecision = function isInvalidPrecision (value, precision) {
    return +Big(Math.floor(+value / precision)).times(precision) !== value
}

exports.sleep = function (ms) {
	return new Promise((r) => setTimeout(r, ms));
}