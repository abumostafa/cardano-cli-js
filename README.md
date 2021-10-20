## CardanoCliJS

JS wrapper for [cardano-node-cli](https://github.com/input-output-hk/cardano-node/blob/master/doc/reference/cardano-node-cli-reference.md) 

### Installation
```
npm i --save @abumostafa/cardano-cli-js
```

### Usage

- **initialize**
    ```js
    import CardanoCli from "@abumostafa/cardano-cli-js"
    
    const cli = new CardanoCli({
        binPath: "/path/to/cardano-cli", // default is cardano-cli 
        storageDir: path.resolve(__dirname, "storage"), // storage path for keys, transactions, etc.,
        network: "mainnet", // "mainnet" || "testnet-magic 1097911063",
        shelleyGenesis: "/path/to/shelley-genesis.json"
    })
    ```

- **address**
    - key-gen
    ```js
      const keys = cli.address.keyGen({ account: "Ahmed", fileName: "wallet0" })
      // output: { vkey: "/path/to/wallet0.payment.vkey", skey: "/path/to/wallet0.payment.skey" } 
    ```
    - build
    ```js
      const paymentAddr = cli.address.build({ account: "Ahmed", fileName: "wallet0" })
      // output: /path/to/wallet0.payment.addr 
    ```
    - build signed
    ```js
      const paymentAddr = cli.address.build({ account: "Ahmed", fileName: "wallet0", signing: true })
      // output: /path/to/wallet0.payment.addr 
    ```

- **stake-address**
    - key-gen
    ```js
      const keys = cli.address.keyGen({ account: "Ahmed", fileName: "wallet0" })
      // output: { vkey: "/path/to/wallet0.stake.vkey", skey: "/path/to/wallet0.stake.skey" } 
    ```
    - build
    ```js
      const paymentAddr = cli.address.build({ account: "Ahmed", fileName: "wallet0" })
      // output: /path/to/wallet0.stake.addr 
    ```
    - build signed
    ```js
      const paymentAddr = cli.address.build({ account: "Ahmed", fileName: "wallet0", signing: true })
      // output: /path/to/wallet0.stake.addr 
    ```

- **query**
    - tip
    ```js
      const tip = cli.query.tip()
      // output: { slot: 1123123, ... } 
    ```
    - utxo
    ```js
      const utxos = cli.query.utxo({ address: "addr..." })
      // output: [{ txId: "", txHash, lovelace: 200000, assets: [{ type: "policy.name", querntity: 1 }]}] 
    ```
    - protocol parameters
    ```js
      const params = cli.query.protocolParameters()
      // output: /path/to/protocol-parameters.json 
    ```

- **transaction**
    - build raw
    ```js
      const raw = cli.transaction.buildRaw({
          txIn: [{ txId, txHash }],
          txOut: [{ address, lovelace, assets: [{ type: "policy.name", quantity: 1 }] }],
      })
      // output: /path/to/transactions/now-raw.json 
    ```
    - calculate min fees
    ```js
      const fee = cli.transaction.calculateMinFee({ txBody: "/path/to/transactions/now-raw.json"  })
      // output: 12345456 // lovelace 
    ```
    - sign
    ```js
      const signed = cli.transaction.sign({ 
          txBody: "/path/to/transactions/now-raw.json",
          signingKeys: ["/path/to/payment.skey"] 
      })
      // output: /path/to/transactions/now-signed.json 
    ```
    - submit
    ```js
      const txHash = cli.transaction.submit({ 
          tx: "/path/to/transactions/now-signed.json",
      })
      // output: cb64ffbb1...
    ```

