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
let placedOrderPrice = 0
var timer
var fails = 0

const exchangeFees = parseFloat(process.env.EXCHANGE_FEES)
const base = parseFloat(process.env.BASE)
const gain = parseFloat(process.env.GAIN)
const restart = parseFloat(process.env.RESTART)
const quantity = parseFloat(process.env.QUANTITY)

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
    let bottom = fs.readFileSync('bottom', 'utf8');
    if(bottom !== '' && bottom !== undefined){
        history.push(parseFloat(bottom))
    }
    if (last !== undefined) {
        if (last.side === 'BUY' && parseFloat(last.executedQty) === 0) {
            console.log('ORDER IS PLACED, WAITING FOR FILL')
            placedOrderPrice = last.price
            position = 'USDT'
            timer = setInterval(function () {
                check()
            }, 1000)
        }
        setInterval(function () {
            analyze()
        }, 1000)
    } else {
        setInterval(function () {
            analyze()
        }, 1000)
    }
}

async function analyze() {
    if(fails < 3){
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
                fs.writeFile('bottom', price, (err) => {});
                history[0] = price
                grow = []
            }
            log('BOTTOM AT ' + history[0] + ' USDT NOW IS ' + history[last] + ' USDT ' + history.length + 'S AGO')
            let delta = history[last] - history[0]
            let percentage = 100 / history[last] * delta
            let expected = base
            log('DELTA IS ' + delta + ' USDT (' + percentage.toFixed(2) + '%). EXPECTED ' + expected + '%')

            if (percentage >= expected && midgrowth < 0.01) {
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
                            let feesBTC = gainBTC / 100 * exchangeFees
                            let orderBTC = parseFloat(gainBTC) + parseFloat(quantity) + parseFloat(feesBTC)
                            let orderPrice = parseFloat(balanceUSDT) / parseFloat(orderBTC)
                            orderPrice = orderPrice
                            position = 'USDT'
                            history = []
                            grow = []
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
        } else {
            log('PRICE USDT NOW IS ' + history[last] + '. ORDER PLACED AT ' + placedOrderPrice)
            let delta = history[last] - placedOrderPrice
            var percentage = 100 / history[last] * delta
            log('PERCENTAGE IS ' + percentage + '%')
            let stop = gain * 3
            if (percentage >= stop) {
                //CANCEL ALL ORDERS
                log('ACTIVATING STOP LOSS!')
                clearInterval(timer)
                fails ++
                binance.cancelOrders("BTCUSDT", (error, response, symbol) => {
                    buyMaxBTC()
                });
            }
        }
    }else{
        log('BOT STALLED, FAILS ARE MAX')
    }
}

function check() {
    binance.allOrders("BTCUSDT", (error, orders, symbol) => {
        let last = orders.length - 1
        let order = orders[last]
        log('CHECKING IF LAST ORDER SI FILLED')
        if (order !== undefined) {
            if (order.cummulativeQuoteQty === order.origQty) {
                position = 'BTC'
                history = []
                grow = []
                clearInterval(timer)
            }
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
        binance.openOrders("BTCUSDT", (error, orders, symbol) => {
            let last = orders.length - 1
            let order = orders[last]
            response(order)
        });
    })
}

function buyBitcoin(btc, price) {
    log('PLACING ORDER OF ' + btc + ' AT PRICE ' + price + ' USDT', 'requests')
    binance.buy("BTCUSDT", btc.toFixed(6), price.toFixed(2), { type: 'LIMIT' }, (error, response) => {
        if (error) {
            log(JSON.stringify(error), 'errors')
            log(JSON.stringify({
                orderBTC: btc.toFixed(6),
                orderPrice: price.toFixed(2)
            }), 'requests')
            price = price - 1
            buyBitcoin(btc, price)
        } else {
            history = []
            position = 'USDT'
            placedOrderPrice = price
            log(JSON.stringify(response), 'exchanges')
            log('BUY ORDER PLACED AT ' + price, 'exchanges')
            timer = setInterval(function () {
                check()
            }, 1000)
        }
    })
}

function buyBitcoinMarket(amount) {
    return new Promise(promise => {
        log('TRYING TO BUY ' + amount + ' BTC')
        binance.marketBuy("BTCUSDT", amount, (error, response) => {
            if (error) {
                amount = amount - 0.001
                //log(error, 'errors')
                buyBitcoinMarket(amount.toFixed(6))
            } else {
                log(response)
                log('BOUGHT BTC ' + amount)
                position = 'BTC'
                history = []
                grow = []
            }
        })
    })
}

function buyMaxBTC() {
    binance.balance(async (error, balances) => {
        if (error) return console.error(error);
        let balance = balances.USDT.available
        log('BALANCE USDT IS ' + balance)
        let price = await getPrice()
        let max = parseFloat(balance) / parseFloat(price)
        max = max.toFixed(6)
        buyBitcoinMarket(max)
    });
}