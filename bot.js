const RaydiumSwap = require('./raydiumSwap');
const fs = require('fs');

async function init(){
    if(!fs.existsSync('settings.json')){
        console.log('settings.json file not found');
        return;
    }
    let jsonFileData = fs.readFileSync('settings.json');
    let settings = JSON.parse(jsonFileData);
    let counter = 0;
    if(settings.wallets.length == 0){
        console.log('No wallets found in settings');
        return;
    }
    //initialize RaydiumSwap, load time consuming data once
    var raySwap = new RaydiumSwap(settings.RPC);
    let resp = await raySwap.loadPool(settings.pool);
    if(resp !== true){
        console.log('Failed to load pool, error: '+resp);
        return;
    }
    console.log('Pool has been loaded');

    //get and save decimals to json file
    let decimals = raySwap.getDecimals();
    saveDecimals(decimals);

    //start processing wallets, use initialized RaydiumSwap object
    run(raySwap, settings,0, settings.wallets.length, 1000*settings.timeout);
}
function run(raySwap, settings, counter, walletsCount, timeout){
    //loop through wallets
    //get wallet data
    let base = settings.wallets[counter].base;
    let quote = settings.wallets[counter].quote;
    let amount= settings.wallets[counter].amount;
    let secretKey = settings.wallets[counter].secret;

    //swap for current wallet
    swap(raySwap, base, quote, amount, secretKey);
    if(counter == walletsCount-1) {
        console.log('All wallets has been processed. Finished.');
        return;
    }
    setTimeout(function() {
        run(raySwap, settings,counter + 1, walletsCount, timeout)
    }, timeout);
}
function saveDecimals(data){
    //check json file for existence
    if(fs.existsSync('decimals.json')) {
        console.log('decimals.json already exists');
        return;
    }
    fs.writeFileSync('decimals.json', JSON.stringify(data));
    console.log('Decimals info has been saved to decimals.json');
}
async function swap(raySwap, base, quote, amount, secretKey)
{
    //set keys for current wallet
    let publicAddress = raySwap.useWallet(Uint8Array.from(secretKey));
    console.log('Processing wallet: '+publicAddress);
    
    //find pool keys for our tokens
    let poolKeys = await raySwap.findPoolKeys(base, quote);
    if (poolKeys === false) {
        console.log("Failed to find pool keys");
        return;
    }
    console.log("Pool info has been found");

    //check decimals
    let fixedAmount = raySwap.checkDecimals(quote, amount);
    if(fixedAmount === false){
        console.log("Error, amount is too small: "+amount);
        return;
    }
    console.log('Amount: '+fixedAmount);

    //perform swap
    let txid = await raySwap.swapBuy(poolKeys, fixedAmount);
    //let txid = await raySwap.swapSell(poolKeys, fixedAmount);
    console.log('https://solscan.io/tx/'+txid);
    console.log("Done");
}
init();
