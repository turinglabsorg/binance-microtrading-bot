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
const base = 0.2
const gain = 0.03
const exit = 1.5
const restart = 3600
const quantity = 0.1

var balanceBTC = 0
var balanceUSDT = 0

async function init(){
    let last = await getLastOrder()
    if(last.side === 'SELL'){
        position = 'USDT'
        let sellprice = last.cummulativeQuoteQty / last.executedQty
        history.push(sellprice)
        details = {
            price: sellprice,
            time: new Date()
        }
        balanceUSDT = await getLastSellAmount()
    }
    analyze()
}

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
        if (price < history[0]) {
            history[0] = price
        }
        log('BOTTOM AT ' + history[0] + ' USDT NOW IS ' + history[last] + ' USDT ' + history.length + 'S AGO')
        let delta = history[last] - history[0]
        let percentage = 100 / history[last] * delta
        log('DELTA IS ' + delta + ' USDT (' + percentage.toFixed(2) + '%)')
        let expected = base + exchangeFees

        if (percentage >= expected) {
            log('SELL NOW AT ' + history[last] + 'USDT!', 'exchanges')
            balanceUSDT = quantity * history[last]
            if (process.env.TEST === 'false') {
                binance.marketSell("BTCUSDT", quantity.toFixed(6))
            }
            balanceUSDT = await getLastSellAmount()
            let sellprice = await getLastSellPrice()
            log('BALANCE USDT NOW IS ' + balanceUSDT, 'exchanges')
            //SELL
            details = {
                price: sellprice,
                time: new Date()
            }
            position = 'USDT'
            history = []
        } else {
            //RESETS THE HISTORY IF NOTHING HAPPENED
            let negative = expected * -1
            if (history.length > restart || percentage <= negative) {
                history = []
            }
        }
    }

    if (position === 'USDT') {
        log('SELL AT ' + details.price + ' USDT NOW IS ' + history[last] + ' USDT ' + history.length + 'S AGO')
        let delta = history[last] - details.price
        let percentage = 100 / history[last] * delta
        let relative = percentage * -1
        log('DELTA IS ' + delta + ' USDT (' + percentage.toFixed(2) + '%)')

        if (percentage < 0 && percentage !== undefined) {
            //BUY
            let expected = gain + exchangeFees
            log('EXPECTED % IS ' + expected + ' VS ' + relative)

            balanceBTC = balanceUSDT / history[last]
            let fees = balanceBTC / 100 * exchangeFees
            balanceBTC = balanceBTC - fees
            let gainBTC = quantity / 100 * gain
            let expectedBUY = gainBTC + quantity
            let toBuy = balanceBTC + fees - 0.00001
            log('BALANCE USDT IS ' + balanceUSDT + '. EXPECTED BUY IN BTC IS ' + expectedBUY + '. TRYING TO BUY ' + balanceBTC)

            if (relative >= expected) {
                log('BUY NOW AT ' + history[last] + ' USDT!', 'exchanges')
                if (balanceBTC >= expectedBUY) {
                    if (process.env.TEST === 'false') {
                        binance.marketBuy("BTCUSDT", toBuy.toFixed(6))
                    }
                    log('BALANCE BTC NOW IS ' + balanceBTC, 'exchanges')
                    details = {}
                    position = 'BTC'
                    history = []
                } else {
                    log('TRYING TO BUY LESS BTC THEN I SELL FIRST')
                }
            }
        } else if (percentage >= exit) { /*
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
            }); */
        }

        //TODO: EXIT STRATEGY?
    }
}

setInterval(function () {
    init()
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

function getLastSellAmount() {
    return new Promise(response => {
        binance.allOrders("BTCUSDT", (error, orders, symbol) => {
            let last = orders.length - 1
            let order = orders[last]
            if (order.side === 'SELL') {
                response(order.cummulativeQuoteQty)
            } else {
                let last = orders.length - 2
                let order = orders[last]
                response(order.cummulativeQuoteQty)
            }
        });
    })
}

function getLastSellPrice() {
    return new Promise(response => {
        binance.allOrders("BTCUSDT", (error, orders, symbol) => {
            let last = orders.length - 1
            let order = orders[last]
            if (order.side === 'SELL') {
                let sellprice = order.cummulativeQuoteQty / order.executedQty
                response(sellprice)
            } 
        });
    })
}

function getLastOrder() {
    return new Promise(response => {
        binance.allOrders("BTCUSDT", (error, orders, symbol) => {
            let last = orders.length - 1
            let order = orders[last]
            response(order)
        });
    })
}