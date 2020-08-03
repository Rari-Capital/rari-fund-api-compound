var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const https = require('https');
const fs = require('fs');
updateAllCompoundAprs();
setInterval(updateAllCompoundAprs, 86400 * 1000);
function getCurrencyUsdRates(currencyCodes) {
    return new Promise((resolve, reject) => {
        https.get('https://api.coingecko.com/api/v3/coins/list', (resp) => {
            let data = '';
            // A chunk of data has been recieved
            resp.on('data', (chunk) => {
                data += chunk;
            });
            // The whole response has been received
            resp.on('end', () => {
                var decoded = JSON.parse(data);
                if (!decoded)
                    return reject("Failed to decode coins list from CoinGecko");
                var currencyCodesByCoinGeckoIds = {};
                for (const currencyCode of currencyCodes) {
                    if (currencyCode === "COMP")
                        currencyCodesByCoinGeckoIds["compound-governance-token"] = "COMP";
                    else if (currencyCode === "REP")
                        currencyCodesByCoinGeckoIds["augur"] = "REP";
                    else
                        currencyCodesByCoinGeckoIds[decoded.find(coin => coin.symbol.toLowerCase() === currencyCode.toLowerCase()).id] = currencyCode;
                }
                https.get('https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&ids=' + Object.keys(currencyCodesByCoinGeckoIds).join('%2C'), (resp) => {
                    let data = '';
                    // A chunk of data has been recieved
                    resp.on('data', (chunk) => {
                        data += chunk;
                    });
                    // The whole response has been received
                    resp.on('end', () => {
                        var decoded = JSON.parse(data);
                        if (!decoded)
                            return reject("Failed to decode USD exchange rates from CoinGecko");
                        var prices = {};
                        for (const key of Object.keys(decoded))
                            prices[currencyCodesByCoinGeckoIds[key]] = ["DAI", "USDC", "USDT", "SAI"].indexOf(currencyCodesByCoinGeckoIds[key]) >= 0 ? 1.0 : decoded[key].usd;
                        resolve(prices);
                    });
                }).on("error", (err) => {
                    reject("Error requesting currency rates from CoinGecko: " + err.message);
                });
            });
        }).on("error", (err) => {
            reject("Error requesting currency rates from CoinGecko: " + err.message);
        });
    });
}
function getCTokens() {
    return new Promise((resolve, reject) => {
        https.get("https://api.compound.finance/api/v2/ctoken", (resp) => {
            let data = '';
            // A chunk of data has been recieved
            resp.on('data', (chunk) => {
                data += chunk;
            });
            // The whole response has been received
            resp.on('end', () => {
                var decoded = JSON.parse(data);
                if (!decoded || !decoded.cToken)
                    return reject("Failed to decode cToken list from Compound API");
                resolve(decoded.cToken);
            });
        }).on("error", (err) => {
            reject("Error requesting cToken list from Compound API: " + err.message);
        });
    });
}
function getMarketHistory(tokenAddress, minTimestamp, maxTimestamp, buckets) {
    return new Promise((resolve, reject) => {
        https.get("https://api.compound.finance/api/v2/market_history/graph?asset=" + tokenAddress + "&min_block_timestamp=" + minTimestamp.toString() + "&max_block_timestamp=" + maxTimestamp.toString() + "&num_buckets=" + buckets.toString(), (resp) => {
            let data = '';
            // A chunk of data has been recieved
            resp.on('data', (chunk) => {
                data += chunk;
            });
            // The whole response has been received
            resp.on('end', () => {
                var decoded = JSON.parse(data);
                if (!decoded)
                    return reject("Failed to decode market history from Compound API");
                resolve(decoded);
            });
        }).on("error", (err) => {
            reject("Error requesting market history from Compound API: " + err.message);
        });
    });
}
function getApyFromComp(currencyCode, cTokens, prices) {
    // Get currency APY and total yearly interest
    var currencyUnderlyingSupply = 0;
    var currencyBorrowUsd = 0;
    var totalBorrowUsd = 0;
    for (const cToken of cTokens) {
        var underlyingBorrow = cToken.total_borrows * cToken.exchange_rate;
        var borrowUsd = underlyingBorrow * prices[cToken.underlying_symbol];
        if (cToken.underlying_symbol === currencyCode) {
            currencyUnderlyingSupply = cToken.total_supply * cToken.exchange_rate;
            currencyBorrowUsd = borrowUsd;
        }
        totalBorrowUsd += borrowUsd;
    }
    // Get APY from COMP per block for this currency
    var compPerBlock = 0.5;
    var marketCompPerBlock = compPerBlock * (currencyBorrowUsd / totalBorrowUsd);
    var marketSupplierCompPerBlock = marketCompPerBlock / 2;
    var marketSupplierCompPerBlockPerUsd = marketSupplierCompPerBlock / currencyUnderlyingSupply; // Assumes that the value of currencyCode is $1
    var marketSupplierUsdFromCompPerBlockPerUsd = marketSupplierCompPerBlockPerUsd * prices["COMP"];
    return marketSupplierUsdFromCompPerBlockPerUsd * 2102400;
}
function updateAllCompoundAprs() {
    return __awaiter(this, void 0, void 0, function* () {
        // Get cTokens
        const cTokens = yield getCTokens();
        // Get cToken USD prices
        var currencyCodes = ["COMP"];
        for (const cToken of cTokens)
            currencyCodes.push(cToken.underlying_symbol);
        var prices = yield getCurrencyUsdRates(currencyCodes); // TODO: Get real USD prices, not DAI prices
        // Get market history for each cToken
        var epoch = Math.floor((new Date()).getTime() / 1000);
        var epochOneYearAgo = epoch - (86400 * 365);
        var compoundData = {};
        for (const cToken of cTokens) {
            const history = yield getMarketHistory(cToken.token_address, epochOneYearAgo, epoch, 365);
            for (var i = 0; i < history.supply_rates.length; i++) {
                var rateEpoch = Math.round(history.supply_rates[i].block_timestamp / 86400) * 86400 * 1000;
                if (compoundData[rateEpoch] === undefined)
                    compoundData[rateEpoch] = [];
                compoundData[rateEpoch].push({
                    underlying_symbol: cToken.underlying_symbol,
                    supply_rate: history.supply_rates[i].rate,
                    total_supply: history.total_supply_history[i].total.value,
                    total_borrows: history.total_borrows_history[i].total.value,
                    exchange_rate: history.exchange_rates[i].rate
                });
            }
        }
        var compoundApys = {};
        var epochs = Object.keys(compoundData).sort();
        for (var i = 0; i < epochs.length; i++) {
            compoundApys[epochs[i]] = {};
            for (const cToken of compoundData[epochs[i]])
                if (["DAI", "USDC", "USDT"].indexOf(cToken.underlying_symbol) >= 0)
                    compoundApys[epochs[i]][cToken.underlying_symbol] = [cToken.supply_rate, parseInt(epochs[i]) >= 1592179200000 ? getApyFromComp(cToken.underlying_symbol, compoundData[epochs[i]], prices) : 0];
        }
        try {
            yield fs.writeFile(process.env.COMPOUND_APRS_SAVE_PATH, JSON.stringify(compoundApys));
        }
        catch (error) {
            return console.error("Failed to write Compound APRs to file:", error);
        }
        console.log("Successfully saved Compound APRs to file");
    });
}
//# sourceMappingURL=index.js.map