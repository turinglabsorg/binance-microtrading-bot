require('dotenv').config()
const express = require('express')
var fs = require('fs');
const app = express()
const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
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
let grow = []
let position = 'BTC'
var timer

const exchangeFees = parseFloat(process.env.EXCHANGE_FEES)
const base = parseFloat(process.env.BASE)
const gain = parseFloat(process.env.GAIN)
const exit = parseFloat(process.env.EXIT)
const restart = parseFloat(process.env.RESTART)
const quantity = parseFloat(process.env.QUANTITY)

var balanceBTC = 0
var balanceUSDT = 0

app.post('/sell', (req, res) => {
    let amount = parseFloat(req.body.amount).toFixed(6)
    binance.marketSell("BTCUSDT", parseFloat(amount).toFixed(6), (error, response) => {
        if (error) {
            res.send(error)
        } else {
            res.send(response)
        }
    })
})

app.post('/buy', async (req, res) => {
    var price = await getPrice()
    var max = await getLastSellAmount()
    balanceBTC = max / price
    binance.marketBuy("BTCUSDT", parseFloat(toBuy).toFixed(6), (error, response) => {
        if (error) {
            res.send(error)
        } else {
            res.send(response)
        }
    })
})


async function init() {
    let last = await getLastOrder()
    if (last.side === 'BUY' && last.executedQty === 0) {
        position = 'USDT'
        timer = setInterval(function () {
            check()
        }, 1000)
    }
    setInterval(function () {
        analyze()
    }, 1000)
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
    let pre = history.length - 2
    let step = history[last] - history[pre]
    let percStep = 100 / history[last] * step
    percStep = percStep.toFixed(2)
    if (percStep !== 'NaN') {
        grow.push(percStep)
    }
    console.log('STEP IS ' + percStep + '%')
    var sum = 0
    for (var x = 0; x < grow.length; x++) {
        sum += parseFloat(grow[x])
    }
    var midgrowth = sum / grow.length
    log('MIDGROWTH IS ' + midgrowth.toFixed(3) + '%')

    if (position === 'BTC') {
        if (price < history[0]) {
            history[0] = price
            grow = []
        }
        log('BOTTOM AT ' + history[0] + ' USDT NOW IS ' + history[last] + ' USDT ' + history.length + 'S AGO')
        let delta = history[last] - history[0]
        let percentage = 100 / history[last] * delta
        let expected = base + exchangeFees
        log('DELTA IS ' + delta + ' USDT (' + percentage.toFixed(2) + '%). EXPECTED ' + expected + '%')

        if (percentage >= expected && midgrowth < 0.1) {
            log('SELL NOW AT ' + history[last] + 'USDT!', 'exchanges')
            if (process.env.TEST === 'false') {
                binance.marketSell("BTCUSDT", quantity.toFixed(6), async (error, response) => {
                    if (error) {
                        log(JSON.stringify(error), 'errors')
                    } else {
                        balanceUSDT = await getLastSellAmount()
                        log('BALANCE USDT NOW IS ' + balanceUSDT, 'exchanges')
                        log(JSON.stringify(response), 'exchanges')
                        let gainBTC = quantity / 100 * gain
                        let orderBTC = parseFloat(gainBTC) + parseFloat(quantity)
                        let orderPrice = parseFloat(balanceUSDT) / parseFloat(orderBTC)
                        var bought = 'N'
                        position = 'USDT'
                        history = []
                        grow = []
                        var nu = 0
                        console.log('PLACING ORDER OF ' + orderBTC + ' AT PRICE ' + orderPrice + ' USDT')
                        buyBitcoin(orderBTC, orderPrice)
                    }
                })
            } else {
                details = {
                    price: sellprice,
                    time: new Date()
                }
                position = 'USDT'
                history = []
                grow = []
            }
        } else {
            //RESETS THE HISTORY IF NOTHING HAPPENED
            let negative = expected * -1
            if (history.length > restart || percentage <= negative) {
                history = []
                grow = []
            }
        }
    }

}

function check() {
    binance.allOrders("BTCUSDT", (error, orders, symbol) => {
        let last = orders.length - 1
        let order = orders[last]
        if (order.side === 'BUY') {
            clearInterval(timer)
            history = []
            grow = []
            position = 'BTC'
        }
    });
}

init()

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

function buyBitcoin(btc, price){
    binance.buy("BTCUSDT", btc.toFixed(6), price.toFixed(2), { type: 'LIMIT' }, (error, response) => {
        if (error) {
            log(JSON.stringify(error), 'errors')
            log(JSON.stringify({
                orderBTC: btc.toFixed(6),
                orderPrice: price.toFixed(2)
            }), 'requests')
            price = price - 0.01
            buyBitcoin(btc, price)
        } else {
            bought = 'Y'
            history = []
            log(JSON.stringify(response), 'exchanges')
            log('BUY ORDER PLACED AT ' + price, 'exchanges')
            timer = setInterval(function () {
                check()
            }, 1000)
        }
    })
}