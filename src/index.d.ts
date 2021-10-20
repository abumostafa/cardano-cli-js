declare module "@abumostafa/cardano-cli" {
  interface CardanoCliOptions {
    storageDir?: string
    binPath?: string
    network?: string
    shelleyGenesis: string
  }

  interface AddressBuildOptions {
    account: string
    fileName: string
    signing?: boolean
  }

  interface QueryUTXOOptions {
    address: string
  }

  interface AddressKeyGenOptions {
    account: string
    fileName: string
  }

  interface ProtocolParametersOptions {
    fileName?: string
  }

  interface TxIn {
    txHash: string
    txId: number
  }

  interface TxOut {
    address: string
    lovelace: number
    assets?: {
      type: string
      quantity: number
    }[]
  }

  interface TransactionBuildRawOptions {
    txIn: TxIn[]
    txOut: TxOut[]
    fee?: number
    invalidBefore?: number
    invalidHereafter?: number
  }

  interface Asset {
    quantity: number
    type: string
  }

  interface UTXo {
    txHash: string
    txId: number
    lovelace: number
    txDatum: string
    assets: Asset[]
  }

  interface CardanoCliAddress {
    build(options: AddressBuildOptions): string | undefined
    keyGen(options: AddressKeyGenOptions): { vkey: string, skey: string }
  }

  interface CardanoCliStakeAddress extends CardanoCliAddress {}

  interface CardanoCliQuery {
    utxo(options: QueryUTXOOptions): UTXo[]
    tip(): object
    protocolParameters(options: ProtocolParametersOptions = { fileName: "protocol-parameters" }): string
  }

  interface CardanoCliTransaction {
    buildRaw({ txIn, txOut, fee, invalidBefore, invalidHereafter }: TransactionBuildRawOptions): string
    calculateMinFee({ txBody }: { txBody: string }): number | undefined
    sign({ txBody, signingKeys }: { txBody: string; signingKeys: string[] }): string
    submit({ tx }: { tx: string }): string
    txid({ txFile }: { txFile: string }): string
    view({ txBody }: { txBody: string; tx: string }): string
  }

  export class CardanoCli {
    private binPath: string
    private storageDir: string
    private network: string
    private shelleyGenesis: string

    public address: CardanoCliAddress
    public stakeAddress: CardanoCliStakeAddress
    public query: CardanoCliQuery
    public transaction: CardanoCliTransaction
    public cliVersion: string | undefined

    constructor(options: CardanoCliOptions) {}
  }
}
