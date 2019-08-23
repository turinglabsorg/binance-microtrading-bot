#!/bin/bash

#INSTALL NODEJS
curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install pm2 -g

#DOWNLOAD DEPENDENCIES
npm install

#START PM2 PROCESS
pm2 start bot.js --watch --name binance-bot