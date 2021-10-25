export interface CardanoCliOptions {
  storageDir?: string
  binPath?: string
  network?: string
  shelleyGenesis: string
}

export interface AddressBuildOptions {
  account: string
  fileName: string
  signing?: boolean
}

export interface StakeAddressBuildOptions {
  account: string
  fileName: string
}

export interface QueryUTXOOptions {
  address: string
}

export interface AddressKeyGenOptions {
  account: string
  fileName: string
}

export interface AddressKeyHashOptions {
  account: string
  vkeyFileName: string
}

export interface ProtocolParametersOptions {
  fileName?: string
}

export interface TxIn {
  txHash: string
  txId: number
}

export interface TxOut {
  address: string
  lovelace: number
  assets?: {
    type: string
    quantity: number
  }[]
}

export interface TransactionBuildRawOptions {
  txIn: TxIn[]
  txOut: TxOut[]
  fee?: number
  invalidBefore?: number
  invalidHereafter?: number
  mint?: string
  mintingScript?: string
  metadataFile?: string
}

export interface Asset {
  quantity: number
  type: string
}

export interface UTXo {
  txHash: string
  txId: number
  lovelace: number
  txDatum: string
  assets: Asset[]
}

export interface CardanoCliAddress {
  build(options: AddressBuildOptions): string | undefined
  keyGen(options: AddressKeyGenOptions): { vkey: string; skey: string }
  keyHash(options: AddressKeyHashOptions): string | undefined
}

export interface QueryTipResult {
  epoch: number
  hash: string
  slot: number
  block: number
  era: string
  syncProgress: string
}

export interface CardanoCliStakeAddress {
  build(options: AddressBuildOptions): string | undefined
  keyGen(options: AddressKeyGenOptions): { vkey: string; skey: string }
}

export interface CardanoCliQuery {
  utxo(options: QueryUTXOOptions): UTXo[]
  tip(): QueryTipResult | undefined
  protocolParameters(options: ProtocolParametersOptions = { fileName: "protocol-parameters" }): string
}

export interface CardanoCliTransaction {
  buildRaw({ txIn, txOut, fee, invalidBefore, invalidHereafter }: TransactionBuildRawOptions): string
  calculateMinFee({ txBody }: { txBody: string }): number | undefined
  sign({ txBody, signingKeys }: { txBody: string; signingKeys: string[] }): string
  submit({ tx }: { tx: string }): string | undefined
  txid({ txFile }: { txFile: string }): string | undefined
  view({ txFile }: { txFile: string }): string | undefined
  policyId({ scriptFile }: { scriptFile: string }): string | undefined
}

declare module "@abumostafa/cardano-cli" {
  export class CardanoCli {
    public address: CardanoCliAddress
    public query: CardanoCliQuery
    public transaction: CardanoCliTransaction
    public stakeAddress: CardanoCliStakeAddress

    constructor(options: CardanoCliOptions)
  }
}
