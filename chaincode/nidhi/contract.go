package main

import (
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

var mintMSPs = map[string]bool{
	"Org1MSP":            true,
	"RampUSMSP":          true,
	"RampINMSP":          true,
	"AnnadataTrustMSP":   true,
}

// SmartContract is the Nidhi settlement chaincode (balances live on peers, not in the app).
type SmartContract struct {
	contractapi.Contract
}

type stubState struct {
	stub contractapi.TransactionContextInterface
}

func (s stubState) Get(key string) ([]byte, error) {
	return s.stub.GetStub().GetState(key)
}

func (s stubState) Put(key string, value []byte) error {
	return s.stub.GetStub().PutState(key, value)
}

func (s stubState) GetByPrefix(prefix string) ([][]byte, error) {
	iter, err := s.stub.GetStub().GetStateByRange(prefix, prefix+"\xff")
	if err != nil {
		return nil, err
	}
	defer iter.Close()
	var out [][]byte
	for iter.HasNext() {
		kv, err := iter.Next()
		if err != nil {
			return nil, err
		}
		out = append(out, kv.Value)
	}
	return out, nil
}

func wrap(st State, txID string, fn func(State, string) (*SubmitResult, error)) (*SubmitResult, error) {
	res, err := fn(st, txID)
	if err != nil {
		return &SubmitResult{Status: "rejected", Reason: err.Error()}, nil
	}
	return res, nil
}

func (c *SmartContract) Transfer(ctx contractapi.TransactionContextInterface, payload string) (*SubmitResult, error) {
	return SubmitSigned(stubState{ctx}, ctx.GetStub().GetTxID(), payload, false)
}

func (c *SmartContract) SubmitReceipt(ctx contractapi.TransactionContextInterface, payload string) (*SubmitResult, error) {
	return SubmitSigned(stubState{ctx}, ctx.GetStub().GetTxID(), payload, true)
}

func (c *SmartContract) Mint(ctx contractapi.TransactionContextInterface, accountID, tokenID, amount string) (*SubmitResult, error) {
	msp, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return &SubmitResult{Status: "rejected", Reason: err.Error()}, nil
	}
	if !mintMSPs[msp] {
		return &SubmitResult{Status: "rejected", Reason: fmt.Sprintf("mint not allowed for MSP %s", msp)}, nil
	}
	return MintTo(stubState{ctx}, ctx.GetStub().GetTxID(), accountID, tokenID, amount)
}

func (c *SmartContract) GetBalance(ctx contractapi.TransactionContextInterface, accountID, tokenID string) (*Balance, error) {
	return ReadBalance(stubState{ctx}, accountID, tokenID)
}

func (c *SmartContract) ListTransactions(ctx contractapi.TransactionContextInterface, accountID string) ([]TxRecord, error) {
	return ListTxs(stubState{ctx}, accountID)
}
