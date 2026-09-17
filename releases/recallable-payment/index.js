'use strict'
const artifacts = {
  AccessControl: require('./artifacts/AccessControl.json'),
  RecallablePayment: require('./artifacts/RecallablePayment.json'),
}
module.exports = Object.assign({ artifacts: artifacts }, artifacts)
module.exports.default = artifacts
