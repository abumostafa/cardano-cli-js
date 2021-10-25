import {
  AddressBuildOptions,
  AddressKeyGenOptions,
  AddressKeyHashOptions,
  Asset,
  CardanoCliAddress,
  CardanoCliOptions,
  CardanoCliQuery,
  CardanoCliStakeAddress,
  CardanoCliTransaction,
  ProtocolParametersOptions,
  QueryUTXOOptions,
  StakeAddressBuildOptions,
  TransactionBuildRawOptions,
  TxIn,
  TxOut,
  UTXo
} from "../types"
import { execSync } from "child_process"
import * as fs from "fs"
import path from "path"

export class CardanoCli {
  private readonly binPath: string
  private readonly storageDir: string
  private readonly network: string
  private readonly shelleyGenesis: string

  constructor(options: CardanoCliOptions) {
    this.binPath = options.binPath || "cardano-cli"
    this.storageDir = options.storageDir || path.resolve(__dirname, "storage")
    this.network = options.network || "mainnet"
    this.shelleyGenesis = options.shelleyGenesis
  }

  get address(): CardanoCliAddress {
    return {
      build: ({ account, fileName, signing = false }: AddressBuildOptions): string | undefined => {
        let stakeVkey = ""
        const paymentVkey = this.path("accounts", account, `${fileName}.payment.vkey`)
        this.assertFileExists(paymentVkey)

        if (signing) {
          stakeVkey = this.path("accounts", account, `${fileName}.stake.vkey`)
          this.assertFileExists(stakeVkey)
        }

        const outputFile = this.path("accounts", account, `${fileName}.payment.addr`)

        this.assertNotFileExists(outputFile)

        this.exec([
          "address",
          "build",
          "--payment-verification-key-file",
          paymentVkey,
          ...(stakeVkey ? ["--stake-verification-key-file", stakeVkey] : []),
          "--out-file",
          outputFile,
          `--${this.network}`
        ])

        return outputFile
      },
      keyGen: ({ account, fileName }: AddressKeyGenOptions) => {
        const paymentVkey = this.path("accounts", account, `${fileName}.payment.vkey`)
        const paymentSkey = this.path("accounts", account, `${fileName}.payment.skey`)

        this.assertNotFileExists(paymentVkey)
        this.assertNotFileExists(paymentSkey)

        this.mkdir(this.path("accounts", account))
        this.exec(["address", "key-gen", "--verification-key-file", paymentVkey, "--signing-key-file", paymentSkey])

        return { vkey: paymentVkey, skey: paymentSkey }
      },
      keyHash: ({ account, vkeyFileName }: AddressKeyHashOptions): string | undefined => {
        const paymentVkey = this.path("accounts", account, `${vkeyFileName}.payment.vkey`)

        this.assertFileExists(paymentVkey)

        this.mkdir(this.path("accounts", account))
        return this.exec(["address", "key-hash", "--payment-verification-key-file", paymentVkey])?.trim()
      }
    }
  }

  get stakeAddress(): CardanoCliStakeAddress {
    return {
      build: ({ account, fileName }: StakeAddressBuildOptions): string | undefined => {
        const stakeVkey = this.path("accounts", account, `${fileName}.stake.vkey`)
        this.assertFileExists(stakeVkey)

        const outputFile = this.path("accounts", account, `${fileName}.stake.addr`)

        this.assertNotFileExists(outputFile)

        this.exec([
          "stake-address",
          "build",
          "--stake-verification-key-file",
          stakeVkey,
          "--out-file",
          outputFile,
          `--${this.network}`
        ])

        return outputFile
      },
      keyGen: ({ account, fileName }: AddressKeyGenOptions) => {
        const stakeVkey = this.path("accounts", account, `${fileName}.stake.vkey`)
        const stakeSkey = this.path("accounts", account, `${fileName}.stake.skey`)

        this.assertNotFileExists(stakeVkey)
        this.assertNotFileExists(stakeSkey)

        this.mkdir(this.path("accounts", account))
        this.exec(["stake-address", "key-gen", "--verification-key-file", stakeVkey, "--signing-key-file", stakeSkey])

        return { vkey: stakeVkey, skey: stakeSkey }
      }
    }
  }

  get query(): CardanoCliQuery {
    return {
      utxo: ({ address }: QueryUTXOOptions): UTXo[] => {
        const utxos = this.exec(["query", "utxo", "--address", address, `--${this.network}`])

        return utxos
          ?.split("\n")
          .slice(2)
          .map((utxo) => {
            const txInfo = utxo.match(/^([a-z0-9]+)\s+([0-9]*)\s+([0-9]+)\s+([a-z]+).*\s+\+\s+(TxOutDatum[a-z]+)/im)

            if (!txInfo?.length) return

            const result: UTXo = {
              txHash: txInfo[1],
              txId: Number(txInfo[2]),
              txDatum: txInfo[5],
              lovelace: Number(txInfo[3]),
              assets: []
            }

            const assetsInfo = utxo.match(/(?:\s+\+\s+([0-9]+)\s+([0-9a-z.]+))/gim)
            if (!assetsInfo?.length) return result

            result.assets = assetsInfo
              .map((asset) => {
                const parts = asset.match(/\+\s+([0-9]+)\s+([0-9a-z.]+)/i)

                if (!parts) return undefined

                const [, quantity, type] = parts

                return { type, quantity: Number(quantity) }
              })
              .filter((asset) => Boolean(asset)) as Asset[]

            return result
          })
          .filter(Boolean) as UTXo[]
      },
      tip: () => JSON.parse(this.exec(["query", "tip", `--${this.network}`]) || ""),
      protocolParameters: (options: ProtocolParametersOptions = { fileName: "protocol-parameters" }) => {
        this.mkdir(this.path("protocol"))

        const outFile = this.path("protocol", `${options.fileName}.json`)
        this.exec(["query", "protocol-parameters", `--${this.network}`, "--out-file", outFile])

        return outFile
      }
    }
  }

  get transaction(): CardanoCliTransaction {
    return {
      buildRaw: ({
        txIn,
        txOut,
        fee,
        invalidBefore,
        invalidHereafter,
        mintingScript,
        metadataFile,
        mint
      }: TransactionBuildRawOptions): string => {
        const senders = ((txIn: TxIn[]): string[] => {
          return txIn.map((input) => {
            return `${input.txHash}#${input.txId}`
          })
        })(txIn)

        const receivers = ((txOut: TxOut[]): string[] => {
          return txOut.map((output) => {
            let result = `"${output.address}+${output.lovelace}`

            if (output.assets) {
              result += output.assets.map(({ type, quantity }) => `+${quantity} ${type}`).join("")
            }
            // eslint-disable-next-line quotes
            result += '"'

            return result
          })
        })(txOut)

        this.mkdir(this.path("transactions"))

        const outFile = this.path("transactions", `${Date.now().toString()}-raw.json`)

        this.exec([
          "transaction",
          "build-raw",
          ...receivers.map((receiver): string => `--tx-out ${receiver}`),
          ...senders.map((sender): string => `--tx-in ${sender}`),
          "--invalid-before",
          `${invalidBefore || 0}`,
          "--invalid-hereafter",
          `${invalidHereafter || (this.query.tip()?.slot || 0) + 10000}`,
          "--fee",
          `${fee || 0}`,
          ...(mintingScript ? ["--minting-script-file", mintingScript] : []),
          ...(metadataFile ? ["--metadata-json-file", metadataFile] : []),
          ...(mint ? ["--mint", mint] : []),
          "--out-file",
          outFile
        ])

        return outFile
      },
      calculateMinFee: ({ txBody }: { txBody: string }): number | undefined => {
        const response = this.exec([
          "transaction",
          "calculate-min-fee",
          "--tx-body-file",
          txBody,
          "--tx-in-count",
          "1",
          "--tx-out-count",
          "1",
          "--witness-count",
          "2",
          "--genesis",
          this.shelleyGenesis,
          `--${this.network}`
        ])

        return response ? Number(response?.split(" ")[0]) : undefined
      },
      sign: ({ txBody, signingKeys }: { txBody: string; signingKeys: string[] }) => {
        this.mkdir(this.path("transactions"))

        const outFile = this.path("transactions", `${Date.now().toString()}-signed.json`)

        this.exec([
          "transaction",
          "sign",
          "--tx-body-file",
          txBody,
          signingKeys.map((key) => `--signing-key-file ${key}`).join(" "),
          "--out-file",
          outFile
        ])

        return outFile
      },
      submit: ({ tx }: { tx: string }): string | undefined => {
        this.exec(["transaction", "submit", "--tx-file", tx, `--${this.network}`])
        return this.transaction.txid({ txFile: tx })
      },
      txid: ({ txFile }: { txFile: string }): string | undefined => {
        return this.exec(["transaction", "txid", "--tx-file", txFile])?.trim()
      },
      view: ({ txFile }: { txFile: string }): string | undefined => {
        return this.exec(["transaction", "view", "--tx-file", txFile])?.toString()
      },
      policyId: ({ scriptFile }: { scriptFile: string }): string | undefined => {
        return this.exec(["transaction", "policyid", "--script-file", scriptFile])?.trim()
      }
    }
  }

  get cliVersion(): string | undefined {
    return this.exec(["address"])?.match(/(cardano-cli) ([0-9.]+)/)?.[2]
  }

  private exec(args: string[]): string | undefined {
    try {
      const cmd = `${this.binPath} ${args.join(" ")}`

      return execSync(cmd).toString()
    } catch (err) {
      this.throwError(err)
    }
  }

  private path(...args: string[]) {
    return [this.storageDir, ...args].join("/")
  }

  private assertFileExists(path: string) {
    if (!fs.existsSync(path)) {
      this.throwError(new Error(`File not found ${path}. abort\n`))
    }
  }

  private assertNotFileExists(path: string) {
    if (fs.existsSync(path)) {
      this.throwError(new Error(`File exists ${path}. abort\n`))
    }
  }

  private mkdir(dir: string) {
    try {
      if (fs.existsSync(dir)) {
        return
      }

      execSync(`mkdir -p ${dir}`)
    } catch (err) {
      this.throwError(err)
    }
  }

  private throwError(err: Error | string | unknown) {
    if (err instanceof Error) {
      throw err
    }

    throw new Error(err as string)
  }
}
