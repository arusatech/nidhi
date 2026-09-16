#!/usr/bin/env bash
# Deploy Nidhi chaincode onto the Fabric samples test-network (Org1 peer).
# Requires: cloned hyperledger/fabric-samples with test-network, Docker, peer CLI on PATH.
set -euo pipefail

SAMPLES_DIR="${FABRIC_SAMPLES:-$HOME/fabric-samples}"
CC_SRC="$(cd "$(dirname "$0")/../chaincode/nidhi" && pwd)"
CHANNEL="${NIDHI_CHANNEL:-mychannel}"
CC_NAME="${NIDHI_CC_NAME:-nidhi}"

if [[ ! -d "$SAMPLES_DIR/test-network" ]]; then
  echo "Set FABRIC_SAMPLES to your fabric-samples clone (expected $SAMPLES_DIR/test-network)" >&2
  exit 1
fi

cd "$SAMPLES_DIR/test-network"
./network.sh up createChannel -c "$CHANNEL"
./network.sh deployCC -ccn "$CC_NAME" -ccp "$CC_SRC" -ccl go -c "$CHANNEL"

echo "Nidhi chaincode '$CC_NAME' deployed on channel '$CHANNEL'."
echo "BFF: connectPeerFabricGateway({ peerEndpoint, mspId: 'Org1MSP', channelName: '$CHANNEL', chaincodeName: '$CC_NAME', ...certs })"
