"use strict";
const Env = use("Env");
const { Command } = require("@adonisjs/ace");

/**
 * How to use?
 * open terminal and type below command:
   adonis encrypt:ton-private "your 24 words mnemonic..."
 */
class EncryptTonPrivateKey extends Command {
    /**
     * The command signature defines the name of the command and the required arguments.
     */
    static get signature() {
        return "encrypt:ton-private {privateKey: The private key to encrypt}";
    }

    /**
     * The description provides details about the command for the help menu.
     */
    static get description() {
        return "Encrypts a provided Ton Private Key using a decryption key.";
    }

    /**
     * Handle method processes the logic of the command.
     */
    async handle(args, options) {
        const { privateKey } = args; // Destructure the privateKey argument

        if (!privateKey) {
            this.error("You must provide a private key to encrypt.");
            return;
        }
        // Encrypt the private key
        const PrivateKeyEncryptor = require("simple-encryptor")(
            Env.get("PRIVATE_WALLET_DECRYPTION_KEY", "aaaaaaaaaaaaaaaaaaaa")
        ).encrypt;

        const privateKeyEncrypted = PrivateKeyEncryptor(privateKey);
        this.success("Encrypted Private Key: " + privateKeyEncrypted);

        // const PrivateKeyDecryptor = require("simple-encryptor")(
        //     Env.get("PRIVATE_WALLET_DECRYPTION_KEY")
        //         ? Env.get("PRIVATE_WALLET_DECRYPTION_KEY")
        //         : "aaaaaaaaaaaaaaaaaaaa"
        // ).decrypt;
        
        // console.log("Decrypt again: ", PrivateKeyDecryptor(privateKeyEncrypted));
        
        process.exit();
    }
}

module.exports = EncryptTonPrivateKey;
