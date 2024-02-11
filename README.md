node.js bot sample for making swaps on Raydium

Bot saves loaded decimals to decimals.json

Bot swap in buying direction by default, use commented  ***swapSell*** method call to use selling direction

## Setting up
1) Create settings.json with settings: secret key, pool URL, delay in seconds etc.
2) Install @raydium-io/raydium-sdk
```
npm install @raydium-io/raydium-sdk
```
3) Install @solana/spl-token
```
npm install @solana/spl-token
```
4) Install @solana/web3.js
```
npm install @solana/web3.js
```
5) Install node-fetch@2.6.7
```
npm install node-fetch@2.6.7
```
6) Start:
```
node bot.js
```
