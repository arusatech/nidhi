package main

import (
	"log"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

func main() {
	chaincode, err := contractapi.NewChaincode(&SmartContract{})
	if err != nil {
		log.Fatalf("create nidhi chaincode: %v", err)
	}
	if err := chaincode.Start(); err != nil {
		log.Fatalf("start nidhi chaincode: %v", err)
	}
}
