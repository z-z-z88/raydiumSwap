const web3 = require("@solana/web3.js");
const spl = require("@solana/spl-token");
const raydium = require("@raydium-io/raydium-sdk");
const fetch = require("node-fetch");
class RaydiumSwap{
    connection;
    keypair;
    publicKey;
    pool;
    decimals;
    constructor(RPC) {
        this.connection = new web3.Connection(RPC, "confirmed");
    }
    useWallet(secret){
        this.keypair = web3.Keypair.fromSecretKey(secret);
        this.publicKey = this.keypair.publicKey;
        return this.keypair.publicKey.toBase58();
    }
    async loadPool(poolURL){
        let resp = await fetch(poolURL);
        if(!resp.ok){
            return resp.status;
        }
        this.pool = await resp.json();
        return true;
    }
    async findPoolKeys(base, quote){
        let LP_pool = this.pool.official.find((element)=>{
            if(element.baseMint === base && element.quoteMint === quote)
                return true;
            else
                return false;
        });
        if(LP_pool === undefined) return false;

        return raydium.jsonInfo2PoolKeys(LP_pool);
    }

    getDecimals(){
        this.decimals = {};
        this.pool.official.forEach((element)=>
        {
            this.decimals[element.baseMint] = element.baseDecimals;
            this.decimals[element.quoteMint] = element.quoteDecimals;
        });
        return this.decimals;
    }

    checkDecimals(mint, amount){
        let decimals = this.decimals[mint];
        let pos = amount.indexOf('.')
        if(pos === -1) return parseInt(amount);//quite big number, ok
        let tail = amount.substr(pos+1);
        if(tail.length <= decimals) return parseFloat(amount);//fit in decimals
        //have a lot of decimals
        tail = tail.substr(0, decimals);//cut
        if(parseInt(tail) == 0) return false;//amount is too small
        return parseFloat('0.'+tail);//amount is big enough, but we cut long tail
    }
    async swapSell(poolKeys, amount){
        let cAmount = await this.calcAmountSell(poolKeys, amount);
        let maxAmountIn = cAmount.maxAmountIn;
        let amountOut = cAmount.amountOut;

        let userTokens = await this.getUserTokens();

        const swapTransaction = await raydium.Liquidity.makeSwapInstructionSimple({
            connection: this.connection,
            makeTxVersion: 0,
            poolKeys: {
                ...poolKeys,
            },
            userKeys: {
                tokenAccounts: userTokens,
                owner: this.publicKey,
            },
            amountIn: maxAmountIn,
            amountOut: amountOut,
            fixedSide: 'out',
            config: {
                bypassAssociatedCheck: false,
            },
            computeBudgetConfig: {
                microLamports: 200000,
            },
        });

        const recentBlockhashForSwap = await this.connection.getLatestBlockhash();
        const instructions = swapTransaction.innerTransactions[0].instructions.filter(Boolean);

        const versionedTransaction = new web3.VersionedTransaction(
            new web3.TransactionMessage({
                payerKey: this.publicKey,
                recentBlockhash: recentBlockhashForSwap.blockhash,
                instructions: instructions,
            }).compileToV0Message()
        );

        versionedTransaction.sign([this.keypair]);

        const txid = await this.connection.sendTransaction(versionedTransaction, {
            skipPreflight: true,
            maxRetries: 2,
        });
        return txid;
    }
    async swapBuy(poolKeys, amount){
        let cAmount = await this.calcAmountBuy(poolKeys, amount);
        let minAmountOut = cAmount.minAmountOut;
        let amountIn = cAmount.amountIn;
        let userTokens = await this.getUserTokens();

        const swapTransaction = await raydium.Liquidity.makeSwapInstructionSimple({
            connection: this.connection,
            makeTxVersion: 0,
            poolKeys: {
                ...poolKeys,
            },
            userKeys: {
                tokenAccounts: userTokens,
                owner: this.publicKey,
            },
            amountIn: amountIn,
            amountOut: minAmountOut,
            fixedSide: 'in',
            config: {
                bypassAssociatedCheck: false,
            },
            computeBudgetConfig: {
                microLamports: 200000,
            },
        });

        const recentBlockhashForSwap = await this.connection.getLatestBlockhash();
        const instructions = swapTransaction.innerTransactions[0].instructions.filter(Boolean);

        const versionedTransaction = new web3.VersionedTransaction(
            new web3.TransactionMessage({
                payerKey: this.publicKey,
                recentBlockhash: recentBlockhashForSwap.blockhash,
                instructions: instructions,
            }).compileToV0Message()
        );

        versionedTransaction.sign([this.keypair]);

        const txid = await this.connection.sendTransaction(versionedTransaction, {
            skipPreflight: true,
            maxRetries: 2,
        });
        return txid;
    }
    async calcAmountBuy(poolKeys, amount){
        const poolInfo = await raydium.Liquidity.fetchInfo({ connection: this.connection, poolKeys: poolKeys });

        let outMint = poolKeys.baseMint;
        let outDecimals = poolInfo.baseDecimals;
        let inMint = poolKeys.quoteMint;
        let inDecimals = poolInfo.quoteDecimals;

        let inToken = new raydium.Token(raydium.TOKEN_PROGRAM_ID, inMint, inDecimals);
        let amountIn = new raydium.TokenAmount(inToken, amount, false);
        let outToken = new raydium.Token(raydium.TOKEN_PROGRAM_ID, outMint, outDecimals);
        let slippage = new raydium.Percent(4, 100); //4%

        let return_data =  raydium.Liquidity.computeAmountOut({
            poolKeys: poolKeys,
            poolInfo: poolInfo,
            amountIn: amountIn,
            currencyOut: outToken,
            slippage: slippage
        });
        return_data.amountIn = amountIn;
        return return_data;
    }
    async calcAmountSell(poolKeys, amount){//amount in quote
        const poolInfo = await raydium.Liquidity.fetchInfo({ connection: this.connection, poolKeys: poolKeys });

        var inMint = poolKeys.baseMint;
        var inDecimals = poolInfo.baseDecimals;
        var outMint = poolKeys.quoteMint;
        var outDecimals = poolInfo.quoteDecimals;

        let inToken = new raydium.Token(raydium.TOKEN_PROGRAM_ID, inMint, inDecimals);
        let outToken = new raydium.Token(raydium.TOKEN_PROGRAM_ID, outMint, outDecimals);
        let amountOut = new raydium.TokenAmount(outToken, amount, false);
        let slippage = new raydium.Percent(4, 100); //4%

        let return_data =  raydium.Liquidity.computeAmountIn({
            poolKeys: poolKeys,
            poolInfo: poolInfo,
            amountOut: amountOut,
            currencyIn: inToken,
            slippage: slippage
        });
        return_data.amountOut = amountOut;
        return return_data;
    }
    async getUserTokens(){
        let userTokens = await this.connection.getTokenAccountsByOwner(this.publicKey,  {
            programId: spl.TOKEN_PROGRAM_ID
        });
        return userTokens.value.map((element) => ({
            pubkey: element.pubkey,
            programId: element.account.owner,
            accountInfo: raydium.SPL_ACCOUNT_LAYOUT.decode(element.account.data),
        }));
    }
}
module.exports = RaydiumSwap;