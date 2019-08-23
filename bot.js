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
let balanceBTC = 0.1
let balanceUSDT = 0
let exchangeFees = 0.1
let base = 0.5
let gain = 0.25

async function getStats() {
    if(process.env.TEST === 'false'){
        var price = await getPrice()
    }else{
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
            balanceUSDT = balanceBTC * history[last]
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
            //TODO: LINK SELL TO BINANCE
        }
    }

    if (position === 'USDT') {
        log('OPENED AT ' + history[0] + ' USDT NOW IS ' + history[last] + ' USDT ' + history.length + 'S AGO')
        let delta = history[last] - details.price
        let percentage = 100 / history[last] * delta
        log('DELTA IS ' + delta + ' USDT (' + percentage.toFixed(2) + '%)')

        if (percentage < 0 && percentage !== undefined) {
            //BUY
            let relative = percentage * -1
            let expected = gain + exchangeFees + base
            if (relative >= expected) {
                log('BUY NOW AT ' + history[last] + ' USDT!', 'exchanges')
                balanceBTC = balanceUSDT / history[last]
                let fees = balanceBTC / 100 * exchangeFees
                balanceBTC = balanceBTC - fees
                log('BALANCE BTC NOW IS ' + balanceBTC, 'exchanges')

                details = {}
                position = 'BTC'
                history = []
                //TODO: LINK BUY TO BINANCE
            }
        }

        //TODO: EXIT STRATEGY?
    }
}

setInterval(function () {
    getStats();
}, 2000)

function log(toLog, file = 'log') {
    console.log(toLog)
    var d = new Date().toLocaleString();
    fs.appendFileSync(file, '[' + d + '] ' + toLog + '\n');
}

function getPrice(){
    return new Promise(response => {
        binance.prices('BTCUSDT', (error, ticker) => {
            log("BTC PRICE IS " + ticker['BTCUSDT'] + " USDT");
            response(ticker['BTCUSDT'])
        });
    })
}