import { execSync } from "child_process"
import * as fs from "fs"
import path from "path"

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

export class CardanoCli {
  private binPath: string
  private storageDir: string
  private network: string
  private shelleyGenesis: string

  constructor(options: CardanoCliOptions) {
    this.binPath = options.binPath || "cardano-cli"
    this.storageDir = options.storageDir || path.resolve(__dirname, "storage")
    this.network = options.network || "mainnet"
    this.shelleyGenesis = options.shelleyGenesis
  }

  get address() {
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
      }
    }
  }

  get stakeAddress() {
    return {
      geyGen: ({ account, fileName }: AddressKeyGenOptions) => {
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

  get query() {
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

  get transaction() {
    return {
      buildRaw: ({ txIn, txOut, fee, invalidBefore, invalidHereafter }: TransactionBuildRawOptions) => {
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
          `${invalidHereafter || this.query.tip().slot + 10000}`,
          "--fee",
          `${fee || 0}`,
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
          this.path(this.shelleyGenesis),
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
      submit: ({ tx }: { tx: string }) => {
        this.exec(["transaction", "submit", "--tx-file", tx, `--${this.network}`])
        this.transaction.txid({ txFile: tx })
      },
      txid: ({ txFile }: { txFile: string }) => {
        return this.exec(["transaction", "txid", "--tx-file", txFile])
      },
      view: ({ txBody }: { txBody: string; tx: string }) => {
        this
      }
    }
  }

  get cliVersion(): string | undefined {
    return this.exec(["address"])?.match(/(cardano-cli) ([0-9.]+)/)?.[2]
  }

  private exec(args: string[]): string | undefined {
    try {
      const cmd = `${this.binPath} ${args.join(" ")}`

      console.log(`#####################`)
      console.log(cmd)
      console.log(`#####################`)

      return execSync(cmd).toString()
    } catch (err) {
      this.print(err)
      this.exit(1)
    }
  }

  private path(...args: string[]) {
    return [this.storageDir, ...args].join("/")
  }

  private assertFileExists(path: string) {
    if (!fs.existsSync(path)) {
      this.print(`File not found ${path}. abort\n`)
      this.exit(1)
    }
  }

  private assertNotFileExists(path: string) {
    if (fs.existsSync(path)) {
      this.print(`File exists ${path}. abort\n`)
      this.exit(1)
    }
  }

  private print(output: Error | string | unknown) {
    if (output instanceof Error) {
      process.stderr.write(`${output.stack}`)
      return
    }

    process.stdout.write(output as string)
  }

  private mkdir(dir: string) {
    try {
      if (fs.existsSync(dir)) {
        return
      }

      execSync(`mkdir -p ${dir}`)
    } catch (err) {
      this.exit(1)
    }
  }

  private exit(code = 0) {
    process.exit(code)
  }
}
