'use strict'
const artifacts = {
  AccessControl: require('./artifacts/AccessControl.json'),
  ERC2771CustomForwarder: require('./artifacts/ERC2771CustomForwarder.json'),
  IdentityRegistry: require('./artifacts/IdentityRegistry.json'),
  InterestPayment: require('./artifacts/InterestPayment.json'),
  PurchaseContract: require('./artifacts/PurchaseContract.json'),
  RestrictedLockupToken: require('./artifacts/RestrictedLockupToken.json'),
  RestrictedLockupTokenExtension: require('./artifacts/RestrictedLockupTokenExtension.json'),
  RestrictedLockupTokenManagementExtension: require('./artifacts/RestrictedLockupTokenManagementExtension.json'),
  RestrictedSwap: require('./artifacts/RestrictedSwap.json'),
  SnapshotPeriods: require('./artifacts/SnapshotPeriods.json'),
  TransferRules: require('./artifacts/TransferRules.json'),
}
module.exports = Object.assign({ artifacts: artifacts }, artifacts)
module.exports.default = artifacts
