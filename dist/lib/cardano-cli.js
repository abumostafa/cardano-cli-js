"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CardanoCli = void 0;
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
class CardanoCli {
    constructor(options) {
        this.binPath = options.binPath;
        this.storageDir = options.storageDir;
        this.network = options.network || "mainnet";
        this.shelleyGenesis = options.shelleyGenesis || "testnet-shelley-genesis.json";
    }
    get address() {
        return {
            build: ({ account, fileName, signing = false }) => {
                let stakeVkey = "";
                const paymentVkey = this.path("accounts", account, `${fileName}.payment.vkey`);
                this.assertFileExists(paymentVkey);
                if (signing) {
                    stakeVkey = this.path("accounts", account, `${fileName}.stake.vkey`);
                    this.assertFileExists(stakeVkey);
                }
                const outputFile = this.path("accounts", account, `${fileName}.payment.addr`);
                this.assertNotFileExists(outputFile);
                this.exec([
                    "address",
                    "build",
                    "--payment-verification-key-file",
                    paymentVkey,
                    ...(stakeVkey ? ["--stake-verification-key-file", stakeVkey] : []),
                    "--out-file",
                    outputFile,
                    `--${this.network}`
                ]);
                return outputFile;
            },
            keyGen: ({ account, fileName }) => {
                const paymentVkey = this.path("accounts", account, `${fileName}.payment.vkey`);
                const paymentSkey = this.path("accounts", account, `${fileName}.payment.skey`);
                this.assertNotFileExists(paymentVkey);
                this.assertNotFileExists(paymentSkey);
                this.mkdir(this.path("accounts", account));
                this.exec(["address", "key-gen", "--verification-key-file", paymentVkey, "--signing-key-file", paymentSkey]);
                return { vkey: paymentVkey, skey: paymentSkey };
            }
        };
    }
    get stakeAddress() {
        return {
            geyGen: ({ account, fileName }) => {
                const stakeVkey = this.path("accounts", account, `${fileName}.stake.vkey`);
                const stakeSkey = this.path("accounts", account, `${fileName}.stake.skey`);
                this.assertNotFileExists(stakeVkey);
                this.assertNotFileExists(stakeSkey);
                this.mkdir(this.path("accounts", account));
                this.exec(["stake-address", "key-gen", "--verification-key-file", stakeVkey, "--signing-key-file", stakeSkey]);
                return { vkey: stakeVkey, skey: stakeSkey };
            }
        };
    }
    get query() {
        return {
            utxo: ({ address }) => {
                const utxos = this.exec(["query", "utxo", "--address", address, `--${this.network}`]);
                return utxos === null || utxos === void 0 ? void 0 : utxos.split("\n").slice(2).map((utxo) => {
                    const txInfo = utxo.match(/^([a-z0-9]+)\s+([0-9]*)\s+([0-9]+)\s+([a-z]+).*\s+\+\s+(TxOutDatum[a-z]+)/im);
                    if (!(txInfo === null || txInfo === void 0 ? void 0 : txInfo.length))
                        return;
                    const result = {
                        txHash: txInfo[1],
                        txId: Number(txInfo[2]),
                        txDatum: txInfo[5],
                        lovelace: Number(txInfo[3]),
                        assets: []
                    };
                    const assetsInfo = utxo.match(/(?:\s+\+\s+([0-9]+)\s+([0-9a-z.]+))/gim);
                    if (!(assetsInfo === null || assetsInfo === void 0 ? void 0 : assetsInfo.length))
                        return result;
                    result.assets = assetsInfo
                        .map((asset) => {
                        const parts = asset.match(/\+\s+([0-9]+)\s+([0-9a-z.]+)/i);
                        if (!parts)
                            return undefined;
                        const [, quantity, type] = parts;
                        return { type, quantity: Number(quantity) };
                    })
                        .filter((asset) => Boolean(asset));
                    return result;
                }).filter(Boolean);
            },
            tip: () => JSON.parse(this.exec(["query", "tip", `--${this.network}`]) || ""),
            protocolParameters: (options = { fileName: "protocol-parameters" }) => {
                this.mkdir(this.path("protocol"));
                const outFile = this.path("protocol", `${options.fileName}.json`);
                this.exec(["query", "protocol-parameters", `--${this.network}`, "--out-file", outFile]);
                return outFile;
            }
        };
    }
    get transaction() {
        return {
            buildRaw: ({ txIn, txOut, fee, invalidBefore, invalidHereafter }) => {
                const senders = ((txIn) => {
                    return txIn.map((input) => {
                        return `${input.txHash}#${input.txId}`;
                    });
                })(txIn);
                const receivers = ((txOut) => {
                    return txOut.map((output) => {
                        let result = `"${output.address}+${output.lovelace}`;
                        if (output.assets) {
                            result += output.assets.map(({ type, quantity }) => `+${quantity} ${type}`).join("");
                        }
                        result += '"';
                        return result;
                    });
                })(txOut);
                this.mkdir(this.path("transactions"));
                const outFile = this.path("transactions", `${Date.now().toString()}-raw.json`);
                this.exec([
                    "transaction",
                    "build-raw",
                    ...receivers.map((receiver) => `--tx-out ${receiver}`),
                    ...senders.map((sender) => `--tx-in ${sender}`),
                    "--invalid-before",
                    `${invalidBefore || 0}`,
                    "--invalid-hereafter",
                    `${invalidHereafter || this.query.tip().slot + 10000}`,
                    "--fee",
                    `${fee || 0}`,
                    "--out-file",
                    outFile
                ]);
                return outFile;
            },
            calculateMinFee: ({ txBody }) => {
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
                ]);
                return response ? Number(response === null || response === void 0 ? void 0 : response.split(" ")[0]) : undefined;
            },
            sign: ({ txBody, signingKeys }) => {
                this.mkdir(this.path("transactions"));
                const outFile = this.path("transactions", `${Date.now().toString()}-signed.json`);
                this.exec([
                    "transaction",
                    "sign",
                    "--tx-body-file",
                    txBody,
                    signingKeys.map((key) => `--signing-key-file ${key}`).join(" "),
                    "--out-file",
                    outFile
                ]);
                return outFile;
            },
            submit: ({ tx }) => {
                this.exec(["transaction", "submit", "--tx-file", tx, `--${this.network}`]);
                this.transaction.txid({ txFile: tx });
            },
            txid: ({ txFile }) => {
                return this.exec(["transaction", "txid", "--tx-file", txFile]);
            },
            view: ({ txBody }) => {
                this;
            }
        };
    }
    get cliVersion() {
        var _a, _b;
        return (_b = (_a = this.exec(["address"])) === null || _a === void 0 ? void 0 : _a.match(/(cardano-cli) ([0-9.]+)/)) === null || _b === void 0 ? void 0 : _b[2];
    }
    exec(args) {
        try {
            const cmd = `${this.binPath} ${args.join(" ")}`;
            console.log(`#####################`);
            console.log(cmd);
            console.log(`#####################`);
            return (0, child_process_1.execSync)(cmd).toString();
        }
        catch (err) {
            this.print(err);
            this.exit(1);
        }
    }
    path(...args) {
        return [this.storageDir, ...args].join("/");
    }
    assertFileExists(path) {
        if (!fs.existsSync(path)) {
            this.print(`File not found ${path}. abort\n`);
            this.exit(1);
        }
    }
    assertNotFileExists(path) {
        if (fs.existsSync(path)) {
            this.print(`File exists ${path}. abort\n`);
            this.exit(1);
        }
    }
    print(output) {
        if (output instanceof Error) {
            process.stderr.write(`${output.stack}`);
            return;
        }
        process.stdout.write(output);
    }
    mkdir(dir) {
        try {
            if (fs.existsSync(dir)) {
                return;
            }
            (0, child_process_1.execSync)(`mkdir -p ${dir}`);
        }
        catch (err) {
            this.exit(1);
        }
    }
    exit(code = 0) {
        process.exit(code);
    }
}
exports.CardanoCli = CardanoCli;
