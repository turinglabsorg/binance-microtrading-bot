require('dotenv').config()
const express = require('express')
var fs = require('fs');
const app = express()
const port = 3000
app.listen(port, () => log(`Microtrading BOT ready.`))

const key = process.env.BINANCE_APIKEY;
const secret = process.env.BINANCE_SECRET;

const binance = require('node-binance-api')().options({
    APIKEY: key,
    APISECRET: secret,
    useServerTime: true
});

let history = []
let position = 'BTC'
let details = {}

const exchangeFees = 0.1
const base = 0.3
const gain = 0.075
const exit = 1.5
const restart = 900

var balanceBTC = 0
var balanceUSDT = 0

async function analyze() {
    if (process.env.TEST === 'false') {
        var price = await getPrice()
    } else {
        var price = fs.readFileSync('.price', 'utf8');
        var stats = {
            price: price
        }
    }

    history.push(price)
    let last = history.length - 1

    if (position === 'BTC') {
        log('OPENED AT ' + history[0] + ' USDT NOW IS ' + history[last] + ' USDT ' + history.length + 'S AGO')
        let delta = history[last] - history[0]
        let percentage = 100 / history[last] * delta
        log('DELTA IS ' + delta + ' USDT (' + percentage.toFixed(2) + '%)')
        let expected = base + exchangeFees

        if (percentage >= expected) {
            log('SELL NOW AT ' + history[last] + 'USDT!', 'exchanges')
            binance.balance((error, balances) => {
                if (error) return console.error(error);
                balanceBTC = parseFloat(balances.BTC.available) - 0.00001
                log("BTC BALANCE IS " + balanceBTC);
                balanceUSDT = balanceBTC * history[last]
                binance.marketSell("BTCUSDT", balanceBTC.toFixed(6))
                let fees = balanceUSDT / 100 * exchangeFees
                balanceUSDT = balanceUSDT - fees
                balanceBTC = 0
                log('BALANCE USDT NOW IS ' + balanceUSDT, 'exchanges')
                //SELL
                details = {
                    price: history[last],
                    time: new Date()
                }
                position = 'USDT'
                history = []
            });
        } else {
            //RESETS THE HISTORY IF NOTHING HAPPENED IN 30 MINUTES
            if (history.length > restart) {
                history = []
            }
        }
    }

    if (position === 'USDT') {
        log('SELL AT ' + details.price + ' USDT NOW IS ' + history[last] + ' USDT ' + history.length + 'S AGO')
        let delta = history[last] - details.price
        let percentage = 100 / history[last] * delta
        log('DELTA IS ' + delta + ' USDT (' + percentage.toFixed(2) + '%)')

        if (percentage < 0 && percentage !== undefined) {
            //BUY
            let relative = percentage * -1
            let expected = gain + exchangeFees
            log('EXPECTED IS ' + expected + ' VS ' + relative)
            if (relative >= expected) {
                log('BUY NOW AT ' + history[last] + ' USDT!', 'exchanges')
                binance.balance((error, balances) => {
                    if (error) return console.error(error);
                    balanceUSDT = parseFloat(balances.USDT.available)
                    balanceBTC = balanceUSDT / history[last]
                    let fees = balanceBTC / 100 * exchangeFees
                    balanceBTC = balanceBTC - fees - 0.000001
                    binance.marketBuy("BTCUSDT", balanceBTC.toFixed(6))
                    log('BALANCE BTC NOW IS ' + balanceBTC, 'exchanges')

                    details = {}
                    position = 'BTC'
                    history = []
                });
            }
        }else if(percentage >= exit){
            binance.balance((error, balances) => {
                if (error) return console.error(error);
                balanceUSDT = parseFloat(balances.USDT.available)
                balanceBTC = balanceUSDT / history[last]
                let fees = balanceBTC / 100 * exchangeFees
                balanceBTC = balanceBTC - fees - 0.000001
                binance.marketBuy("BTCUSDT", balanceBTC.toFixed(6))
                log('BALANCE BTC NOW IS ' + balanceBTC, 'exchanges')

                details = {}
                position = 'BTC'
                history = []
            });
        }

        //TODO: EXIT STRATEGY?
    }
}

setInterval(function () {
    analyze();
}, 1000)

function log(toLog, file = 'log') {
    console.log(toLog)
    var d = new Date().toLocaleString();
    fs.appendFileSync(file, '[' + d + '] ' + toLog + '\n');
}

function getPrice() {
    return new Promise(response => {
        binance.prices('BTCUSDT', (error, ticker) => {
            log("BTC PRICE IS " + ticker['BTCUSDT'] + " USDT");
            response(ticker['BTCUSDT'])
        });
    })
}

function getLastSellPrice() {
    return new Promise(response => {
        binance.allOrders("BTCUSDT", (error, orders, symbol) => {
            let last = orders.length - 1
            let order = orders[last]
            if(order.side === 'SELL'){
                response(order.price)
            }
        });
    })
}